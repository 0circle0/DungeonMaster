'use client';

/**
 * Build a standard dialogue fragment for common conversation shapes.
 * The generated form can assemble these manually, but the fragment keeps the reward and check ordering correct.
 */

import { useState } from 'react';
import { rumour, favour, talk } from '@dm/authoring';
import type { Fragment, Voice } from '@dm/authoring';
import { getAt } from '@/lib/store';
import type { ModuleStore } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

type Shape = 'rumour' | 'favour' | 'talk';

const SHAPES: { id: Shape; label: string; blurb: string }[] = [
  { id: 'rumour', label: 'A clue, behind a roll', blurb: 'They know something. Persuade them and the party learns it; fail and they will not say.' },
  { id: 'favour', label: 'An item, behind a roll', blurb: 'They are holding it. Persuade them and they hand it over — and it cannot then be looted twice.' },
  { id: 'talk', label: 'Something they just say', blurb: 'No roll. Still lands on its own node, so adding a roll later does not move the reward.' },
];

/** Shared wording reused by all dialogue fragments. */
const VOICE: Voice = {
  goOn: 'Go on.',
  leaveIt: 'Leave it, then.',
  rumourRefused: '"I have nothing to tell you."',
  thanks: 'Thank you.',
  favourRefused: '"It is not mine to give."',
};

export function DialoguePieces(props: { store: ModuleStore; dialogueIndex: number }) {
  const { store, dialogueIndex } = props;
  const [shape, setShape] = useState<Shape | null>(null);
  const [key, setKey] = useState('');
  const [ask, setAsk] = useState('');
  const [says, setSays] = useState('');
  const [target, setTarget] = useState('');
  const [faction, setFaction] = useState('');

  const base = ['narrative', 'dialogues', dialogueIndex] as const;
  const dialogue = getAt(store.doc, [...base]) as Record<string, unknown> | undefined;
  if (!dialogue) return null;

  const nodes = (dialogue['nodes'] ?? []) as Record<string, unknown>[];
  const start = String(dialogue['start'] ?? nodes[0]?.['id'] ?? '');
  const startIndex = nodes.findIndex((node) => String(node['id']) === start);
  const lore = store.idsByCollection['narrative.lore'] ?? [];
  const items = store.idsByCollection['content.items'] ?? [];
  const factions = store.idsByCollection['content.factions'] ?? [];

  const built = (): Fragment | null => {
    if (!shape || !key || !ask) return null;
    const common = {
      key,
      ask,
      voice: VOICE,
      back: start,
      ...(faction ? { faction } : {}),
    };
    if (shape === 'talk') return talk({ ...common, says, ...(target ? { clue: target } : {}) });
    if (!target || !says) return null;
    return shape === 'rumour'
      ? rumour({ ...common, told: says, clue: target })
      : favour({ ...common, given: says, item: target });
  };

  const fragment = built();

  const add = () => {
    if (!fragment || startIndex < 0) return;
    const options = (nodes[startIndex]?.['options'] ?? []) as unknown[];
    store.setMany([
      { path: [...base, 'nodes', startIndex, 'options', options.length], value: fragment.option },
      ...fragment.nodes.map((node, i) => ({
        path: [...base, 'nodes', nodes.length + i],
        value: node,
      })),
    ]);
    setShape(null);
    setKey('');
    setAsk('');
    setSays('');
    setTarget('');
  };

  const targets = shape === 'favour' ? items : lore;
  const targetLabel = shape === 'favour' ? 'Item they hold' : 'What they know';

  return (
    <div className={styles.pieces}>
      <div className={styles.prefabHead}>
        Add a piece
        <code>{nodes.length} nodes</code>
      </div>

      {startIndex < 0 && (
        <p className={styles.prefabNote}>
          This dialogue has no start node, so there is nowhere to hang an option.
        </p>
      )}

      <div className={styles.pieceShapes}>
        {SHAPES.map((entry) => (
          <button
            key={entry.id}
            className={`btn tiny ${shape === entry.id ? 'primary' : ''}`}
            disabled={startIndex < 0}
            onClick={() => setShape(shape === entry.id ? null : entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {shape && (
        <>
          <p className={styles.prefabNote}>{SHAPES.find((s) => s.id === shape)?.blurb}</p>
          <div className={styles.pieceForm}>
            <label className="label">
              Id
              <input className="input" value={key} placeholder="ask_the_mill" onChange={(e) => setKey(e.target.value)} />
            </label>
            <label className="label">
              What the party asks
              <input className="input" value={ask} onChange={(e) => setAsk(e.target.value)} />
            </label>
            <label className="label">
              {shape === 'favour' ? 'What they say handing it over' : 'What they say'}
              <textarea className="input" rows={2} value={says} onChange={(e) => setSays(e.target.value)} />
            </label>
            {shape !== 'talk' || lore.length > 0 ? (
              <label className="label">
                {targetLabel}
                <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">{shape === 'talk' ? '— nothing to learn —' : '— choose —'}</option>
                  {targets.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {shape !== 'talk' && (
              <label className="label">
                Standing moves the roll
                <select className="input" value={faction} onChange={(e) => setFaction(e.target.value)}>
                  <option value="">— a fixed difficulty —</option>
                  {factions.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {fragment ? (
            <>
              <p className={styles.prefabNote}>
                Adds one option and {fragment.nodes.length} node
                {fragment.nodes.length === 1 ? '' : 's'}. The reward is on{' '}
                <code>{String(fragment.nodes[0]?.['id'])}</code>, which is reached only when the
                roll passes — never on the option, where it would run either way.
              </p>
              <button className="btn tiny primary" onClick={add}>
                Add it
              </button>
            </>
          ) : (
            <p className={styles.prefabNote}>Fill in the rest and it will show what it makes.</p>
          )}
        </>
      )}
    </div>
  );
}
