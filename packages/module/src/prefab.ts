/**
 * Prefabs: an entry described once and placed many times.
 *
 * A world the size of Aurendel is a small vocabulary instantiated repeatedly — thirteen one-line
 * constructors over four lookup tables produce all 597 of its points of interest. An author writes
 * four strings and gets an eight-to-eleven key entry with a palette, a footprint, a description
 * key, travel minutes and services.
 *
 * What a prefab is, and is not
 *
 * It is a template: interpolation, a lookup into the project's own tables, and conditional
 * presence. Being data is what lets the studio render a parameter form for it, show a diff before
 * applying it, and refuse to run anything.
 *
 * It is not a program. `fit()`, `lay_out()`, `chain()` and `standing_dc()` are real algorithms and
 * ship as code, not as user script in a sandbox.
 *
 * Overrides
 *
 * An instance records which fields a person edited by hand. Re-expanding a prefab rewrites
 * everything else and leaves those alone, so changing `inn` updates thirty-six inns while the one
 * that was tuned stays tuned.
 */

/**
 * Where an instance's provenance lives: beside the entries, never inside one. Every collection
 * schema is `.strict()`, so a `$prefab` key on the entry itself would be a validation error in the
 * document the studio is editing. A sidecar keeps the document exactly what the format allows.
 */
export const INSTANCES_FILE = 'prefabs/instances.json';

export interface PrefabParam {
  readonly key: string;
  readonly label?: string;
  readonly kind: 'string' | 'text' | 'number' | 'boolean' | 'id' | 'ref' | 'enum';
  /** For `ref`: the collection its dropdown is bound to. */
  readonly target?: string;
  /** For `enum`. */
  readonly options?: readonly string[];
  readonly required?: boolean;
  readonly default?: unknown;
  readonly help?: string;
}

export interface Prefab {
  readonly id: string;
  readonly label?: string;
  readonly description?: string;
  /** The collection an instance belongs to. */
  readonly collection: string;
  readonly params: readonly PrefabParam[];
  /** The shape an instance takes, with `{{param}}`, `@lookup` and `@when`. */
  readonly template: unknown;
}

/** The project's own lookup tables. */
export type StyleTables = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/** What the sidecar records about one placed entry. */
export interface PrefabLink {
  readonly id: string;
  readonly params: Readonly<Record<string, unknown>>;
  /** Dotted paths a person edited by hand, which re-expansion must not touch. */
  readonly overrides?: readonly string[];
}

/** Every link in a project: collection, then entry id. */
export type InstanceMap = Readonly<Record<string, Readonly<Record<string, PrefabLink>>>>;

/** The link for one entry, or null when nobody generated it. */
export function linkFor(instances: InstanceMap, collection: string, id: string): PrefabLink | null {
  return instances[collection]?.[id] ?? null;
}

export interface ExpandIssue {
  readonly path: string;
  readonly message: string;
}

const INTERPOLATION = /\{\{\s*([A-Za-z_][\w]*)\s*\}\}/g;

/** Is this whole string one placeholder, so the parameter's own type survives? */
const WHOLE = /^\{\{\s*([A-Za-z_][\w]*)\s*\}\}$/;

function interpolate(
  text: string,
  params: Readonly<Record<string, unknown>>,
  path: string,
  issues: ExpandIssue[],
): unknown {
  // `"{{size}}"` yields the parameter itself; `"a {{x}} b"` yields a string. Without this a numeric
  // parameter would come back as its own digits.
  const whole = WHOLE.exec(text);
  if (whole) {
    const key = whole[1]!;
    if (!(key in params)) {
      issues.push({ path, message: `no parameter called ${JSON.stringify(key)}` });
      return undefined;
    }
    return params[key];
  }

  return text.replace(INTERPOLATION, (_match, key: string) => {
    if (!(key in params)) {
      issues.push({ path, message: `no parameter called ${JSON.stringify(key)}` });
      return '';
    }
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function evaluate(
  node: unknown,
  params: Readonly<Record<string, unknown>>,
  style: StyleTables,
  path: string,
  issues: ExpandIssue[],
): unknown {
  if (typeof node === 'string') return interpolate(node, params, path, issues);

  if (Array.isArray(node)) {
    const out: unknown[] = [];
    node.forEach((item, i) => {
      const value = evaluate(item, params, style, `${path}.${i}`, issues);
      // An omitted item leaves no hole: a list of three where one is skipped is a list of two.
      if (value !== undefined) out.push(value);
    });
    return out;
  }

  if (typeof node !== 'object' || node === null) return node;

  const record = node as Record<string, unknown>;

  // `{ "@when": "trade", "then": ... }` — present only if the parameter is set. This is how `poi()`
  // gives a place an interior only when it has both a trade and a size.
  if ('@when' in record) {
    const key = record['@when'];
    const flag = typeof key === 'string' ? params[key] : undefined;
    const truthy = flag !== undefined && flag !== null && flag !== '' && flag !== false;
    if (!truthy) return record['else'] === undefined ? undefined : evaluate(record['else'], params, style, path, issues);
    return evaluate(record['then'], params, style, path, issues);
  }

  // `{ "@lookup": ["roomSizes", "{{size}}"] }` — the project's own tables.
  //
  // More than two segments walks into the row: a table maps one key to several fields at once, so a
  // settlement's size can decide both what it offers and how far word of it travels without the two
  // drifting apart.
  if ('@lookup' in record) {
    const spec = record['@lookup'];
    if (!Array.isArray(spec) || spec.length < 2) {
      issues.push({ path, message: '@lookup takes a table name, a key, and optionally a path into the row' });
      return undefined;
    }
    const segments = spec.map((part) => String(evaluate(part, params, style, path, issues) ?? ''));
    const [table, key, ...rest] = segments as [string, string, ...string[]];
    let found: unknown = style[table]?.[key];
    for (const segment of rest) {
      if (typeof found !== 'object' || found === null) {
        found = undefined;
        break;
      }
      found = (found as Record<string, unknown>)[segment];
    }
    if (found === undefined) {
      const where = [key, ...rest].map((segment) => `[${JSON.stringify(segment)}]`).join('');
      issues.push({ path, message: `${table}${where} is not in the style tables` });
      return record['else'];
    }
    return found;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const evaluated = evaluate(value, params, style, path ? `${path}.${key}` : key, issues);
    // An omitted key is absent, not null, and the distinction reaches the hash.
    if (evaluated !== undefined) out[key] = evaluated;
  }
  return out;
}

/** Fill in the parameters a caller did not give, from the prefab's defaults. */
export function withDefaults(
  prefab: Prefab,
  params: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params };
  for (const param of prefab.params) {
    if (out[param.key] === undefined && param.default !== undefined) out[param.key] = param.default;
  }
  return out;
}

/** Everything wrong with a set of parameters, before anything is expanded. */
export function checkParams(
  prefab: Prefab,
  params: Readonly<Record<string, unknown>>,
): readonly ExpandIssue[] {
  const issues: ExpandIssue[] = [];
  const filled = withDefaults(prefab, params);

  for (const param of prefab.params) {
    const value = filled[param.key];
    if (param.required && (value === undefined || value === '')) {
      issues.push({ path: param.key, message: `${param.label ?? param.key} is required` });
      continue;
    }
    if (value === undefined) continue;
    if (param.kind === 'enum' && param.options && !param.options.includes(String(value))) {
      issues.push({
        path: param.key,
        message: `${JSON.stringify(String(value))} is not one of ${param.options.join(', ')}`,
      });
    }
    if (param.kind === 'id' && !/^[a-z][a-z0-9_]*$/.test(String(value))) {
      issues.push({ path: param.key, message: `${JSON.stringify(String(value))} is not a valid id` });
    }
  }
  return issues;
}

/** Build an entry from a prefab. Never throws; problems come back as issues. */
export function expandPrefab(
  prefab: Prefab,
  params: Readonly<Record<string, unknown>>,
  style: StyleTables = {},
): { entry: Record<string, unknown>; issues: readonly ExpandIssue[] } {
  const issues: ExpandIssue[] = [...checkParams(prefab, params)];
  const filled = withDefaults(prefab, params);
  const value = evaluate(prefab.template, filled, style, '', issues);
  const entry = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  return { entry, issues };
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

function getPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let node = target;
  for (const segment of segments.slice(0, -1)) {
    const next = node[segment];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) node[segment] = {};
    node = node[segment] as Record<string, unknown>;
  }
  node[segments[segments.length - 1]!] = value;
}

/** The marker that makes an entry file a recipe rather than an entry. */
export const PREFAB_KEY = '@prefab';

/**
 * An entry stored as what makes it, rather than as what it is: name the shape, give the handful of
 * things that differ, and let the build do the rest.
 *
 * `overrides` carries values, not the paths that {@link PrefabLink} records. A link sits beside a
 * complete entry and only says which fields a person touched; a recipe is the entry, so anything
 * the prefab does not reproduce has nowhere else to live.
 */
export interface PrefabRecipe {
  readonly [PREFAB_KEY]: string;
  readonly params: Readonly<Record<string, unknown>>;
  /** Dotted path to the value the prefab did not produce. */
  readonly overrides?: Readonly<Record<string, unknown>>;
}

/** Whether a parsed entry file is a recipe. */
export function isPrefabRecipe(value: unknown): value is PrefabRecipe {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return typeof (value as Record<string, unknown>)[PREFAB_KEY] === 'string';
}

/**
 * A recipe back into the entry it stands for. Overrides are applied by path onto the expansion,
 * which keeps key order intact: `setPath` writes an existing key in place and only a new one lands
 * at the end. A compressed module has to rebuild `module.json` byte for byte.
 */
export function expandRecipe(
  recipe: PrefabRecipe,
  prefabs: readonly Prefab[],
  style: StyleTables = {},
): { entry: Record<string, unknown> | null; issues: readonly ExpandIssue[] } {
  const id = recipe[PREFAB_KEY];
  const prefab = prefabs.find((candidate) => candidate.id === id);
  if (!prefab) {
    return { entry: null, issues: [{ path: PREFAB_KEY, message: `no prefab ${JSON.stringify(id)}` }] };
  }

  const { entry, issues } = expandPrefab(prefab, recipe.params ?? {}, style);
  for (const [path, value] of Object.entries(recipe.overrides ?? {})) setPath(entry, path, value);
  return { entry, issues };
}

/**
 * The inverse: an entry plus the prefab that nearly makes it. Whatever the expansion got wrong
 * becomes an override, so this never fails — a poor match produces a recipe with more overrides
 * than it saved. Callers choose the prefab by which answer comes out smallest.
 */
export function asRecipe(
  entry: Record<string, unknown>,
  prefab: Prefab,
  params: Readonly<Record<string, unknown>>,
  style: StyleTables = {},
): PrefabRecipe {
  const { entry: made } = expandPrefab(prefab, params, style);
  const overrides: Record<string, unknown> = {};

  for (const path of differingPaths(made, entry)) {
    setPathValue(overrides, path, getPath(entry, path));
  }

  return { [PREFAB_KEY]: prefab.id, params, ...(Object.keys(overrides).length > 0 ? { overrides } : {}) };
}

/** Overrides are a flat map of dotted paths, so this writes the key as given. */
function setPathValue(target: Record<string, unknown>, path: string, value: unknown): void {
  target[path] = value;
}

/**
 * The shallowest paths at which two entries disagree. Recording `map` once beats recording
 * `map.width`, `map.height` and `map.palette`. Descends only where both sides are plain objects and
 * the disagreement is partial.
 */
function differingPaths(made: Record<string, unknown>, want: Record<string, unknown>): string[] {
  const out: string[] = [];

  const walk = (a: unknown, b: unknown, path: string): void => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;

    const plain = (value: unknown): value is Record<string, unknown> =>
      value !== null && typeof value === 'object' && !Array.isArray(value);

    if (plain(a) && plain(b)) {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      // Only worth descending when most of the object already agrees; a wholly different object
      // reads better as one override.
      const differing = keys.filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
      if (differing.length * 2 <= keys.length) {
        for (const key of differing) walk(a[key], b[key], path ? `${path}.${key}` : key);
        return;
      }
    }

    out.push(path);
  };

  for (const key of [...new Set([...Object.keys(made), ...Object.keys(want)])]) {
    walk(made[key], want[key], key);
  }
  return out;
}

/**
 * Rebuild an instance from its prefab, keeping what was overridden. An override is recorded by
 * path, so a field the prefab has stopped emitting keeps the value a person put there.
 */
export function reexpand(
  prefab: Prefab,
  instance: Record<string, unknown>,
  link: PrefabLink,
  style: StyleTables = {},
): { entry: Record<string, unknown>; issues: readonly ExpandIssue[] } {
  const { entry, issues } = expandPrefab(prefab, link.params, style);
  for (const path of link.overrides ?? []) {
    const kept = getPath(instance, path);
    if (kept !== undefined) setPath(entry, path, kept);
  }
  return { entry, issues };
}

/**
 * Which paths differ between an instance and what its prefab would produce. Used to record an
 * override when someone edits a linked entry, and to show which fields are theirs rather than the
 * prefab's.
 */
export function overriddenPaths(
  prefab: Prefab,
  instance: Record<string, unknown>,
  link: PrefabLink,
  style: StyleTables = {},
): readonly string[] {
  const { entry } = expandPrefab(prefab, link.params, style);
  const mine = instance;

  const out: string[] = [];
  const walk = (a: unknown, b: unknown, path: string): void => {
    const bothObjects =
      typeof a === 'object' && a !== null && !Array.isArray(a) &&
      typeof b === 'object' && b !== null && !Array.isArray(b);
    if (bothObjects) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) {
        walk(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          path ? `${path}.${key}` : key,
        );
      }
      return;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(path);
  };

  walk(mine, entry, '');
  return out;
}

// ---------------------------------------------------------------------------
// Going the other way
// ---------------------------------------------------------------------------

/**
 * Fields that become parameters when a prefab is derived from an entry: the ones that are this
 * thing rather than this kind of thing. A starting point rather than a rule — the prefab is a file,
 * and the first thing anyone does with a derived one is decide what else should vary.
 */
export const IDENTITY_FIELDS = ['id', 'name', 'description'] as const;

/**
 * Turn an entry that already exists into a prefab, plus the parameters that reproduce it.
 *
 * The derived prefab must expand back to exactly the entry: that equality is what makes linking the
 * original safe, since linking it is the same as replacing it with the expansion.
 */
export function derivePrefab(
  entry: Record<string, unknown>,
  collection: string,
  prefabId: string,
  parameterise: readonly string[] = IDENTITY_FIELDS,
): { prefab: Prefab; params: Record<string, unknown> } {
  const params: Record<string, unknown> = {};
  const template: Record<string, unknown> = {};
  const declared: PrefabParam[] = [];

  for (const [key, value] of Object.entries(entry)) {
    if (parameterise.includes(key) && (typeof value === 'string' || typeof value === 'number')) {
      params[key] = value;
      template[key] = `{{${key}}}`;
      declared.push({
        key,
        label: key === 'id' ? 'Id' : key[0]!.toUpperCase() + key.slice(1),
        kind: key === 'id' ? 'id' : typeof value === 'number' ? 'number' : key === 'description' ? 'text' : 'string',
        required: key === 'id' || key === 'name',
      });
      continue;
    }
    template[key] = value;
  }

  return {
    prefab: {
      id: prefabId,
      label: typeof entry['name'] === 'string' ? `Like ${entry['name']}` : prefabId,
      collection,
      params: declared,
      template,
    },
    params,
  };
}
