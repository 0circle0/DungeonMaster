/**
 * The studio's entry form. Nothing is hidden: every field renders, in an
 * order that reads top-down as "what is this, what makes it work, then the
 * fine print" — identity (id, name, description) first, the promoted fields
 * from lib/importantFields.ts next, the rest in schema order, and the
 * free-form `extra` bag last. Complex sections collapse individually, and
 * start open, so folding is the author's choice rather than the default.
 */

import { useState } from 'react';
import type { FieldEntry, FieldSpec } from '@/lib/schema';
import { labelFor } from '@/lib/schema';
import { getAt } from '@/lib/store';
import type { ModuleStore, Path } from '@/lib/store';
import { importantFieldsFor } from '@/lib/importantFields';
import { rendersAsGroup } from '@/lib/fieldContent';
import { fieldLabel } from '@/lib/labels';
import { Field } from '@/components/Field';
import styles from '@/app/studio/studio.module.css';

/** Fields that say what a thing *is*; they lead every form. */
const IDENTITY = ['id', 'name', 'description'];

const EXTRA_HINT =
  'Free-form data the engine carries through untouched — a place for notes and your own tooling.';

export function ItemForm(props: {
  spec: FieldSpec;
  /** Collection or singleton path the registry is keyed by, e.g. `world.areas`. */
  registryPath: string;
  basePath: Path;
  store: ModuleStore;
  /**
   * Keys to leave out. For the map drawer, which addresses its subject by `id`
   * and would lose track of it the moment that field were edited.
   */
  omit?: ReadonlySet<string>;
}) {
  const { spec, store } = props;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  if (spec.kind !== 'object') return null;

  const value = (getAt(store.doc, props.basePath) ?? {}) as Record<string, unknown>;
  const important = importantFieldsFor(props.registryPath);

  // Identity, promoted (registry order), the rest (schema order), extra last.
  const byKey = new Map(spec.fields.map((f) => [f.key, f]));
  const ordered: FieldEntry[] = [];
  const push = (field: FieldEntry | undefined) => {
    if (field && !ordered.includes(field) && !props.omit?.has(field.key)) ordered.push(field);
  };
  for (const key of IDENTITY) push(byKey.get(key));
  for (const key of important) push(byKey.get(key));
  for (const field of spec.fields) if (field.key !== 'extra') push(field);
  push(byKey.get('extra'));

  const toggle = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
  };

  return (
    <div>
      {ordered.map((field) => {
        const isContainer = rendersAsGroup(field.spec);
        const name = fieldLabel(labelFor(field.key));
        const rendered = (
          <Field
            key={field.key}
            spec={field.spec}
            value={value[field.key] ?? field.defaultValue}
            path={[...props.basePath, field.key]}
            // Containers get their label from the section header instead.
            label={isContainer ? undefined : name}
            // …which is why the name is handed down separately: an array item
            // still needs to know what it is one of.
            context={isContainer ? name : undefined}
            description={field.key === 'extra' ? EXTRA_HINT : field.description}
            optional={field.optional}
            idsByCollection={store.idsByCollection}
            onChange={store.set}
            onRemove={store.remove}
            depth={1}
            expandOptional
          />
        );

        if (!isContainer) return rendered;

        const isCollapsed = collapsed.has(field.key);
        return (
          <div key={field.key} className={styles.section}>
            <button className={styles.sectionHead} onClick={() => toggle(field.key)}>
              {isCollapsed ? '▸' : '▾'} {fieldLabel(labelFor(field.key))}
              <span className={styles.sectionCount}>{countOf(field, value[field.key])}</span>
            </button>
            {!isCollapsed && rendered}
          </div>
        );
      })}
    </div>
  );
}

/** A small size note for a section header, so a folded section still informs. */
function countOf(field: FieldEntry, value: unknown): string {
  if (field.spec.kind === 'array') return Array.isArray(value) ? String(value.length) : '0';
  if (field.spec.kind === 'record') {
    const keys = typeof value === 'object' && value !== null ? Object.keys(value).length : 0;
    return String(keys);
  }
  // Only a missing object with no schema default is genuinely unset — an
  // absent defaulted object (an area's `map`) compiles to its default anyway.
  if (field.spec.kind === 'object') {
    return value == null && field.defaultValue == null ? 'unset' : '';
  }
  return '';
}
