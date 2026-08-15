/**
 * The bottom console. Same diagnostics the CLI prints, but each row jumps to
 * the owning entry's form rather than to a line of raw JSON — fixing happens
 * where the field is. Rows the resolver cannot place fall back to raw JSON.
 */

import { useState } from 'react';
import type { Validation } from '@/lib/store';
import type { Diagnostic } from '@dm/module';
import styles from '@/app/studio/studio.module.css';

export function ProblemsConsole(props: {
  validation: Validation;
  onOpen: (diagnostic: Diagnostic) => void;
}) {
  const [open, setOpen] = useState(true);
  const { errors, warnings } = props.validation;
  const all = [...errors, ...warnings];

  return (
    <footer className={styles.console}>
      <button className={styles.consoleHead} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} Console
        {all.length === 0 ? (
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
          </span>
        )}
      </button>
      {open && all.length > 0 && (
        <div className={styles.consoleList}>
          {all.map((issue, i) => (
            <button
              className={`problem ${issue.severity === 'error' ? 'err' : 'warn'}`}
              key={i}
              title="Jump to this problem"
              onClick={() => props.onOpen(issue)}
            >
              <span className="problem-where">
                {issue.position ? `${issue.position.line}:${issue.position.column}` : issue.path || '<root>'}
              </span>
              <span className="problem-body">
                <span className="problem-message">{issue.message}</span>
                {issue.hint && <span className="problem-hint">→ {issue.hint}</span>}
                {issue.path && <code className="problem-path">{issue.path}</code>}
              </span>
              <span className="code">{issue.code}</span>
            </button>
          ))}
        </div>
      )}
    </footer>
  );
}
