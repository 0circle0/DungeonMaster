'use client';

/** The narrated log. */

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
