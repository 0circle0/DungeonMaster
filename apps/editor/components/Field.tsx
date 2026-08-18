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

import { createContext, useContext, useState } from 'react';
import type { Diagnostic } from '@dm/module';
import type { FieldEntry, FieldSpec } from '@/lib/schema';
import { labelFor, stepFor } from '@/lib/schema';
import { fieldLabel } from '@/lib/labels';
import { hasContent, rendersAsGroup } from '@/lib/fieldContent';
import type { Path } from '@/lib/store';
import { JsonBox } from './JsonBox';
import { withEntryIndex } from '@/lib/diagnosticPath';

/**
 * Height of one pinned header, and how many may stack.
 *
 * A gate inside a dialogue option reaches nine levels, and nine stacked
 * headers would be the whole panel. Four costs 104px of a ~600px column, which
 * is already as much as orientation is worth; deeper groups simply scroll.
 */
const HEAD_ROW = 26;
const MAX_PINNED = 4;

/**
 * Problems, keyed by the path they are about.
 *
 * The console at the bottom of the studio has always known what is wrong and
 * where, but a path is not where the author is looking — the field is. Passing
 * this through context rather than as a prop keeps the recursive renderer's
 * signature unchanged; every leaf is wrapped by `Labelled`, so one lookup there
 * covers every content type there will ever be.
 */
export const FieldDiagnostics = createContext<ReadonlyMap<string, readonly Diagnostic[]>>(new Map());

/**
 * Which fields of the entry being edited no longer follow their prefab.
 *
 * The prefab panel already lists them, and that is not the same thing. An
 * author changing a value needs to know *at the value* that they have just
 * unlinked it — otherwise the two states that matter most, "this follows the
 * prefab" and "this is mine now", look identical in the only place anybody
 * looks. Overridden fields render marked, with the way back next to them.
 *
 * `base` is the entry's own path, so a leaf can work out what it is called
 * relative to the entry, which is the spelling `overriddenPaths` returns.
 */
export interface OverrideInfo {
  readonly base: Path;
  readonly paths: ReadonlySet<string>;
  readonly reset: (relativePath: string) => void;
}

export const FieldOverrides = createContext<OverrideInfo | null>(null);

/**
 * Group diagnostics by path, for the context above.
 *
 * Two spellings have to be flattened into the one the form uses. The compiler
 * writes `monsters[0]` where a form path is dotted, and a mod names an entry by
 * id — `content.monsters.grave_hound` — where a form path counts. Without the
 * second, a mod could say which field was wrong and the field would never know.
 */
export function diagnosticsByPath(
  diagnostics: readonly Diagnostic[],
  /** The document, for turning an id into an index. */
  doc?: unknown,
): ReadonlyMap<string, readonly Diagnostic[]> {
  const out = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    const dotted = diagnostic.path.replace(/\[(\d+)\]/g, '.$1');
    const key = doc === undefined ? dotted : (withEntryIndex(doc, dotted) ?? dotted);
    const bucket = out.get(key);
    if (bucket) bucket.push(diagnostic);
    else out.set(key, [diagnostic]);
  }
  return out;
}

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
  /** Render optional object fields inline rather than behind a fold. Off by default. */
  expandOptional?: boolean;
  /**
   * What the enclosing section is called, for levels whose own label is a bare
   * index. Lets an array item head read "Nodes 3" rather than "3".
   */
  context?: string;
  /** Put an empty revealed section away again. Absent when there is nothing to undo. */
  onHide?: () => void;
}

/**
 * The same list with one item somewhere else.
 *
 * Every other item comes back as the same object, so moving a dialogue option
 * re-checks that option rather than the whole entry it lives in.
 */
function moved(items: readonly unknown[], from: number, to: number): unknown[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
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
          <Labelled path={path} label={label} description={description ?? spec.refHelp ?? `→ ${spec.ref}`}>
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
        <Labelled path={path} label={label} description={description}>
          {spec.long ? (
            <textarea className="input" rows={3} value={text} onChange={(e) => onChange(path, e.target.value)} />
          ) : (
            <input className="input" value={text} onChange={(e) => onChange(path, e.target.value)} />
          )}
        </Labelled>
      );
    }

    case 'number': {
      const step = stepFor(spec);
      return (
        <Labelled path={path} label={label} description={description}>
          <input
            className="input narrow"
            type="number"
            step={step}
            // The declared bounds, so the arrows stop where the schema does
            // instead of walking a probability past 1 and failing validation.
            {...(spec.min !== null ? { min: spec.min } : {})}
            {...(spec.max !== null ? { max: spec.max } : {})}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => {
              const next = e.target.value === '' ? undefined : Number(e.target.value);
              if (next === undefined) onRemove(path);
              else onChange(path, next);
            }}
          />
        </Labelled>
      );
    }

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
        <Labelled path={path} label={label} description={description}>
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
      // The section head supplies the name at the top level, so `label` is blank
      // there; `context` carries it down so an item still knows what it is one of.
      const name = label ?? props.context;
      return (
        <div className="group">
          <GroupHead depth={depth} label={label}>
            <span className="count">{items.length}</span>
            <button className="btn tiny" onClick={() => onChange([...path, items.length], emptyValue(spec.element))}>
              + Add
            </button>
            {props.onHide && <HideButton onHide={props.onHide} />}
          </GroupHead>
          {description && <p className="hint">{description}</p>}
          <div className={inline ? 'inline-list' : 'stack'}>
            {items.map((item, i) => (
              <div key={i} className={inline ? 'inline-item' : 'card'}>
                <Field
                  {...props}
                  spec={spec.element}
                  value={item}
                  path={[...path, i]}
                  label={inline ? undefined : name ? `${name} ${i + 1}` : `${i + 1}`}
                  description={null}
                  depth={depth + 1}
                  // An item is present by construction; inheriting the array's
                  // own optionality would offer to unset the item as if it were
                  // the whole list.
                  optional={false}
                  context={name}
                  onHide={undefined}
                />
                {/* Order is content here, not presentation: quest objectives
                    are checked in order unless `ordered` is off, and dialogue
                    options are read top to bottom by whoever is playing. Until
                    now the only way to move one was to delete it and retype it
                    at the end. */}
                {items.length > 1 && (
                  <div className="reorder">
                    <button
                      className="btn tiny"
                      title="Move up"
                      disabled={i === 0}
                      onClick={() => onChange(path, moved(items, i, i - 1))}
                    >
                      ↑
                    </button>
                    <button
                      className="btn tiny"
                      title="Move down"
                      disabled={i === items.length - 1}
                      onClick={() => onChange(path, moved(items, i, i + 1))}
                    >
                      ↓
                    </button>
                  </div>
                )}
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

    case 'object':
      return <ObjectField {...props} spec={spec} depth={depth} />;

    case 'record': {
      const entries = Object.entries((value ?? {}) as Record<string, unknown>);
      const options = spec.keyRef ? (idsByCollection[spec.keyRef] ?? []) : [];
      const unused = options.filter((id) => !entries.some(([k]) => k === id));
      return (
        <div className="group">
          <GroupHead depth={depth} label={label}>
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
            {props.onHide && <HideButton onHide={props.onHide} />}
          </GroupHead>
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
                  context={label ?? props.context}
                  onHide={undefined}
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
          <GroupHead depth={depth} label={label}>
            <span className="badge">{spec.flavour}</span>
            {props.onHide && <HideButton onHide={props.onHide} />}
          </GroupHead>
          {description && <p className="hint">{description}</p>}
          <JsonBox value={value} onChange={(next) => onChange(path, next)} />
        </div>
      );

    default:
      return (
        <div className="group">
          <GroupHead depth={depth} label={label}>
            {props.onHide && <HideButton onHide={props.onHide} />}
          </GroupHead>
          <JsonBox value={value} onChange={(next) => onChange(path, next)} />
        </div>
      );
  }
}

/**
 * One group's header bar, pinned so you can still see what you are inside.
 *
 * The offset comes from `depth`, which every recursion already threads, so
 * nested headers stack rather than cover one another; shallower ones sit on top,
 * which is what makes the hand-off read right as a deep group scrolls away under
 * its parent. Sticky is bounded by the parent's padding box, so a header never
 * outlives its own content.
 *
 * Two things this depends on and would break silently: `.group-head.pinned`
 * needs an opaque background (content scrolls *under* it), and no ancestor may
 * set `overflow`.
 *
 * The label span is rendered only when there is a label. A top-level container
 * is named by its section head instead, and pinning a blank bar would cost a row
 * and say nothing.
 */
function GroupHead(props: { depth: number; label?: string; children?: React.ReactNode }) {
  const slot = props.depth - 1;
  const pinned = slot >= 1 && slot <= MAX_PINNED && Boolean(props.label);
  return (
    <div
      className={`group-head ${pinned ? 'pinned' : ''}`}
      style={pinned ? { top: slot * HEAD_ROW, zIndex: 10 - props.depth } : undefined}
    >
      {props.label && <span className="group-label">{props.label}</span>}
      {props.children}
    </div>
  );
}

/** Put back a section that was revealed and then left empty. */
function HideButton(props: { onHide: () => void }) {
  return (
    <button className="btn tiny" title="Hide again — nothing was added" onClick={props.onHide}>
      ×
    </button>
  );
}

/**
 * An object's fields, with the empty optional ones folded into one dropdown.
 *
 * A component rather than a `case` because it holds state, and a hook inside a
 * switch is a rules-of-hooks violation nothing here would catch.
 *
 * Revealing writes **nothing to the document**. Writing the schema default back
 * would be invisible (the section would re-hide itself on the next render, since
 * emptiness is judged on the raw value) and writing a blank entry would fail
 * `idSchema` and post an error for what was only a request to see a field. So
 * "which sections am I looking at" stays where it belongs, in the view.
 */
function ObjectField(props: FieldProps & { spec: Extract<FieldSpec, { kind: 'object' }>; depth: number }) {
  const { spec, value, path, label, description, optional, onChange, onRemove, depth } = props;
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());

  const reveal = (key: string) => setRevealed(new Set(revealed).add(key));
  const hide = (key: string) => {
    const next = new Set(revealed);
    next.delete(key);
    setRevealed(next);
  };

  // An absent optional object is not there at all. Rendering its fields
  // with the schema defaults filled in reads as "this exists" — a POI with
  // no interior map showed a live 7×7 — and a single keystroke in any of
  // them would silently materialize the object.
  if (optional && value == null) {
    return (
      <div className="group">
        <GroupHead depth={depth} label={label}>
          <span className="empty">not set</span>
          <button className="btn tiny" onClick={() => onChange(path, emptyValue(spec))}>
            + Add
          </button>
          {props.onHide && <HideButton onHide={props.onHide} />}
        </GroupHead>
        {description && <p className="hint">{description}</p>}
      </div>
    );
  }

  const object = (value ?? {}) as Record<string, unknown>;
  const required = spec.fields.filter((f) => !f.optional);
  const extras = spec.fields.filter((f) => f.optional);

  // Only below the top level: `ItemForm` gives depth-1 fields their own section
  // heads and counts, and folding those would move the form's outline about
  // depending on what happens to be filled in.
  const nested = depth >= 1 && props.expandOptional === true;
  const foldable = (field: FieldEntry) =>
    nested && rendersAsGroup(field.spec) && !hasContent(object[field.key]) && !revealed.has(field.key);
  const shown = extras.filter((field) => !foldable(field));
  const hidden = extras.filter(foldable);

  const renderEntry = (field: FieldEntry, isOptional: boolean) => (
    <Field
      {...props}
      key={field.key}
      spec={field.spec}
      value={isOptional ? (object[field.key] ?? field.defaultValue) : object[field.key]}
      path={[...path, field.key]}
      label={fieldLabel(labelFor(field.key))}
      description={field.description}
      optional={isOptional}
      depth={depth + 1}
      context={undefined}
      // Offered only while the section is still empty; once something is in it,
      // removing it is the array's or object's own business.
      onHide={revealed.has(field.key) && !hasContent(object[field.key]) ? () => hide(field.key) : undefined}
    />
  );

  return (
    <div className={depth === 0 ? 'form' : 'group'}>
      {(label || optional) && depth > 0 && (
        <GroupHead depth={depth} label={label}>
          {optional && (
            <button
              className="btn tiny danger"
              title="Remove this — back to not set"
              onClick={() => onRemove(path)}
            >
              × unset
            </button>
          )}
          {props.onHide && <HideButton onHide={props.onHide} />}
        </GroupHead>
      )}
      {required.map((field) => renderEntry(field, false))}
      {shown.length > 0 &&
        (props.expandOptional ? (
          shown.map((field) => renderEntry(field, true))
        ) : (
          <Collapsible label={`Optional (${shown.length})`}>
            {shown.map((field) => renderEntry(field, true))}
          </Collapsible>
        ))}
      {hidden.length > 0 && (
        <div className="add-row">
          <select className="input narrow" value="" onChange={(e) => e.target.value && reveal(e.target.value)}>
            <option value="">+ add…</option>
            {hidden.map((field) => (
              <option key={field.key} value={field.key}>
                {fieldLabel(labelFor(field.key))}
              </option>
            ))}
          </select>
          <span className="count">{hidden.length} more</span>
        </div>
      )}
    </div>
  );
}

function Labelled(props: {
  label?: string;
  description?: string | null;
  path?: Path;
  children: React.ReactNode;
}) {
  const byPath = useContext(FieldDiagnostics);
  const problems = props.path ? (byPath.get(props.path.join('.')) ?? []) : [];
  const worst = problems.find((d) => d.severity === 'error') ?? problems[0];

  const overrides = useContext(FieldOverrides);
  // Only inside the entry the override info is about. A nested inspector or a
  // path that is not under `base` must not borrow another entry's marks.
  const relative =
    overrides && props.path && props.path.length > overrides.base.length &&
    overrides.base.every((segment, i) => props.path?.[i] === segment)
      ? props.path.slice(overrides.base.length).join('.')
      : null;
  const overridden = relative !== null && overrides !== null && overrides.paths.has(relative);

  return (
    <div className={`field${worst ? ` field-${worst.severity}` : ''}${overridden ? ' field-overridden' : ''}`}>
      {props.label && (
        <label className="label">
          {props.label}
          {overridden && (
            <>
              <span className="override-mark" title="Changed here — the prefab no longer sets this">
                overridden
              </span>
              <button
                className="override-reset"
                title="Take the prefab's value back"
                onClick={() => overrides.reset(relative)}
              >
                reset
              </button>
            </>
          )}
        </label>
      )}
      {props.children}
      {/* The problem where the field is, rather than only in the console. The
          hint is what says how to fix it, so it is shown when there is one. */}
      {worst && (
        <em className={`field-problem ${worst.severity}`}>
          {worst.message}
          {worst.hint ? ` — ${worst.hint}` : ''}
        </em>
      )}
      {props.description && !worst && <em className="hint">{props.description}</em>}
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
