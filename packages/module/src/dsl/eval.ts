/**
 * The DSL evaluator.
 *
 * Every system in the game routes its logic through these three entry points:
 * {@link evalExpr}, {@link evalPredicate}, and {@link evalEffects}. Evaluation
 * is pure — effects produce intents rather than mutating state — and every
 * source of chance comes from the injected RNG, so a replay reproduces exactly.
 *
 * Errors carry a path trace (`then[1].damage.amount`) because these messages
 * are read by content authors in the editor, not by engine developers.
 */

import { parseDice, rollDice } from '@dm/core';
import type { Effect, EffectOp, Expr, Predicate, Rule, Value } from './types.js';

/** Minimal RNG surface, so any compatible generator can drive evaluation. */
export interface DslRng {
  nextInt(min: number, max: number): number;
  nextFloat(): number;
}

/** The readable world, as nested plain data. `ref` paths walk this. */
export type Scope = { readonly [k: string]: Value };

export interface EvalContext {
  readonly scope: Scope;
  readonly rng: DslRng;
  /**
   * Namespaces where a missing path means "not yet", not "typo".
   *
   * `ref` throws on an unknown path by default, because a silent zero is the
   * worst failure mode for a data-driven game — an ability quietly stops
   * working and nothing says why. But some namespaces are *open*: a flag that
   * has never been set, a quest never started, a deed nobody remembers. For
   * those, absence is ordinary and reads as null.
   *
   * Structural paths — `actor.attr.might`, `actor.derived.guard` — stay strict,
   * because there a missing key really is a mistake.
   */
  readonly openNamespaces?: readonly string[];
}

export class DslError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(path ? `${message} (at ${path})` : message);
    this.name = 'DslError';
    this.path = path;
  }
}

/**
 * Dice expressions are parsed once and reused; content re-rolls the same
 * strings constantly. Capped because `roll` accepts a computed notation, which
 * could otherwise grow the cache without bound.
 */
const diceCache = new Map<string, ReturnType<typeof parseDice>>();
const DICE_CACHE_LIMIT = 1024;

function cachedDice(notation: string) {
  let expr = diceCache.get(notation);
  if (!expr) {
    expr = parseDice(notation);
    if (diceCache.size >= DICE_CACHE_LIMIT) diceCache.clear();
    diceCache.set(notation, expr);
  }
  return expr;
}

function isPlainObject(v: unknown): v is Record<string, Value> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const EXPR_OPS = new Set([
  'ref', 'add', 'sub', 'mul', 'div', 'mod', 'neg', 'min', 'max',
  'floor', 'ceil', 'round', 'abs', 'clamp', 'roll', 'cond', 'concat', 'length', 'list',
]);

export const PREDICATE_OPS = new Set([
  'all', 'any', 'not', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'chance', 'exists', 'test',
]);

export const EFFECT_OPS = new Set([
  'damage', 'heal', 'applyCondition', 'removeCondition', 'adjustResource', 'setFlag',
  'grantItem', 'removeItem', 'adjustReputation', 'adjustCurrency', 'move', 'emit', 'noise',
  'if', 'repeat', 'forEach', 'let',
]);

/**
 * Identify a node's operator.
 *
 * Deliberately matched against the known operator set rather than taking the
 * first key: some forms carry sibling keys (`{ref, else}`, `{cond, then, else}`)
 * and JSON key order is not something a shared module file can be trusted to
 * preserve. Ambiguity is an error rather than a silent pick.
 */
function operatorOf(node: object, path: string, known: ReadonlySet<string>): string {
  const keys = Object.keys(node);
  if (keys.length === 0) throw new DslError('empty object is not a valid node', path);

  const matches = keys.filter((k) => known.has(k));
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) {
    throw new DslError(
      `no known operator among keys [${keys.join(', ')}]`,
      path,
    );
  }
  throw new DslError(`ambiguous node: multiple operators [${matches.join(', ')}]`, path);
}

function typeName(v: Value): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'list';
  return typeof v;
}

function expectNumber(v: Value, path: string, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new DslError(`${what} must be a finite number, got ${typeName(v)}`, path);
  }
  return v;
}

function expectString(v: Value, path: string, what: string): string {
  if (typeof v !== 'string') {
    throw new DslError(`${what} must be a string, got ${typeName(v)}`, path);
  }
  return v;
}

/**
 * Walk a dotted path through scope. Returns `undefined` for a missing path so
 * callers can distinguish "absent" from a stored `null`.
 */
function lookup(scope: Scope, path: string): Value | undefined {
  if (path === '') return undefined;
  let current: Value | undefined = scope;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      // Numeric index into a list, e.g. `party.0.name`.
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, Value>)[segment];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export function evalExpr(expr: Expr, ctx: EvalContext, path = ''): Value {
  if (expr === null) return null;
  const primitive = typeof expr;
  if (primitive === 'number' || primitive === 'string' || primitive === 'boolean') {
    return expr;
  }
  if (!isPlainObject(expr)) {
    throw new DslError(`expected an expression, got ${typeName(expr)}`, path);
  }

  const node = expr as Record<string, unknown>;
  const op = operatorOf(node, path, EXPR_OPS);
  const at = (child: string) => (path ? `${path}.${child}` : child);

  switch (op) {
    case 'ref': {
      const refPath = node['ref'];
      if (typeof refPath !== 'string') {
        throw new DslError('ref must be a string path', at('ref'));
      }
      const found = lookup(ctx.scope, refPath);
      if (found === undefined || found === null) {
        if ('else' in node) return evalExpr(node['else'] as Expr, ctx, at('else'));
        if (found === null) return null;

        // An open namespace treats absence as null rather than as an error.
        const root = refPath.split('.')[0] ?? '';
        if (ctx.openNamespaces?.includes(root)) return null;

        throw new DslError(
          `unknown path ${JSON.stringify(refPath)}; add an "else" to allow it to be missing`,
          at('ref'),
        );
      }
      return found;
    }

    case 'add': {
      const items = asArray(node['add'], at('add'));
      let sum = 0;
      items.forEach((item, i) => {
        sum += expectNumber(evalExpr(item, ctx, `${at('add')}[${i}]`), `${at('add')}[${i}]`, 'add operand');
      });
      return sum;
    }

    case 'mul': {
      const [a, b] = asPair(node['mul'], at('mul'));
      return (
        expectNumber(evalExpr(a, ctx, `${at('mul')}[0]`), `${at('mul')}[0]`, 'mul operand') *
        expectNumber(evalExpr(b, ctx, `${at('mul')}[1]`), `${at('mul')}[1]`, 'mul operand')
      );
    }

    case 'sub': {
      const [a, b] = asPair(node['sub'], at('sub'));
      return (
        expectNumber(evalExpr(a, ctx, `${at('sub')}[0]`), `${at('sub')}[0]`, 'sub operand') -
        expectNumber(evalExpr(b, ctx, `${at('sub')}[1]`), `${at('sub')}[1]`, 'sub operand')
      );
    }

    case 'div': {
      const [a, b] = asPair(node['div'], at('div'));
      const divisor = expectNumber(evalExpr(b, ctx, `${at('div')}[1]`), `${at('div')}[1]`, 'divisor');
      if (divisor === 0) throw new DslError('division by zero', at('div'));
      return expectNumber(evalExpr(a, ctx, `${at('div')}[0]`), `${at('div')}[0]`, 'dividend') / divisor;
    }

    case 'mod': {
      const [a, b] = asPair(node['mod'], at('mod'));
      const divisor = expectNumber(evalExpr(b, ctx, `${at('mod')}[1]`), `${at('mod')}[1]`, 'divisor');
      if (divisor === 0) throw new DslError('modulo by zero', at('mod'));
      return expectNumber(evalExpr(a, ctx, `${at('mod')}[0]`), `${at('mod')}[0]`, 'dividend') % divisor;
    }

    case 'neg':
      return -expectNumber(evalExpr(node['neg'] as Expr, ctx, at('neg')), at('neg'), 'neg operand');

    case 'min':
    case 'max': {
      const items = asArray(node[op], at(op));
      if (items.length === 0) throw new DslError(`${op} needs at least one operand`, at(op));
      const nums = items.map((item, i) =>
        expectNumber(evalExpr(item, ctx, `${at(op)}[${i}]`), `${at(op)}[${i}]`, `${op} operand`),
      );
      return op === 'min' ? Math.min(...nums) : Math.max(...nums);
    }

    case 'floor':
    case 'ceil':
    case 'round':
    case 'abs': {
      const value = expectNumber(evalExpr(node[op] as Expr, ctx, at(op)), at(op), `${op} operand`);
      if (op === 'floor') return Math.floor(value);
      if (op === 'ceil') return Math.ceil(value);
      if (op === 'abs') return Math.abs(value);
      return Math.round(value);
    }

    case 'clamp': {
      const parts = asArray(node['clamp'], at('clamp'));
      if (parts.length !== 3) {
        throw new DslError('clamp takes exactly [value, low, high]', at('clamp'));
      }
      const [v, lo, hi] = parts.map((p, i) =>
        expectNumber(evalExpr(p, ctx, `${at('clamp')}[${i}]`), `${at('clamp')}[${i}]`, 'clamp operand'),
      ) as [number, number, number];
      if (lo > hi) throw new DslError(`clamp bounds are inverted (${lo} > ${hi})`, at('clamp'));
      return Math.min(Math.max(v, lo), hi);
    }

    case 'roll': {
      const notation = expectString(
        evalExpr(node['roll'] as Expr, ctx, at('roll')),
        at('roll'),
        'roll notation',
      );
      try {
        return rollDice(cachedDice(notation), ctx.rng).total;
      } catch (err) {
        throw new DslError((err as Error).message, at('roll'));
      }
    }

    case 'cond': {
      const when = evalPredicate(node['cond'] as Predicate, ctx, at('cond'));
      return when
        ? evalExpr(node['then'] as Expr, ctx, at('then'))
        : evalExpr(node['else'] as Expr, ctx, at('else'));
    }

    case 'concat': {
      const items = asArray(node['concat'], at('concat'));
      return items
        .map((item, i) => {
          const v = evalExpr(item, ctx, `${at('concat')}[${i}]`);
          if (v === null) return '';
          if (Array.isArray(v) || isPlainObject(v)) {
            throw new DslError(`cannot concat a ${typeName(v)}`, `${at('concat')}[${i}]`);
          }
          return String(v);
        })
        .join('');
    }

    case 'length': {
      const v = evalExpr(node['length'] as Expr, ctx, at('length'));
      if (typeof v === 'string' || Array.isArray(v)) return v.length;
      throw new DslError(`length needs a string or list, got ${typeName(v)}`, at('length'));
    }

    case 'list':
      return asArray(node['list'], at('list')).map((item, i) =>
        evalExpr(item, ctx, `${at('list')}[${i}]`),
      );

    default:
      throw new DslError(`unknown expression operator ${JSON.stringify(op)}`, path);
  }
}

function asArray(v: unknown, path: string): readonly Expr[] {
  if (!Array.isArray(v)) throw new DslError('expected a list of operands', path);
  return v as readonly Expr[];
}

function asPair(v: unknown, path: string): readonly [Expr, Expr] {
  const arr = asArray(v, path);
  if (arr.length !== 2) throw new DslError(`expected exactly 2 operands, got ${arr.length}`, path);
  return arr as unknown as readonly [Expr, Expr];
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

export function evalPredicate(pred: Predicate, ctx: EvalContext, path = ''): boolean {
  if (typeof pred === 'boolean') return pred;
  if (!isPlainObject(pred)) {
    throw new DslError(`expected a predicate, got ${typeName(pred)}`, path);
  }

  const node = pred as Record<string, unknown>;
  const op = operatorOf(node, path, PREDICATE_OPS);
  const at = (child: string) => (path ? `${path}.${child}` : child);

  switch (op) {
    // `all` on an empty list is true and `any` is false, matching the usual
    // identities. That means an absent condition list permits by default.
    case 'all':
      return asPredicates(node['all'], at('all')).every((p, i) =>
        evalPredicate(p, ctx, `${at('all')}[${i}]`),
      );

    case 'any':
      return asPredicates(node['any'], at('any')).some((p, i) =>
        evalPredicate(p, ctx, `${at('any')}[${i}]`),
      );

    case 'not':
      return !evalPredicate(node['not'] as Predicate, ctx, at('not'));

    case 'eq':
    case 'ne': {
      const [a, b] = asPair(node[op], at(op));
      const same = deepEqual(
        evalExpr(a, ctx, `${at(op)}[0]`),
        evalExpr(b, ctx, `${at(op)}[1]`),
      );
      return op === 'eq' ? same : !same;
    }

    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const [a, b] = asPair(node[op], at(op));
      const left = evalExpr(a, ctx, `${at(op)}[0]`);
      const right = evalExpr(b, ctx, `${at(op)}[1]`);
      // Strings compare lexicographically; anything else must be numeric, so
      // comparing an object silently yielding false never happens.
      if (typeof left === 'string' && typeof right === 'string') {
        return compare(op, left < right ? -1 : left > right ? 1 : 0);
      }
      const l = expectNumber(left, `${at(op)}[0]`, `${op} operand`);
      const r = expectNumber(right, `${at(op)}[1]`, `${op} operand`);
      return compare(op, l < r ? -1 : l > r ? 1 : 0);
    }

    case 'in': {
      const [needleExpr, haystackExpr] = asPair(node['in'], at('in'));
      const needle = evalExpr(needleExpr, ctx, `${at('in')}[0]`);
      const haystack = evalExpr(haystackExpr, ctx, `${at('in')}[1]`);
      if (!Array.isArray(haystack)) {
        throw new DslError(`in needs a list on the right, got ${typeName(haystack)}`, `${at('in')}[1]`);
      }
      return haystack.some((candidate) => deepEqual(candidate, needle));
    }

    case 'chance': {
      const p = expectNumber(evalExpr(node['chance'] as Expr, ctx, at('chance')), at('chance'), 'chance');
      if (p <= 0) return false;
      if (p >= 1) return true;
      return ctx.rng.nextFloat() < p;
    }

    case 'exists': {
      const refPath = node['exists'];
      if (typeof refPath !== 'string') throw new DslError('exists needs a string path', at('exists'));
      const found = lookup(ctx.scope, refPath);
      return found !== undefined && found !== null;
    }

    case 'test': {
      const v = evalExpr(node['test'] as Expr, ctx, at('test'));
      if (v === null) return false;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      if (typeof v === 'string') return v.length > 0;
      if (Array.isArray(v)) return v.length > 0;
      return true;
    }

    default:
      throw new DslError(`unknown predicate operator ${JSON.stringify(op)}`, path);
  }
}

function compare(op: string, sign: number): boolean {
  switch (op) {
    case 'gt':
      return sign > 0;
    case 'gte':
      return sign >= 0;
    case 'lt':
      return sign < 0;
    default:
      return sign <= 0;
  }
}

function asPredicates(v: unknown, path: string): readonly Predicate[] {
  if (!Array.isArray(v)) throw new DslError('expected a list of predicates', path);
  return v as readonly Predicate[];
}

function deepEqual(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && deepEqual(a[k]!, b[k]!));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** Bound to stop a malformed or hostile module from looping forever. */
const MAX_REPEAT = 10_000;

/** Evaluate effects into the ordered intents the engine should apply. */
export function evalEffects(effects: readonly Effect[], ctx: EvalContext, path = ''): EffectOp[] {
  const ops: EffectOp[] = [];
  effects.forEach((effect, i) => {
    evalEffect(effect, ctx, path ? `${path}[${i}]` : `[${i}]`, ops);
  });
  return ops;
}

/** Evaluate a guarded rule; a rule whose `when` fails yields no ops. */
export function evalRule(rule: Rule, ctx: EvalContext, path = ''): EffectOp[] {
  const at = (child: string) => (path ? `${path}.${child}` : child);
  if (rule.when !== undefined && !evalPredicate(rule.when, ctx, at('when'))) return [];
  return evalEffects(rule.then, ctx, at('then'));
}

function childScope(ctx: EvalContext, name: string, value: Value): EvalContext {
  return { scope: { ...ctx.scope, [name]: value }, rng: ctx.rng };
}

function evalEffect(effect: Effect, ctx: EvalContext, path: string, out: EffectOp[]): void {
  if (!isPlainObject(effect)) {
    throw new DslError(`expected an effect, got ${typeName(effect)}`, path);
  }

  const node = effect as Record<string, unknown>;
  const op = operatorOf(node, path, EFFECT_OPS);
  const at = (child: string) => `${path}.${op}.${child}`;
  const body = node[op];

  // Control-flow forms first; they have no payload object of the usual shape.
  switch (op) {
    case 'if': {
      const spec = asBody(body, `${path}.if`);
      const branch = evalPredicate(spec['when'] as Predicate, ctx, at('when'))
        ? (spec['then'] as Effect[] | undefined)
        : (spec['else'] as Effect[] | undefined);
      if (branch) out.push(...evalEffects(branch, ctx, at('then')));
      return;
    }

    case 'repeat': {
      const spec = asBody(body, `${path}.repeat`);
      const times = expectNumber(evalExpr(spec['times'] as Expr, ctx, at('times')), at('times'), 'repeat count');
      if (!Number.isInteger(times) || times < 0) {
        throw new DslError(`repeat count must be a non-negative integer, got ${times}`, at('times'));
      }
      if (times > MAX_REPEAT) {
        throw new DslError(`repeat count ${times} exceeds the limit of ${MAX_REPEAT}`, at('times'));
      }
      for (let i = 0; i < times; i++) {
        out.push(...evalEffects(spec['do'] as Effect[], childScope(ctx, 'index', i), at('do')));
      }
      return;
    }

    case 'forEach': {
      const spec = asBody(body, `${path}.forEach`);
      const items = evalExpr(spec['in'] as Expr, ctx, at('in'));
      if (!Array.isArray(items)) {
        throw new DslError(`forEach needs a list, got ${typeName(items)}`, at('in'));
      }
      const binding = expectString(spec['as'] as Value, at('as'), 'forEach binding name');
      items.forEach((item, i) => {
        const bound = childScope(childScope(ctx, binding, item), 'index', i);
        out.push(...evalEffects(spec['do'] as Effect[], bound, at('do')));
      });
      return;
    }

    case 'let': {
      const spec = asBody(body, `${path}.let`);
      const name = expectString(spec['name'] as Value, at('name'), 'let binding name');
      const value = evalExpr(spec['value'] as Expr, ctx, at('value'));
      out.push(...evalEffects(spec['in'] as Effect[], childScope(ctx, name, value), at('in')));
      return;
    }
    default:
      break;
  }

  const spec = asBody(body, `${path}.${op}`);
  const num = (key: string, fallback: number | null = null): number | null => {
    if (!(key in spec)) return fallback;
    return expectNumber(evalExpr(spec[key] as Expr, ctx, at(key)), at(key), key);
  };
  const str = (key: string): string =>
    expectString(evalExpr(spec[key] as Expr, ctx, at(key)), at(key), key);
  const target = (): Value => evalExpr(spec['target'] as Expr, ctx, at('target'));

  switch (op) {
    case 'damage':
      out.push({
        op: 'damage',
        target: target(),
        amount: num('amount', 0)!,
        damageType: 'damageType' in spec ? str('damageType') : null,
        ...(Array.isArray(spec['tags']) ? { tags: (spec['tags'] as string[]).map(String) } : {}),
      });
      return;

    case 'heal':
      out.push({ op: 'heal', target: target(), amount: num('amount', 0)! });
      return;

    case 'adjustCurrency':
      out.push({ op: 'adjustCurrency', amount: num('amount', 0)! });
      return;

    case 'applyCondition':
      out.push({
        op: 'applyCondition',
        target: target(),
        condition: str('condition'),
        duration: num('duration'),
        magnitude: num('magnitude'),
      });
      return;

    case 'removeCondition':
      out.push({ op: 'removeCondition', target: target(), condition: str('condition') });
      return;

    case 'adjustResource':
      out.push({
        op: 'adjustResource',
        target: target(),
        resource: str('resource'),
        amount: num('amount', 0)!,
      });
      return;

    case 'setFlag':
      out.push({
        op: 'setFlag',
        flag: str('flag'),
        value: 'value' in spec ? evalExpr(spec['value'] as Expr, ctx, at('value')) : true,
      });
      return;

    case 'grantItem':
    case 'removeItem':
      out.push({
        op: op === 'grantItem' ? 'grantItem' : 'removeItem',
        target: target(),
        item: str('item'),
        quantity: num('quantity', 1)!,
      });
      return;

    case 'adjustReputation':
      out.push({ op: 'adjustReputation', faction: str('faction'), amount: num('amount', 0)! });
      return;

    case 'move':
      out.push({ op: 'move', target: target(), to: evalExpr(spec['to'] as Expr, ctx, at('to')) });
      return;

    case 'noise': {
      // Anything can make a sound: a shattering jar, a sprung trap, a shout.
      // Which sense carries it is the module's business, not the engine's.
      out.push({
        op: 'noise',
        sense: str('sense'),
        loudness: num('loudness', 1) ?? 1,
        // Through `str`, so a module that hands this an object is told where
        // and why rather than quietly making a noise nobody made.
        source: spec['source'] === undefined ? null : str('source'),
      });
      return;
    }

    case 'emit': {
      const data: Record<string, Value> = {};
      const raw = spec['data'];
      if (raw !== undefined) {
        if (!isPlainObject(raw)) throw new DslError('emit data must be an object', at('data'));
        for (const [key, valueExpr] of Object.entries(raw)) {
          data[key] = evalExpr(valueExpr as Expr, ctx, `${at('data')}.${key}`);
        }
      }
      out.push({ op: 'emit', event: str('event'), data });
      return;
    }

    default:
      throw new DslError(`unknown effect ${JSON.stringify(op)}`, path);
  }
}

function asBody(v: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(v)) throw new DslError('expected an object body', path);
  return v;
}
