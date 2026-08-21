'use client';

/** Hides rows that do not match, rather than re-rendering them. */

import { useCallback, useState } from 'react';

export function Filter({ placeholder }: { placeholder: string }) {
  const [value, setValue] = useState('');

  const apply = useCallback((query: string) => {
    setValue(query);
    const needle = query.trim().toLowerCase();
    for (const section of Array.from(document.querySelectorAll<HTMLElement>('[data-section]'))) {
      const rows = Array.from(section.querySelectorAll<HTMLElement>('[data-row]'));
      const sectionMatches = !needle || (section.dataset['text'] ?? '').includes(needle);
      let shown = 0;
      for (const row of rows) {
        const match = !needle || sectionMatches || (row.dataset['text'] ?? '').includes(needle);
        row.hidden = !match;
        if (match) shown += 1;
      }
      section.hidden = shown === 0;
    }
  }, []);

  return (
    <div className="filter">
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => apply(event.target.value)}
      />
      {value ? <button type="button" onClick={() => apply('')}>clear</button> : null}
    </div>
  );
}
