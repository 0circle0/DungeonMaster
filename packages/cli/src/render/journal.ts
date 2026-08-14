/**
 * The journal.
 *
 * A quest the player cannot read is a quest that does not exist, so this shows
 * the authored text — the description, the stage they are on, and every
 * objective with its progress — rather than an id and a status word. What to
 * read is decided by the engine's `questJournal`; this only lays it out.
 */

import pc from 'picocolors';
import type { CompiledModule } from '@dm/module';
import type { GameState, JournalEntry } from '@dm/engine';
import { questJournal, currentObjective, narrateFrom } from '@dm/engine';
import { wrapLines } from './text.js';

const STATUS: Record<JournalEntry['status'], string> = {
  active: pc.cyan('active'),
  available: pc.dim('available'),
  complete: pc.green('done'),
  failed: pc.red('failed'),
};

/** Active and finished quests, with what each one is actually asking for. */
export function journalLines(module: CompiledModule, state: GameState, seed = 0): string[] {
  const entries = questJournal(module, state);
  if (entries.length === 0) return [pc.dim('  (no quests)')];

  const out: string[] = [];
  for (const entry of entries) {
    if (out.length > 0) out.push('');
    out.push(...entryLines(module, entry, seed));
  }
  return out;
}

function entryLines(module: CompiledModule, entry: JournalEntry, seed: number): string[] {
  const spent = entry.status === 'complete' || entry.status === 'failed';
  const title = spent ? pc.dim(entry.name) : pc.bold(entry.name);
  const out: string[] = [`  ${title} — ${STATUS[entry.status]}`];

  if (entry.description) out.push(...wrapLines(pc.dim(entry.description), 72, '    '));

  // Which piece of a longer job the party is on. Only worth saying when the
  // quest has more than one, otherwise it is noise.
  if (entry.stageCount > 1 && !spent) {
    const named = entry.stageName ? ` — ${entry.stageName}` : '';
    out.push(pc.dim(`    Stage ${entry.stageNumber}/${entry.stageCount}${named}`));
  }

  // Finished and failed quests are kept for the record, not for planning, so
  // their objective lists stay folded away.
  if (!spent) {
    for (const objective of entry.objectives) {
      const marker = objective.done ? pc.green('✓') : pc.cyan('▸');
      const text = objective.done ? pc.dim(objective.description) : objective.description;
      const counted = !objective.done && objective.count > 1
        ? pc.dim(`  ${objective.progress}/${objective.count}`)
        : '';
      out.push(`      ${marker} ${text}${counted}`);
    }

    // The stage's own prose, when the module wrote any — the recollection that
    // reminds a player why they are here.
    if (entry.journalKey) {
      const prose = narrateFrom(module, entry.journalKey, seed, {
        sceneKey: `stage:${entry.quest}:${entry.stageNumber}`,
      });
      if (prose) out.push(...wrapLines(pc.italic(pc.dim(`"${prose}"`)), 72, '      '));
    }
  }

  return out;
}

/**
 * The one-line answer to "what am I doing".
 *
 * Empty when there is nothing on the books, so a caller can decide whether the
 * space is worth spending.
 */
export function objectiveLine(module: CompiledModule, state: GameState): string {
  const next = currentObjective(module, state);
  if (!next) return '';

  const counted = next.objective.count > 1
    ? pc.dim(`  ${next.objective.progress}/${next.objective.count}`)
    : '';
  return `${pc.cyan('▸')} ${next.objective.description}${counted}`;
}
