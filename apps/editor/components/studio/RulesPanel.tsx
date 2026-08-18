'use client';

/**
 * The Rules panel.
 *
 * The console says a module is wrong. This says what "wrong" means, who
 * decided, and lets an author disagree.
 *
 * That is not decoration. Every rule here encodes a contract the schema cannot
 * express, which is another way of saying every one of them is a judgement
 * somebody made about how this format is meant to be used. A checker that
 * cannot show its reasoning is indistinguishable from a checker that is wrong,
 * and the response to both is to stop reading the console.
 *
 * So each rule shows its title, why it exists in a sentence, what it reads, and
 * how many findings it is responsible for right now — and has a switch.
 */

import type { Diagnostic } from '@dm/module';
import type { RulesApi } from '@/lib/useRules';
import type { Contract } from '@dm/module';
import styles from '../../app/studio/studio.module.css';

export function RulesPanel({
  rules,
  findings,
  contract,
  ready,
  onOpen,
}: {
  rules: RulesApi;
  /** What the enabled rules currently say, so each row can count its own. */
  findings: readonly Diagnostic[];
  /** The project's own facts, if it declares any. */
  contract: Contract;
  /** False while the idle tier has not run yet, so 0 is not claimed too early. */
  ready: boolean;
  onOpen: (diagnostic: Diagnostic) => void;
}) {
  const byCode = new Map<string, Diagnostic[]>();
  for (const finding of findings) {
    const list = byCode.get(finding.code);
    if (list) list.push(finding);
    else byCode.set(finding.code, [finding]);
  }

  const contractEntries = Object.entries(contract).filter(
    ([, value]) => Array.isArray(value) && value.length > 0,
  ) as [string, readonly string[]][];

  const offCount = rules.all.length - rules.enabled.length;

  return (
    <div className={styles.modsBody}>
      <h3>Rules</h3>
      <p className={styles.modsHint}>
        Contracts the format cannot check. Every one of these passes `validate` and fails at
        play time, which is why they are here and not in the schema.
      </p>

      <ul className={styles.modsList}>
        {rules.all.map((rule) => {
          const on = rules.isOn(rule.code);
          const found = byCode.get(rule.code) ?? [];
          return (
            <li key={rule.code}>
              <label className={styles.ruleHead}>
                <input type="checkbox" checked={on} onChange={() => rules.toggle(rule.code)} />
                <span className={on ? '' : styles.ruleOff}>{rule.title}</span>
                {on && ready && (
                  <span
                    className={found.length > 0 ? styles.ruleCount : styles.ruleCountZero}
                    title={found.length > 0 ? 'Findings in this module' : 'Nothing to report'}
                  >
                    {found.length}
                  </span>
                )}
                <code className={styles.ruleCode}>{rule.code}</code>
              </label>
              <p className={styles.modsHint}>{rule.why}</p>
              <p className={styles.modsHint}>
                Reads {rule.reads.join(', ')} · {rule.severity}
              </p>
              {on && found.length > 0 && (
                <ul className={styles.ruleFindings}>
                  {found.slice(0, 8).map((finding, i) => (
                    <li key={`${finding.path}:${i}`}>
                      <button className={styles.ruleFinding} onClick={() => onOpen(finding)}>
                        <code>{finding.path}</code> {finding.message}
                      </button>
                    </li>
                  ))}
                  {found.length > 8 && (
                    <li className={styles.modsHint}>
                      …and {found.length - 8} more, all in the console.
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {offCount > 0 && (
        <p className={styles.modsWarn}>
          {offCount} rule{offCount === 1 ? '' : 's'} switched off — this module is not being
          checked for {offCount === 1 ? 'it' : 'them'}.{' '}
          <button className={styles.modsBtn} onClick={rules.reset}>
            Turn all back on
          </button>
        </p>
      )}

      <h3>Contract</h3>
      {contractEntries.length === 0 ? (
        <p className={styles.modsHint}>
          None declared. A project states its own facts in <code>project/contract.json</code> —
          which quests gate an act, which factions are deliberately inert — so a shared rule
          does not have to guess them.
        </p>
      ) : (
        <table className={styles.modsTable}>
          <tbody>
            {contractEntries.map(([key, value]) => (
              <tr key={key}>
                <td>{key}</td>
                <td>{value.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
