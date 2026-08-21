/** Every moment in a module where something can happen, in one list. */

import type { ModuleDoc } from './store';
import { getAt } from './store';

export interface GameEvent {
  /** Stable key for React and for linking back to the entry. */
  readonly key: string;
  /** What fires it: `enter`, `allyKilled`, `questComplete`. */
  readonly when: string;
  /** Repetition: once, every entry, until complete, loop, restart. */
  readonly mode: string | null;
  /** Where it lives, as a human-readable location. */
  readonly where: string;
  /** Whose behaviour this is. */
  readonly who: string;
  /** What it does, summarised. */
  readonly what: readonly string[];
  /** The gate, summarised; empty means unconditional. */
  readonly why: readonly string[];
  /** Whether the world records that it happened. */
  readonly remembered: boolean | null;
  /** Probability, when less than certain. */
  readonly chance: number | null;
  /** Category, for filtering. */
  readonly kind: 'trigger' | 'reaction' | 'quest' | 'dialogue' | 'item' | 'condition' | 'gate';
  /** Where to navigate on click. */
  readonly source: { readonly collection: string; readonly index: number };
}

type Row = Record<string, unknown>;

function list(doc: ModuleDoc, path: string): Row[] {
  const value = getAt(doc, path.split('.'));
  return Array.isArray(value) ? (value as Row[]) : [];
}

function asArray(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

const nameOf = (row: Row | undefined) => String(row?.['name'] ?? row?.['id'] ?? '—');

/** Summarise an effect list into short human phrases. */
export function summariseEffects(effects: unknown): string[] {
  const out: string[] = [];

  const walk = (nodes: unknown, depth = 0): void => {
    if (depth > 6 || !Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (typeof node !== 'object' || node === null) continue;
      const [operator, payload] = Object.entries(node as Row)[0] ?? [];
      if (!operator) continue;

      switch (operator) {
        case 'damage':
          out.push(`damage ${describeTarget(payload)}`);
          break;
        case 'heal':
          out.push(`heal ${describeTarget(payload)}`);
          break;
        case 'applyCondition':
          out.push(`apply ${String((payload as Row)?.['condition'] ?? '?')}`);
          break;
        case 'removeCondition':
          out.push(`remove ${String((payload as Row)?.['condition'] ?? '?')}`);
          break;
        case 'setFlag':
          out.push(`set ${String((payload as Row)?.['flag'] ?? '?')}`);
          break;
        case 'adjustReputation': {
          const amount = Number((payload as Row)?.['amount'] ?? 0);
          out.push(`${amount >= 0 ? '+' : ''}${amount} ${String((payload as Row)?.['faction'] ?? '?')}`);
          break;
        }
        case 'grantItem':
          out.push(`give ${String((payload as Row)?.['item'] ?? '?')}`);
          break;
        case 'removeItem':
          out.push(`take ${String((payload as Row)?.['item'] ?? '?')}`);
          break;
        case 'adjustResource':
          out.push(`${String((payload as Row)?.['resource'] ?? '?')} change`);
          break;
        case 'move':
          out.push(`move to ${String((payload as Row)?.['to'] ?? '?')}`);
          break;
        case 'emit':
          out.push(`emit ${String((payload as Row)?.['event'] ?? '?')}`);
          break;
        case 'noise':
          out.push(
            `make a ${String((payload as Row)?.['sense'] ?? '?')} of ${String((payload as Row)?.['loudness'] ?? 1)}`,
          );
          break;
        case 'if':
          out.push('conditional');
          walk((payload as Row)?.['then'], depth + 1);
          walk((payload as Row)?.['else'], depth + 1);
          break;
        case 'repeat':
          walk((payload as Row)?.['do'], depth + 1);
          break;
        case 'forEach':
          walk((payload as Row)?.['do'], depth + 1);
          break;
        case 'let':
          walk((payload as Row)?.['in'], depth + 1);
          break;
        default:
          out.push(operator);
      }
    }
  };

  walk(effects);
  return [...new Set(out)];
}

function describeTarget(payload: unknown): string {
  const target = (payload as Row)?.['target'];
  if (typeof target === 'string') return target;
  if (typeof target === 'object' && target !== null && 'ref' in (target as Row)) {
    return String((target as Row)['ref']).replace(/\.id$/, '');
  }
  return 'target';
}

/** Summarise a requirement into short phrases. */
export function summariseRequirement(requirement: unknown): string[] {
  if (typeof requirement !== 'object' || requirement === null) return [];
  const r = requirement as Row;
  const out: string[] = [];

  if (typeof r['minLevel'] === 'number') out.push(`level ${r['minLevel']}+`);
  if (typeof r['maxLevel'] === 'number') out.push(`level ${r['maxLevel']}-`);

  for (const cls of asArray(r['classes'])) out.push(String(cls));
  for (const ancestry of asArray(r['ancestries'])) out.push(String(ancestry));
  for (const ability of asArray(r['abilities'])) out.push(`knows ${String(ability)}`);

  for (const skill of asArray(r['skills'])) {
    out.push(`${String(skill['skill'])} ${String(skill['minTier'] ?? skill['minRank'] ?? 1)}`);
  }
  for (const item of asArray(r['items'])) out.push(`has ${String(item['item'])}`);
  for (const quest of asArray(r['quests'])) {
    out.push(`${String(quest['quest'])} ${String(quest['status'] ?? 'complete')}`);
  }
  for (const faction of asArray(r['factions'])) {
    const bound = faction['minStanding'] ?? faction['minRank'] ?? faction['maxStanding'];
    out.push(`${String(faction['faction'])} ${String(bound ?? '')}`.trim());
  }
  for (const memory of asArray(r['memories'])) {
    const known = memory['known'] === false ? 'has not heard' : 'remembers';
    out.push(`${String(memory['who'] ?? 'speaker')} ${known} ${String(memory['deedKind'])}`);
  }
  for (const flag of asArray(r['flags'])) out.push(String(flag['flag']));

  const without = r['without'] as Row | undefined;
  if (without) {
    for (const key of ['items', 'abilities', 'classes', 'conditions'] as const) {
      for (const entry of asArray(without[key])) out.push(`no ${String(entry)}`);
    }
    for (const quest of asArray(without['quests'])) out.push(`not ${String(quest['quest'])}`);
    for (const flag of asArray(without['flags'])) out.push(`not ${String(flag['flag'])}`);
  }

  if (asArray(r['anyOf']).length > 0) out.push(`any of ${asArray(r['anyOf']).length}`);
  if (r['custom'] !== undefined) out.push('custom condition');

  return out;
}

/** Collect every event in the module. */
export function collectEvents(doc: ModuleDoc): GameEvent[] {
  const out: GameEvent[] = [];
  const areas = list(doc, 'world.areas');
  const areaName = (id: unknown) => nameOf(areas.find((a) => a['id'] === id));

  const pushTriggers = (
    triggers: unknown,
    where: string,
    who: string,
    source: { collection: string; index: number },
  ) => {
    asArray(triggers).forEach((trigger, i) => {
      out.push({
        key: `${source.collection}:${source.index}:trigger:${i}`,
        when: String(trigger['on'] ?? 'enter'),
        mode: String(trigger['mode'] ?? 'once'),
        where,
        who,
        what: summariseEffects(trigger['effects']),
        why: summariseRequirement(trigger['requires']),
        remembered: trigger['remember'] !== false,
        chance: typeof trigger['chance'] === 'number' && trigger['chance'] < 1 ? trigger['chance'] : null,
        kind: 'trigger',
        source,
      });
    });
  };

  // Places.
  list(doc, 'world.biomes').forEach((biome, index) =>
    pushTriggers(biome['triggers'], `${nameOf(biome)} (biome)`, 'anyone entering', {
      collection: 'world.biomes',
      index,
    }),
  );
  areas.forEach((area, index) =>
    pushTriggers(area['triggers'], nameOf(area), 'the party', { collection: 'world.areas', index }),
  );
  list(doc, 'world.pointsOfInterest').forEach((poi, index) =>
    pushTriggers(poi['triggers'], `${nameOf(poi)}, ${areaName(poi['area'])}`, 'the party', {
      collection: 'world.pointsOfInterest',
      index,
    }),
  );
  list(doc, 'world.roomTemplates').forEach((room, index) =>
    pushTriggers(room['triggers'], `${nameOf(room)} (room)`, 'the party', {
      collection: 'world.roomTemplates',
      index,
    }),
  );
  list(doc, 'world.dungeons').forEach((dungeon, index) =>
    pushTriggers(dungeon['completionTriggers'], `${nameOf(dungeon)} (on clear)`, 'the party', {
      collection: 'world.dungeons',
      index,
    }),
  );

  // Gates — a barrier is an event with a why attached.
  list(doc, 'world.gates').forEach((gate, index) => {
    out.push({
      key: `gate:${index}`,
      when: 'approach',
      mode: gate['staysOpen'] === false ? 'everyEntry' : 'once',
      where: nameOf(gate),
      who: 'the party',
      what: [
        ...summariseEffects(gate['onOpen']).map((e) => `open: ${e}`),
        ...summariseEffects(gate['onBlocked']).map((e) => `blocked: ${e}`),
        ...(gate['bypass'] ? [`bypass: ${String((gate['bypass'] as Row)['skill'])}`] : []),
      ],
      why: [
        ...summariseRequirement(gate['requires']),
        ...asArray(gate['opensWith']).map((a) => `casts ${String(a)}`),
      ],
      remembered: gate['staysOpen'] !== false,
      chance: null,
      kind: 'gate',
      source: { collection: 'world.gates', index },
    });
  });

  // Creatures and people react too.
  const pushReactions = (rows: Row[], collection: string) => {
    rows.forEach((row, index) => {
      asArray(row['reactions']).forEach((reaction, i) => {
        out.push({
          key: `${collection}:${index}:reaction:${i}`,
          when: String(reaction['on'] ?? 'turnStart'),
          mode: reaction['oncePerEncounter'] === true ? 'once per encounter' : 'everyEntry',
          where: 'wherever it is',
          who: nameOf(row),
          what: [
            ...summariseEffects(reaction['effects']),
            ...summariseEffects(reaction['onSuccess']).map((e) => `hit: ${e}`),
            ...summariseEffects(reaction['onFailure']).map((e) => `miss: ${e}`),
            ...(reaction['use'] ? [`use ${String(reaction['use'])}`] : []),
            ...(reaction['roll'] ? ['rolls'] : []),
          ],
          why: summariseRequirement(reaction['requires']),
          remembered: null,
          chance: typeof reaction['chance'] === 'number' && reaction['chance'] < 1 ? reaction['chance'] : null,
          kind: 'reaction',
          source: { collection, index },
        });
      });
    });
  };
  pushReactions(list(doc, 'content.monsters'), 'content.monsters');
  pushReactions(list(doc, 'content.npcs'), 'content.npcs');

  // Quests: start, complete, fail, and each stage.
  list(doc, 'narrative.quests').forEach((quest, index) => {
    const source = { collection: 'narrative.quests', index };
    const where = nameOf(quest);
    const who = String(quest['giver'] ?? 'the party');

    for (const [hook, label] of [['onStart', 'accepted'], ['onComplete', 'completed'], ['onFail', 'failed']] as const) {
      const effects = summariseEffects(quest[hook]);
      if (effects.length === 0) continue;
      out.push({
        key: `quest:${index}:${hook}`,
        when: label,
        mode: 'once',
        where,
        who,
        what: effects,
        why: summariseRequirement(quest['requires']),
        remembered: true,
        chance: null,
        kind: 'quest',
        source,
      });
    }

    asArray(quest['stages']).forEach((stage, i) => {
      const effects = [...summariseEffects(stage['onStart']), ...summariseEffects(stage['onComplete'])];
      if (effects.length === 0) return;
      out.push({
        key: `quest:${index}:stage:${i}`,
        when: `stage ${i + 1}: ${String(stage['id'])}`,
        mode: 'once',
        where,
        who,
        what: effects,
        why: [],
        remembered: true,
        chance: null,
        kind: 'quest',
        source,
      });
    });
  });

  // Dialogue options that do something.
  list(doc, 'narrative.dialogues').forEach((dialogue, index) => {
    asArray(dialogue['nodes']).forEach((node) => {
      asArray(node['options']).forEach((option) => {
        const effects = summariseEffects(option['effects']);
        const check = option['check'] as Row | undefined;
        if (effects.length === 0 && !check) return;
        out.push({
          key: `dialogue:${index}:${String(node['id'])}:${String(option['id'])}`,
          when: `say "${String(option['text']).slice(0, 40)}"`,
          mode: option['onceOnly'] === true ? 'once' : 'everyEntry',
          where: `${nameOf(dialogue)} / ${String(node['id'])}`,
          who: 'the party',
          what: [...effects, ...(check ? [`${String(check['skill'])} check`] : [])],
          why: summariseRequirement(option['requires']),
          remembered: node['remembers'] !== undefined,
          chance: null,
          kind: 'dialogue',
          source: { collection: 'narrative.dialogues', index },
        });
      });
    });
  });

  // Item procs and conditions that tick.
  list(doc, 'content.items').forEach((item, index) => {
    const effects = summariseEffects(item['onUse']);
    if (effects.length > 0) {
      out.push({
        key: `item:${index}:onUse`,
        when: 'used',
        mode: item['consumedOnUse'] === true ? 'once' : 'everyEntry',
        where: 'inventory',
        who: 'the holder',
        what: effects,
        why: [],
        remembered: null,
        chance: null,
        kind: 'item',
        source: { collection: 'content.items', index },
      });
    }
  });

  list(doc, 'rules.conditions').forEach((condition, index) => {
    for (const [hook, label] of [['onApply', 'applied'], ['onTick', 'each round'], ['onExpire', 'expires']] as const) {
      const effects = summariseEffects(condition[hook]);
      if (effects.length === 0) continue;
      out.push({
        key: `condition:${index}:${hook}`,
        when: label,
        mode: hook === 'onTick' ? 'loop' : 'once',
        where: 'on the afflicted',
        who: nameOf(condition),
        what: effects,
        why: [],
        remembered: null,
        chance: null,
        kind: 'condition',
        source: { collection: 'rules.conditions', index },
      });
    }
  });

  return out;
}
