'use client';

/**
 * The disambiguation popover.
 *
 * One component for both askers: a map click that could mean several things,
 * and a typed command that tied between identically-named creatures. Each row
 * carries the detail that actually distinguishes the candidates — position and
 * health, since two bog hounds differ in nothing else.
 */

import { useEffect, useRef } from 'react';

export interface PickerItem {
  readonly id: string;
  readonly label: string;
  /** Grey right-hand text: "3 tiles east · 8/8". */
  readonly detail: string;
  /** Present ⇒ disabled, with the reason as the detail. */
  readonly blocked?: string;
  readonly pick: () => void;
}

export function Picker({
  items, at, onClose,
}: {
  items: readonly PickerItem[];
  /** Viewport coordinates to anchor at — usually the click. */
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const away = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  // Keep it on screen: flip up/left when the click is near an edge.
  const left = Math.min(at.x, (typeof window === 'undefined' ? 1200 : window.innerWidth) - 260);
  const top = Math.min(at.y, (typeof window === 'undefined' ? 800 : window.innerHeight) - items.length * 34 - 20);

  return (
    <div className="picker" ref={ref} style={{ left, top }}>
      {items.map((item) => (
        <button
          key={item.id}
          disabled={item.blocked !== undefined}
          onClick={() => { item.pick(); onClose(); }}
        >
          {item.label}
          <span className="why">{item.blocked ?? item.detail}</span>
        </button>
      ))}
    </div>
  );
}
