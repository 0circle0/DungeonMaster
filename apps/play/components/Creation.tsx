'use client';

/** Character creation as a form. */

import { useMemo, useState } from 'react';
import type { CompiledModule } from '@dm/module';
import type { CharacterChoices } from '@dm/engine';
import { creationRules, costOf, baseAllocation, adjust, remaining, toChoices } from '@dm/play';

interface Draft {
  name: string;
  ancestry: string | undefined;
  characterClass: string | undefined;
  attributes: Record<string, number>;
}

export function Creation({
  module, onDone, onCancel,
}: {
  module: CompiledModule;
  onDone: (roster: CharacterChoices[]) => void;
  onCancel: () => void;
}) {
  const rules = useMemo(() => creationRules(module), [module]);
  const partySize = module.source.start.partySize;

  const fresh = (index: number): Draft => ({
    name: `Hero ${index + 1}`,
    ancestry: rules.ancestries[0]?.id,
    characterClass: rules.classes[0]?.id,
    attributes: baseAllocation(module),
  });

  const [made, setMade] = useState<CharacterChoices[]>([]);
  const [draft, setDraft] = useState<Draft>(() => fresh(0));
  const [refusal, setRefusal] = useState('');

  const left = remaining(module, draft.attributes);

  const bump = (attributeId: string, delta: number) => {
    const result = adjust(module, draft.attributes, attributeId, delta);
    if (!result.ok) { setRefusal(result.message); return; }
    setRefusal('');
    setDraft({ ...draft, attributes: result.attributes });
  };

  const finish = () => {
    const choices = toChoices(module, draft.name.trim() || `Hero ${made.length + 1}`,
      draft.ancestry, draft.characterClass, draft.attributes);
    const roster = [...made, choices];
    if (roster.length >= partySize) {
      onDone(roster);
      return;
    }
    setMade(roster);
    setDraft(fresh(roster.length));
    setRefusal('');
  };

  return (
    <>
      <p className="hint">
        Character {made.length + 1} of {partySize} · {left} point{left === 1 ? '' : 's'} left
      </p>

      <p>
        <input
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px', width: '100%' }}
        />
      </p>

      {rules.ancestries.length > 1 && (
        <div>
          <h4>Ancestry</h4>
          {rules.ancestries.map((ancestry) => (
            <button
              key={ancestry.id}
              className={`pick-card ${draft.ancestry === ancestry.id ? 'picked' : ''}`}
              onClick={() => setDraft({ ...draft, ancestry: ancestry.id })}
            >
              <b>{ancestry.name}</b>
              {ancestry.description && <div className="desc">{ancestry.description}</div>}
            </button>
          ))}
        </div>
      )}

      {rules.classes.length > 1 && (
        <div>
          <h4>Class</h4>
          {rules.classes.map((entry) => (
            <button
              key={entry.id}
              className={`pick-card ${draft.characterClass === entry.id ? 'picked' : ''}`}
              onClick={() => setDraft({ ...draft, characterClass: entry.id })}
            >
              <b>{entry.name}</b>
              {entry.description && <div className="desc">{entry.description}</div>}
            </button>
          ))}
        </div>
      )}

      <h4>Attributes</h4>
      {rules.attributes.map((attribute) => {
        const score = draft.attributes[attribute.id] ?? attribute.default;
        return (
          <div className="creation-row" key={attribute.id}>
            <span className="attr">{attribute.name}</span>
            <button className="btn" onClick={() => bump(attribute.id, -1)}>−</button>
            <span className="score">{score}</span>
            <button className="btn" onClick={() => bump(attribute.id, +1)}>+</button>
            <span className="cost">{costOf(module, attribute, score)} pts</span>
          </div>
        );
      })}
      {refusal && <p className="error-note">{refusal}</p>}

      <p style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn primary" onClick={finish}>
          {made.length + 1 >= partySize ? 'Begin' : 'Next character'}
        </button>
        <button className="btn" onClick={onCancel}>Skip — use the defaults</button>
      </p>
    </>
  );
}
