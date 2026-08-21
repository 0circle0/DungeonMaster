/** The bottom console. */

import { useState } from 'react';
import type { Validation } from '@/lib/store';
import type { Diagnostic } from '@dm/module';
import styles from '@/app/studio/studio.module.css';

export function ProblemsConsole(props: {
  validation: Validation;
  onOpen: (diagnostic: Diagnostic) => void;
}) {
  const [open, setOpen] = useState(true);
  /** Notes are hidden by default, and that is the point of having them. */
  const [showNotes, setShowNotes] = useState(false);
  const { errors, warnings, infos } = props.validation;
  const all = [...errors, ...warnings, ...(showNotes ? infos : [])];

  return (
    <footer className={styles.console}>
      <button className={styles.consoleHead} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} Console
        {errors.length === 0 && warnings.length === 0 && infos.length === 0 ? (
          <span className={`${styles.consoleCount} ${styles.consoleOk}`}>no problems</span>
        ) : (
          <span className={styles.consoleCount}>
            <span className={errors.length > 0 ? styles.consoleCountErr : ''}>
              {errors.length} error{errors.length === 1 ? '' : 's'}
            </span>
            {', '}
            <span className={warnings.length > 0 ? styles.consoleCountWarn : ''}>
              {warnings.length} warning{warnings.length === 1 ? '' : 's'}
            </span>
            {infos.length > 0 && (
              <>
                {', '}
                <span className={styles.consoleCountInfo}>{infos.length} notes</span>
              </>
            )}
          </span>
        )}
      </button>
      {open && infos.length > 0 && (
        <label className={styles.consoleNotes}>
          <input
            type="checkbox"
            checked={showNotes}
            onChange={(e) => setShowNotes(e.target.checked)}
          />
          show {infos.length} note{infos.length === 1 ? '' : 's'} — things worth knowing rather
          than things to fix
        </label>
      )}
      {open && all.length > 0 && (
        <div className={styles.consoleList}>
          {all.map((issue, i) => (
            <button
              className={`problem ${issue.severity === 'error' ? 'err' : issue.severity === 'warning' ? 'warn' : 'note'}`}
              key={i}
              title="Jump to this problem"
              onClick={() => props.onOpen(issue)}
            >
              {/* Where, once. The left column prefers a line and column when
                  the idle tier has resolved one, and falls back to the path;
                  repeating the path underneath in that case cost every row a
                  line to say the same thing twice — and most rows have no
                  position, because rules and mods never carry one. */}
              <span className="problem-where">
                {issue.position ? `${issue.position.line}:${issue.position.column}` : issue.path || '<root>'}
              </span>
              <span className="problem-body">
                <span className="problem-message">{issue.message}</span>
                {issue.hint && <span className="problem-hint">→ {issue.hint}</span>}
                {issue.position && issue.path && <code className="problem-path">{issue.path}</code>}
              </span>
              <span className="problem-code">{issue.code}</span>
            </button>
          ))}
        </div>
      )}
    </footer>
  );
}
