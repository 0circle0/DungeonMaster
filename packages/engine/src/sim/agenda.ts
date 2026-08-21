/** The world's own clock. */

import { Rng } from '@dm/core';
import { evalPredicate } from '@dm/module';
import type { MemoryModel } from '@dm/module';
import { Transaction } from '../rules/apply.js';
import { pruneMarks } from './senses.js';
import { spreadRumours, decayMemories, driftFactions, memoryModel } from './gossip.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { message } from '../narrate/systemText.js';

/** What a creature kind has learned about the party. */
export function learningKey(subject: string, what: string): string {
  return `learned:${subject}:${what}`;
}

/** The module's learning settings. */
function learningConfig(txn: Transaction): MemoryModel['learning'] {
  return memoryModel(txn.module).learning;
}

/** Record that the party fought something, so its kin can adapt. */
export function recordEncounter(txn: Transaction, statblock: string, usedAbilities: readonly string[]): void {
  const config = learningConfig(txn);
  if (!config.enabled) return;

  const monster = txn.module.find<{ attributes?: Record<string, number>; faction?: string }>(
    'content.monsters',
    statblock,
  );
  if (!monster) return;

  if (config.minimumIntellect !== undefined) {
    // The check reads every attribute and takes the highest.
    const best = Math.max(0, ...Object.values(monster.attributes ?? {}));
    if (best < config.minimumIntellect) return;
  }

  // Knowledge is filed against the faction when it is shared.
  const subject = config.sharedWithinFaction && monster.faction ? monster.faction : statblock;

  const countKey = learningKey(subject, 'encounters');
  const seen = Number(txn.state.flags[countKey] ?? 0) + 1;

  const flags: Record<string, unknown> = {
    ...txn.state.flags,
    [countKey]: seen,
    [learningKey(subject, 'lastSeen')]: txn.state.minute,
  };

  // Track what the party actually used against them.
  if (config.tracks.includes('abilities')) {
    for (const ability of usedAbilities) {
      const key = learningKey(subject, `ability:${ability}`);
      flags[key] = Number(txn.state.flags[key] ?? 0) + 1;
    }
  }

  txn.set({ ...txn.state, flags: flags as typeof txn.state.flags });

  if (seen === config.encountersBeforeAdapting) {
    txn.emit({ type: 'custom', event: 'adapted', data: { subject, encounters: seen } });
  }
}

/** Whether a creature kind has learned enough to fight differently. */
export function hasAdapted(txn: Transaction, statblock: string, rng?: Rng): boolean {
  const config = learningConfig(txn);
  if (!config.enabled) return false;

  const monster = txn.module.find<{ faction?: string }>('content.monsters', statblock);
  const subject = config.sharedWithinFaction && monster?.faction ? monster.faction : statblock;
  const seen = Number(txn.state.flags[learningKey(subject, 'encounters')] ?? 0);
  if (seen < config.encountersBeforeAdapting) return false;

  // `adaptationStrength` is how often the lesson reaches the creature's decision.
  if (!rng) return true;
  return rng.chance(config.adaptationStrength);
}

/** Adaptations fade if the party stays away long enough. */
function decayLearning(txn: Transaction): void {
  const config = learningConfig(txn);
  if (!config.enabled || config.forgetAfterDays <= 0) return;

  const perDay = txn.module.source.world.time.minutesPerDay;
  const cutoff = txn.state.minute - config.forgetAfterDays * perDay;

  const flags = { ...txn.state.flags };
  let changed = false;

  for (const [flag, value] of Object.entries(flags)) {
    if (!flag.startsWith('learned:') || !flag.endsWith(':lastSeen')) continue;
    if (Number(value) > cutoff) continue;

    const subject = flag.slice('learned:'.length, -':lastSeen'.length);
    for (const key of Object.keys(flags)) {
      if (key.startsWith(`learned:${subject}:`)) {
        delete flags[key];
        changed = true;
      }
    }
  }

  if (changed) txn.set({ ...txn.state, flags });
}

/** Quests that ran out of time. */
function expireQuests(txn: Transaction, rng: Rng): void {
  const perDay = txn.module.source.world.time.minutesPerDay;

  for (const questState of Object.values(txn.state.quests)) {
    if (questState.status !== 'active' || questState.startedAt === null) continue;

    const quest = txn.module.find<{ id: string; timeLimitDays?: number; failWhen?: never }>(
      'narrative.quests',
      questState.quest,
    );
    if (!quest) continue;

    let failed = false;
    if (quest.timeLimitDays && txn.state.minute - questState.startedAt > quest.timeLimitDays * perDay) {
      failed = true;
    }

    const leader = txn.entity(txn.state.selected);
    if (!failed && quest.failWhen && leader) {
      const scope = buildScope(txn.module, txn.state, leader);
      failed = evalPredicate(quest.failWhen, { scope, rng, openNamespaces: OPEN_NAMESPACES });
    }

    if (!failed) continue;

    txn.set({
      ...txn.state,
      quests: { ...txn.state.quests, [quest.id]: { ...questState, status: 'failed' } },
    });
    txn.emit({ type: 'questFailed', quest: quest.id, reason: message('quest.failed.expired') });
  }
}

/** Advance the world by one day. */
export function tickDay(txn: Transaction, day: number, rng: Rng): void {
  // The whole day derives from one labelled stream.
  const dayRng = rng.derive(`world:day:${day}`);

  spreadRumours(txn, day, dayRng.derive('gossip'));
  decayMemories(txn, day, dayRng.derive('forget'));
  driftFactions(txn);
  decayLearning(txn);
  expireQuests(txn, dayRng.derive('quests'));
  pruneMarks(txn);

  txn.emit({ type: 'dayBroke', day });
}
