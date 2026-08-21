'use client';

/**
 * Command input with completion and noun disambiguation.
 */

import { useMemo, useRef, useState } from 'react';
import { distance, roughBearing, text as systemText } from '@dm/engine';
import { complete, parse, resolveNoun, visibleEntities } from '@dm/play';
import type { MetaCommand, Resolution } from '@dm/play';
import type { SessionApi } from '../lib/useSession.js';
import { Picker } from './Picker.js';
import type { PickerItem } from './Picker.js';

export function CommandBar({
  session, onMeta,
}: {
  session: SessionApi;
  onMeta: (command: MetaCommand) => void;
}) {
  const { module, frame, dispatchAction, submit } = session;
  const [input, setInput] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState<readonly PickerItem[] | null>(null);
  const box = useRef<HTMLInputElement>(null);

  const completions = useMemo(
    () => (open && input.trim() !== '' ? complete(input, { module, state: frame.state }) : []),
    [open, input, module, frame.state],
  );

  const run = (line: string) => {
    const text = line.trim();
    if (text === '') return;
    setInput('');
    setOpen(false);
    setActive(0);

    // Resolve ambiguous nouns to a picker rather than a parser error.
    const parsed = parse(text, { module, state: frame.state });
    if (parsed.kind === 'error' && /^attack|^talk|^look/.test(text)) {
      const noun = text.replace(/^\S+\s*/, '');
      const resolved: Resolution<string> = noun
        ? resolveNoun(noun, visibleEntities({ module, state: frame.state }))
        : { ok: true, value: '' };
      if (!resolved.ok && resolved.kind === 'ambiguous') {
        const actor = frame.state.entities[frame.state.selected];
        setPicker(resolved.candidates.map((candidate, index) => {
          const gap = actor && candidate.at ? distance(actor.position, candidate.at) : null;
          const way = actor && candidate.at
            ? systemText(module, roughBearing(actor.position, candidate.at))
            : '';
          return {
            id: `${candidate.value}:${index}`,
            label: candidate.name,
            detail: gap === null ? '' : gap <= 1 ? 'adjacent' : `${gap} tiles ${way}`,
            pick: () => {
              const verb = text.split(/\s+/)[0] ?? '';
              if (verb.startsWith('talk')) dispatchAction({ type: 'talk', npc: candidate.value });
              else if (verb.startsWith('look')) dispatchAction({ type: 'look', at: candidate.name.toLowerCase() });
              else dispatchAction({ type: 'attack', target: candidate.value });
            },
          };
        }));
        return;
      }
    }

    const meta = submit(text);
    if (meta) onMeta(meta);
  };

  return (
    <div className="command-bar">
      {completions.length > 0 && (
        <div className="completions">
          {completions.map((completion, index) => (
            <button
              key={completion.text}
              className={`completion ${index === active ? 'active' : ''}`}
              onMouseDown={(event) => { event.preventDefault(); run(completion.text); }}
            >
              <span className="what">{completion.label}</span>
              <span className="why">{completion.detail}</span>
            </button>
          ))}
        </div>
      )}
      <input
        ref={box}
        value={input}
        placeholder="type a command — or just click the map"
        spellCheck={false}
        onChange={(event) => { setInput(event.target.value); setOpen(true); setActive(0); }}
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' && completions.length > 0) {
            event.preventDefault();
            setActive((current) => (current + completions.length - 1) % completions.length);
          } else if (event.key === 'ArrowDown' && completions.length > 0) {
            event.preventDefault();
            setActive((current) => (current + 1) % completions.length);
          } else if (event.key === 'Tab' && completions.length > 0) {
            event.preventDefault();
            const chosen = completions[active] ?? completions[0];
            if (chosen) setInput(chosen.text);
          } else if (event.key === 'Enter') {
            const chosen = open ? completions[active] : undefined;
            run(chosen && input.trim() !== chosen.text.trim() && completions.length > 0 && active > 0
              ? chosen.text
              : input);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {picker && (
        <Picker
          items={picker}
          at={{ x: 320, y: (typeof window === 'undefined' ? 600 : window.innerHeight) - 220 }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
