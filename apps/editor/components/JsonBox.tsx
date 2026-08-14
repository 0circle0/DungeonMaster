/**
 * Raw JSON editing.
 *
 * Text is held locally while editing and only committed upstream once it
 * parses. Committing on every keystroke would destroy the document the moment
 * a user typed an opening brace.
 */

'use client';

import { useEffect, useRef, useState } from 'react';

export interface JsonBoxProps {
  value: unknown;
  onChange: (value: unknown) => void;
  placeholder?: string;
  rows?: number;
  /** Full-height mode for the whole-module view. */
  fill?: boolean;
}

export function JsonBox({ value, onChange, placeholder, rows = 6, fill = false }: JsonBoxProps) {
  const serialized = value === undefined ? '' : JSON.stringify(value, null, 2);
  const [text, setText] = useState(serialized);
  const [error, setError] = useState<string | null>(null);
  const editing = useRef(false);

  // Adopt external changes (undo, switching entries) unless actively typing.
  useEffect(() => {
    if (!editing.current) {
      setText(serialized);
      setError(null);
    }
  }, [serialized]);

  const commit = (next: string) => {
    setText(next);
    if (next.trim() === '') {
      setError(null);
      onChange(undefined);
      return;
    }
    try {
      const parsed: unknown = JSON.parse(next);
      setError(null);
      onChange(parsed);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className={`jsonbox ${fill ? 'fill' : ''}`}>
      <textarea
        className={`code ${error ? 'invalid' : ''}`}
        spellCheck={false}
        rows={fill ? undefined : rows}
        value={text}
        placeholder={placeholder}
        onFocus={() => {
          editing.current = true;
        }}
        onBlur={() => {
          editing.current = false;
          // Reformat from the committed value once the field settles.
          if (!error) setText(serialized);
        }}
        onChange={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          // Tab inserts indentation instead of leaving the field.
          if (e.key === 'Tab') {
            e.preventDefault();
            const target = e.currentTarget;
            const { selectionStart, selectionEnd } = target;
            const next = `${text.slice(0, selectionStart)}  ${text.slice(selectionEnd)}`;
            commit(next);
            requestAnimationFrame(() => {
              target.selectionStart = target.selectionEnd = selectionStart + 2;
            });
          }
        }}
      />
      {error && <p className="json-error">{error}</p>}
    </div>
  );
}
