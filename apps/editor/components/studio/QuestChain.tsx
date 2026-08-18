'use client';

/**
 * The chain this quest is part of, and whether it is wired up.
 *
 * A chain is four pieces of bookkeeping that all have to agree, and every one
 * of them fails quietly on its own: only the head is offered, every later link
 * waits on the one before, every link but the last names the next in
 * `unlocks`, and the level floor sits on the head alone. Miss the third and
 * the tail is unreachable. Miss the second and the chain has two heads, which
 * validates perfectly and plays as two chains.
 *
 * None of that is visible from one quest's form, because a chain is not a
 * thing in the format — it is a shape spread across several entries. So this
 * recovers it: follow `unlocks` forward and quest requirements back, show the
 * order, and say what is wrong with it.
 *
 * Reading only. Wiring the next link is one button because the wiring is
 * mechanical; everything else is left to the form, since a chain that the
 * studio rearranges on its own is a chain nobody trusts.
 */

import { chainProblems } from '@dm/authoring';
import { getAt } from '@/lib/store';
import type { ModuleStore } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

interface Quest {
  id?: unknown;
  name?: unknown;
  unlocks?: unknown;
  giver?: unknown;
  requires?: { quests?: { quest?: unknown; status?: unknown }[] };
  [key: string]: unknown;
}

export function QuestChain(props: { store: ModuleStore; questIndex: number }) {
  const { store, questIndex } = props;
  const quests = (getAt(store.doc, ['narrative', 'quests']) ?? []) as Quest[];
  const quest = quests[questIndex];
  if (!quest) return null;

  const byId = new Map(quests.map((entry) => [String(entry.id), entry]));
  const id = String(quest.id ?? '');

  const unlocksOf = (entry: Quest | undefined): string[] =>
    Array.isArray(entry?.unlocks) ? entry.unlocks.map((other) => String(other)) : [];

  /**
   * Backwards along quest requirements, then forwards along `unlocks`.
   *
   * Backwards only follows a requirement whose target *also* unlocks this
   * quest, and that is the whole distinction between a link and a gate. Every
   * side chain in Aurendel waits on an act opening — `the_open_door`, or
   * `the_undercroft` — and without this the walk swallows the act quest as a
   * first link and then reports the chain as broken because an act does not
   * unlock the chains it opens.
   */
  const chain: Quest[] = [quest];
  const seen = new Set([id]);

  for (let current = quest; ; ) {
    const currentId = String(current.id);
    const waits = (current.requires?.quests ?? [])
      .map((clause) => String(clause?.quest))
      .find(
        (other) =>
          byId.has(other) && !seen.has(other) && unlocksOf(byId.get(other)).includes(currentId),
      );
    if (!waits) break;
    const previous = byId.get(waits)!;
    chain.unshift(previous);
    seen.add(waits);
    current = previous;
  }

  for (let current = quest; ; ) {
    const next = unlocksOf(current).find((other) => byId.has(other) && !seen.has(other));
    if (!next) break;
    const following = byId.get(next)!;
    chain.push(following);
    seen.add(next);
    current = following;
  }

  if (chain.length < 2) return null;

  // Gates: a quest the chain waits on that is not in it. A side chain gated on
  // an act opening is contained, not leaking — so what the chain's own head
  // waits on counts as declared rather than as a fault.
  const gates = (chain[0]?.requires?.quests ?? [])
    .map((clause) => String(clause?.quest))
    .filter((other) => !seen.has(other));

  const problems = chainProblems(chain, { gates });
  const indexOf = (entry: Quest) => quests.indexOf(entry);

  return (
    <div className={styles.chain} data-ok={problems.length === 0}>
      <div className={styles.prefabHead}>
        Chain
        <code>
          {chain.findIndex((entry) => entry === quest) + 1} of {chain.length}
        </code>
      </div>

      <ol className={styles.chainList}>
        {chain.map((entry, i) => (
          <li key={String(entry.id)} className={entry === quest ? styles.chainHere : ''}>
            <span className={styles.chainStep}>{i + 1}</span>
            {String(entry.name ?? entry.id)}
            {i === 0 && entry.giver ? (
              <em className={styles.chainNote}>offered by {String(entry.giver)}</em>
            ) : null}
            {i === 0 && !entry.giver && entry['autoStart'] !== true ? (
              <em className={styles.chainBad}>nobody offers it</em>
            ) : null}
            <code className={styles.chainId}>{String(entry.id)}</code>
          </li>
        ))}
      </ol>

      {gates.length > 0 && (
        <p className={styles.prefabNote}>
          Opens after {gates.map((gate) => gate).join(', ')} — the chain is placed in the story
          rather than leaking out of itself.
        </p>
      )}

      {problems.length === 0 ? (
        <p className={styles.prefabNote}>
          One head, each link waiting on the last and unlocking the next.
        </p>
      ) : (
        <ul className={styles.chainProblems}>
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      {chain.map((entry, i) => {
        const next = chain[i + 1];
        if (!next) return null;
        const unlocks = unlocksOf(entry);
        if (unlocks.includes(String(next.id))) return null;
        return (
          <button
            key={`fix:${String(entry.id)}`}
            className="btn tiny primary"
            onClick={() =>
              store.setMany([
                {
                  path: ['narrative', 'quests', indexOf(entry), 'unlocks', unlocks.length],
                  value: String(next.id),
                },
              ])
            }
          >
            Make {String(entry.id)} unlock {String(next.id)}
          </button>
        );
      })}
    </div>
  );
}
