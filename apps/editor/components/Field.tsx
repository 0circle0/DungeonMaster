/**
 * The generated form renderer.
 *
 * Renders any {@link FieldSpec} the schema produces. The payoff is that no
 * content type has bespoke UI: monsters, quests, biomes, and anything added
 * later all render through this one component.
 *
 * The most useful behaviour here is that `ref:` fields become dropdowns of the
 * ids that actually exist in the module. Dangling references are the failure
 * the compiler works hardest to catch, and this makes them close to unauthorable
 * in the first place.
 */

'use client';

import { useState } from 'react';
import type { FieldSpec } from '@/lib/schema';
import { labelFor } from '@/lib/schema';
import type { Path } from '@/lib/store';
import { JsonBox } from './JsonBox';

export interface FieldProps {
  spec: FieldSpec;
  value: unknown;
  path: Path;
  label?: string;
  description?: string | null;
  optional?: boolean;
  idsByCollection: Record<string, string[]>;
  onChange: (path: Path, value: unknown) => void;
  onRemove: (path: Path) => void;
  depth?: number;
}

/** A sensible empty value, so "Add" produces something the schema accepts. */
export function emptyValue(spec: FieldSpec): unknown {
  switch (spec.kind) {
    case 'string':
      return '';
    case 'number':
      return spec.min ?? 0;
    case 'boolean':
      return false;
    case 'enum':
      return spec.options[0] ?? '';
    case 'array':
      return [];
    case 'record':
      return {};
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const field of spec.fields) {
        if (!field.optional) out[field.key] = emptyValue(field.spec);
      }
      return out;
    }
    case 'dsl':
      return spec.flavour === 'effect' || spec.flavour === 'rule' ? [] : {};
    default:
      return null;
  }
}

export function Field(props: FieldProps) {
  const { spec, value, path, label, description, optional, idsByCollection, onChange, onRemove } = props;
  const depth = props.depth ?? 0;

  switch (spec.kind) {
    case 'string': {
      // A reference field: offer only ids that exist.
      if (spec.ref) {
        const options = idsByCollection[spec.ref] ?? [];
        const current = typeof value === 'string' ? value : '';
        const missing = current !== '' && !options.includes(current);
        return (
          <Labelled label={label} description={description ?? `→ ${spec.ref}`}>
            <select
              className={`input ${missing ? 'invalid' : ''}`}
              value={current}
              onChange={(e) => (e.target.value === '' ? onRemove(path) : onChange(path, e.target.value))}
            >
              <option value="">{optional ? '— none —' : '— choose —'}</option>
              {missing && <option value={current}>{current} (missing)</option>}
              {options.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </Labelled>
        );
      }

      const text = typeof value === 'string' ? value : '';
      return (
        <Labelled label={label} description={description}>
          {spec.long ? (
            <textarea className="input" rows={3} value={text} onChange={(e) => onChange(path, e.target.value)} />
          ) : (
            <input className="input" value={text} onChange={(e) => onChange(path, e.target.value)} />
          )}
        </Labelled>
      );
    }

    case 'number':
      return (
        <Labelled label={label} description={description}>
          <input
            className="input narrow"
            type="number"
            step={spec.int ? 1 : 'any'}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => {
              const next = e.target.value === '' ? undefined : Number(e.target.value);
              if (next === undefined) onRemove(path);
              else onChange(path, next);
            }}
          />
        </Labelled>
      );

    case 'boolean':
      return (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(path, e.target.checked)}
          />
          <span>{label}</span>
          {description && <em className="hint">{description}</em>}
        </label>
      );

    case 'enum':
      return (
        <Labelled label={label} description={description}>
          <select
            className="input"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(path, e.target.value)}
          >
            {optional && <option value="">— none —</option>}
            {spec.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Labelled>
      );

    case 'array': {
      const items = Array.isArray(value) ? value : [];
      // Short scalar lists (tags, ability ids) render inline rather than as cards.
      const inline = spec.element.kind === 'string' || spec.element.kind === 'number';
      return (
        <div className="group">
          <div className="group-head">
            <span className="group-label">{label}</span>
            <span className="count">{items.length}</span>
            <button className="btn tiny" onClick={() => onChange([...path, items.length], emptyValue(spec.element))}>
              + Add
            </button>
          </div>
          {description && <p className="hint">{description}</p>}
          <div className={inline ? 'inline-list' : 'stack'}>
            {items.map((item, i) => (
              <div key={i} className={inline ? 'inline-item' : 'card'}>
                <Field
                  {...props}
                  spec={spec.element}
                  value={item}
                  path={[...path, i]}
                  label={inline ? undefined : `${i + 1}`}
                  description={null}
                  depth={depth + 1}
                />
                <button className="btn tiny danger" title="Remove" onClick={() => onRemove([...path, i])}>
                  ×
                </button>
              </div>
            ))}
            {items.length === 0 && <p className="empty">none</p>}
          </div>
        </div>
      );
    }

    case 'object': {
      const object = (value ?? {}) as Record<string, unknown>;
      const required = spec.fields.filter((f) => !f.optional);
      const extras = spec.fields.filter((f) => f.optional);
      return (
        <div className={depth === 0 ? 'form' : 'group'}>
          {label && depth > 0 && <div className="group-label">{label}</div>}
          {required.map((field) => (
            <Field
              {...props}
              key={field.key}
              spec={field.spec}
              value={object[field.key]}
              path={[...path, field.key]}
              label={labelFor(field.key)}
              description={field.description}
              optional={false}
              depth={depth + 1}
            />
          ))}
          {extras.length > 0 && (
            <Collapsible label={`Optional (${extras.length})`}>
              {extras.map((field) => (
                <Field
                  {...props}
                  key={field.key}
                  spec={field.spec}
                  value={object[field.key] ?? field.defaultValue}
                  path={[...path, field.key]}
                  label={labelFor(field.key)}
                  description={field.description}
                  optional
                  depth={depth + 1}
                />
              ))}
            </Collapsible>
          )}
        </div>
      );
    }

    case 'record': {
      const entries = Object.entries((value ?? {}) as Record<string, unknown>);
      const options = spec.keyRef ? (idsByCollection[spec.keyRef] ?? []) : [];
      const unused = options.filter((id) => !entries.some(([k]) => k === id));
      return (
        <div className="group">
          <div className="group-head">
            <span className="group-label">{label}</span>
            {spec.keyRef ? (
              <select
                className="input narrow"
                value=""
                onChange={(e) => e.target.value && onChange([...path, e.target.value], emptyValue(spec.value))}
              >
                <option value="">+ add…</option>
                {unused.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            ) : (
              <KeyAdder onAdd={(key) => onChange([...path, key], emptyValue(spec.value))} />
            )}
          </div>
          {description && <p className="hint">{description}</p>}
          <div className="stack">
            {entries.map(([key, entryValue]) => (
              <div key={key} className="row">
                <code className="key">{key}</code>
                <Field
                  {...props}
                  spec={spec.value}
                  value={entryValue}
                  path={[...path, key]}
                  label={undefined}
                  description={null}
                  depth={depth + 1}
                />
                <button className="btn tiny danger" onClick={() => onRemove([...path, key])}>
                  ×
                </button>
              </div>
            ))}
            {entries.length === 0 && <p className="empty">none</p>}
          </div>
        </div>
      );
    }

    // The DSL is edited as JSON: a generic form renders recursive unions badly,
    // and authors reason about effects as the JSON they will read back.
    case 'dsl':
      return (
        <div className="group">
          <div className="group-head">
            <span className="group-label">{label}</span>
            <span className="badge">{spec.flavour}</span>
          </div>
          {description && <p className="hint">{description}</p>}
          <JsonBox
            value={value}
            onChange={(next) => onChange(path, next)}
            placeholder={
              spec.flavour === 'effect'
                ? '[ { "damage": { "target": { "ref": "target.id" }, "amount": { "roll": "1d6" } } } ]'
                : spec.flavour === 'predicate'
                  ? '{ "gte": [ { "ref": "actor.attr.might" }, 14 ] }'
                  : '{ "add": [ { "ref": "actor.level" }, 2 ] }'
            }
          />
        </div>
      );

    default:
      return (
        <div className="group">
          <div className="group-label">{label}</div>
          <JsonBox value={value} onChange={(next) => onChange(path, next)} />
        </div>
      );
  }
}

function Labelled(props: { label?: string; description?: string | null; children: React.ReactNode }) {
  return (
    <div className="field">
      {props.label && <label className="label">{props.label}</label>}
      {props.children}
      {props.description && <em className="hint">{props.description}</em>}
    </div>
  );
}

function Collapsible(props: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="collapsible">
      <button className="collapse-toggle" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {props.label}
      </button>
      {open && <div className="collapse-body">{props.children}</div>}
    </div>
  );
}

function KeyAdder(props: { onAdd: (key: string) => void }) {
  const [key, setKey] = useState('');
  return (
    <span className="key-adder">
      <input
        className="input narrow"
        placeholder="new key"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && key.trim()) {
            props.onAdd(key.trim());
            setKey('');
          }
        }}
      />
    </span>
  );
}
