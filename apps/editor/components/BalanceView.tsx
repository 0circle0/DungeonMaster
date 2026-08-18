/**
 * Balance: what a table can produce, and what it will actually produce.
 *
 * Two halves that answer different questions.
 *
 * **Budget** is analytic. It bounds what a table *can* do and rates it against
 * a party — the check that catches an area rated for level 2 holding a table
 * that can spawn something lethal.
 *
 * **Preview** is empirical. It rolls the table thousands of times through the
 * seeded RNG and reports the distribution that actually results. A 15% weight
 * is abstract; "you will see this once in seven fights, and never below level
 * 3" is not.
 *
 * The party controls at the top matter more than they look: gating is evaluated
 * against them, so raising the level makes entries appear and disappear. That
 * is the fastest way to see what a given party will actually encounter.
 */

'use client';

import { useMemo, useState } from 'react';
import { assessTable, standardBudget, compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
// The previews call the engine's own draw functions, so what the Balance view
// reports and what actually happens in play cannot drift apart.
import { simulateLoot, simulateEncounters } from '@dm/engine';
import type { Difficulty } from '@dm/module';
import type { Scope } from '@dm/module';
import type { ModuleDoc } from '@/lib/store';
import { getAt } from '@/lib/store';

const DIFFICULTY_CLASS: Record<Difficulty, string> = {
  trivial: 'diff-trivial',
  easy: 'diff-easy',
  standard: 'diff-standard',
  hard: 'diff-hard',
  deadly: 'diff-deadly',
  overwhelming: 'diff-overwhelming',
};

type Row = Record<string, unknown>;

function list(doc: ModuleDoc, path: string): Row[] {
  const value = getAt(doc, path.split('.'));
  return Array.isArray(value) ? (value as Row[]) : [];
}

/**
 * A hypothetical party, for evaluating gates.
 *
 * Deliberately generous on skills and quests: the question this view answers is
 * "what *can* this party see", and a preview that silently gates everything out
 * because the imaginary party has no lore skill would be misleading.
 */
function buildScope(level: number, doc: ModuleDoc, generous: boolean): Scope {
  const skills: Record<string, number> = {};
  const quests: Record<string, unknown> = {};
  const inventory: Record<string, number> = {};

  if (generous) {
    for (const skill of list(doc, 'content.skills')) skills[String(skill['id'])] = 5;
    for (const quest of list(doc, 'narrative.quests')) {
      quests[String(quest['id'])] = { status: 'complete' };
    }
    for (const item of list(doc, 'content.items')) inventory[String(item['id'])] = 1;
  }

  const reputation: Record<string, number> = {};
  for (const faction of list(doc, 'content.factions')) {
    reputation[String(faction['id'])] = generous ? 100 : 0;
  }

  const firstClass = String(list(doc, 'content.classes')[0]?.['id'] ?? '');
  const firstAncestry = String(list(doc, 'content.ancestries')[0]?.['id'] ?? '');

  return {
    actor: {
      level,
      class: firstClass,
      ancestry: firstAncestry,
      abilities: generous ? list(doc, 'content.abilities').map((a) => String(a['id'])) : [],
      attr: {},
      skills,
      inventory,
      equippedItems: inventory,
      conditions: {},
    },
    quests: quests as Record<string, never>,
    flags: {},
    reputation,
    memory: { speaker: {}, party: {}, anyone: {} },
    world: { day: 1 },
  };
}

export function BalanceView({ doc }: { doc: ModuleDoc }) {
  const encounterTables = list(doc, 'world.encounterTables');
  const lootTables = list(doc, 'content.lootTables');
  const monsters = list(doc, 'content.monsters');
  const items = list(doc, 'content.items');
  // Memoized for the fallback, not the lookup: `?? []` builds a fresh array
  // whenever the field is absent, and the budget memo below keys on it — so a
  // module without a progression table would recompute on every render.
  const levels = useMemo(
    () => (getAt(doc, ['rules', 'progression', 'levels']) as Row[]) ?? [],
    [doc],
  );
  const defaultPartySize = Number(getAt(doc, ['start', 'partySize']) ?? 4);

  const [level, setLevel] = useState(1);
  const [partySize, setPartySize] = useState(defaultPartySize);
  const [generous, setGenerous] = useState(true);
  const [trials, setTrials] = useState(2000);
  const [seed, setSeed] = useState(1);

  /**
   * The previews run the engine's own draw functions, which need a compiled
   * module. Compiling here rather than passing one in keeps the view usable on
   * a document that is still being edited — it simply shows nothing until the
   * module is valid.
   */
  const moduleRef = useMemo<CompiledModule | null>(() => {
    const compiled = compileModule(doc);
    return compiled.ok ? compiled.module : null;
  }, [doc]);

  const scope = useMemo(() => buildScope(level, doc, generous), [level, doc, generous]);
  const budget = useMemo(
    () => Math.round(standardBudget(levels as never, level, partySize)),
    [levels, level, partySize],
  );

  const itemName = (id: string) => String(items.find((i) => i['id'] === id)?.['name'] ?? id);

  /**
   * Which areas send this table at a party it was not written for.
   *
   * `areas[].recommendedLevel` and `dangerLevel` were the author's own note
   * about who a place is for, read by nothing — including this view, whose
   * whole job is to answer that question. Now they answer it: an area rated for
   * level 2 that draws on a table budgeted well above a level-2 party is worth
   * saying out loud.
   */
  const overAimed = (table: Row): string[] => {
    const out: string[] = [];
    for (const area of list(doc, 'world.areas')) {
      const tables = Array.isArray(area['encounterTables']) ? (area['encounterTables'] as string[]) : [];
      if (!tables.includes(String(table['id']))) continue;

      const rated = Number(area['recommendedLevel'] ?? 0);
      if (!rated) continue;

      // Judged at the level the area claims to be for, not at whatever is
      // typed in the box above — that is the whole point of the field.
      const assessed = assessTable(table as never, monsters as never, levels as never, rated, partySize);
      if (assessed.worst === 'deadly' || assessed.expected === 'deadly') {
        out.push(`${String(area['name'] ?? area['id'])} is rated for level ${rated}, where this reads ${assessed.worst}`);
      }
    }
    return out;
  };

  return (
    <div className="balance">
      <div className="pane-head">
        <h2 className="pane-title">
          Balance
          <code className="pane-path">budget · preview</code>
        </h2>
      </div>

      <div className="balance-controls">
        <label>
          Party level
          <input
            className="input narrow"
            type="number"
            min={1}
            value={level}
            onChange={(e) => setLevel(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label>
          Party size
          <input
            className="input narrow"
            type="number"
            min={1}
            value={partySize}
            onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label>
          Trials
          <input
            className="input narrow"
            type="number"
            min={100}
            step={500}
            value={trials}
            onChange={(e) => setTrials(Math.max(100, Number(e.target.value) || 100))}
          />
        </label>
        <label>
          Seed
          <input
            className="input narrow"
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value) || 0)}
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={generous} onChange={(e) => setGenerous(e.target.checked)} />
          <span>Party meets every non-level gate</span>
        </label>
        <span className="balance-budget">
          standard encounter ≈ <strong>{budget}</strong> xp
        </span>
      </div>

      {!moduleRef && (
        <p className="empty">
          The previews need a module that compiles — fix the problems below and they will appear.
        </p>
      )}

      <h3 className="balance-heading">Encounter tables</h3>
      {encounterTables.length === 0 && <p className="empty">No encounter tables yet.</p>}

      {moduleRef && encounterTables.map((table) => {
        const assessment = assessTable(table as never, monsters as never, levels as never, level, partySize);
        const preview = simulateEncounters(moduleRef, String(table['id']), scope, { trials, seed });

        return (
          <section className="balance-table" key={String(table['id'])}>
            <div className="balance-table-head">
              <strong>{String(table['name'] ?? table['id'])}</strong>
              {overAimed(table).map((warning) => (
                <span className="diff deadly" key={warning}>{warning}</span>
              ))}
              <span className={`diff ${DIFFICULTY_CLASS[assessment.expected]}`}>
                typical: {assessment.expected}
              </span>
              <span className={`diff ${DIFFICULTY_CLASS[assessment.worst]}`}>
                worst: {assessment.worst}
              </span>
              <span className="balance-meta">
                {Math.round((table['chance'] as number ?? 1) * 100)}% fires · expected{' '}
                {assessment.table.expectedThreat} xp · max {assessment.table.maxThreat} xp
              </span>
            </div>

            <table className="events-table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Weight</th>
                  <th>Rolled</th>
                  <th>Creatures</th>
                  <th>Threat</th>
                </tr>
              </thead>
              <tbody>
                {preview.outcomes.map((outcome) => {
                  const group = assessment.table.groups.find((g) => g.id === outcome.id);
                  return (
                    <tr key={outcome.id} className={outcome.gatedOut ? 'gated-out' : ''}>
                      <td>
                        {outcome.label}
                        {outcome.gatedOut && <span className="tree-chip err">gated out</span>}
                        {group?.gated && !outcome.gatedOut && <span className="tree-chip">gated</span>}
                      </td>
                      <td className="num">{group?.weight ?? '—'}</td>
                      <td className="num">
                        <Bar fraction={outcome.frequency} />
                        {(outcome.frequency * 100).toFixed(1)}%
                      </td>
                      <td className="num">{outcome.averageCreatures.toFixed(1)}</td>
                      <td className="num">{outcome.averageThreat} xp</td>
                    </tr>
                  );
                })}
                <tr className="quiet-row">
                  <td colSpan={2}>nothing happens</td>
                  <td className="num">
                    <Bar fraction={preview.emptyTrials / preview.trials} />
                    {((preview.emptyTrials / preview.trials) * 100).toFixed(1)}%
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}

      <h3 className="balance-heading">Loot tables</h3>
      {lootTables.length === 0 && <p className="empty">No loot tables yet.</p>}

      {moduleRef && lootTables.map((table) => {
        const preview = simulateLoot(moduleRef, String(table['id']), scope, { trials, seed, labelFor: itemName });
        return (
          <section className="balance-table" key={String(table['id'])}>
            <div className="balance-table-head">
              <strong>{String(table['name'] ?? table['id'])}</strong>
              {overAimed(table).map((warning) => (
                <span className="diff deadly" key={warning}>{warning}</span>
              ))}
              <span className="balance-meta">
                {preview.excluded.length > 0
                  ? `${preview.excluded.length} entr${preview.excluded.length === 1 ? 'y' : 'ies'} gated out for this party`
                  : 'all entries available'}
              </span>
            </div>
            <table className="events-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Drops</th>
                  <th>Avg qty</th>
                  <th>Per 100 kills</th>
                </tr>
              </thead>
              <tbody>
                {preview.outcomes.map((outcome) => (
                  <tr key={outcome.id} className={outcome.gatedOut ? 'gated-out' : ''}>
                    <td>
                      {outcome.label}
                      {outcome.gatedOut && <span className="tree-chip err">gated out</span>}
                    </td>
                    <td className="num">
                      <Bar fraction={outcome.frequency} />
                      {(outcome.frequency * 100).toFixed(1)}%
                    </td>
                    <td className="num">
                      {outcome.averageWhenPresent > 0 ? outcome.averageWhenPresent.toFixed(1) : '—'}
                    </td>
                    <td className="num">
                      {outcome.gatedOut ? '—' : ((outcome.total / preview.trials) * 100).toFixed(0)}
                    </td>
                  </tr>
                ))}
                <tr className="quiet-row">
                  <td>nothing</td>
                  <td className="num">
                    <Bar fraction={preview.emptyTrials / preview.trials} />
                    {((preview.emptyTrials / preview.trials) * 100).toFixed(1)}%
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function Bar({ fraction }: { fraction: number }) {
  return (
    <span className="bar" aria-hidden>
      <span className="bar-fill" style={{ width: `${Math.min(100, fraction * 100)}%` }} />
    </span>
  );
}
