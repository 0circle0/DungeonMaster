'use client';

/**
 * The narrated log.
 *
 * Follows the newest line unless the player has scrolled back, in which case
 * their place is theirs until they return — auto-scroll that fights the reader
 * is worse than none.
 */

import { useEffect, useRef } from 'react';
import type { Line } from '@dm/engine';

export function Transcript({ lines }: { lines: readonly Line[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const box = ref.current;
    if (box && pinned.current) box.scrollTop = box.scrollHeight;
  }, [lines]);

  return (
    <div
      className="transcript"
      ref={ref}
      onScroll={() => {
        const box = ref.current;
        if (!box) return;
        pinned.current = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
      }}
    >
      {lines.map((line, index) => (
        <p key={index} className={line.kind}>{line.text}</p>
      ))}
    </div>
  );
}
