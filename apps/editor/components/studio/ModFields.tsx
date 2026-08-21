/** Fields a mod added to whatever is selected. */

'use client';

import { Field } from '@/components/Field';
import type { FieldSpec } from '@/lib/schema';
import { getAt } from '@/lib/store';
import type { ModuleStore, Path } from '@/lib/store';
import type { OwnedField } from '@/lib/modRuntime';
import styles from '@/app/studio/studio.module.css';

/** A mod's field description, in the terms the generated form already speaks. */
function specFor(field: OwnedField): FieldSpec {
  switch (field.kind) {
    case 'number':
      return { kind: 'number', int: false, min: field.min ?? null, max: field.max ?? null };
    case 'boolean':
      return { kind: 'boolean' };
    case 'select':
      return { kind: 'enum', options: field.options ?? [] };
    default:
      return { kind: 'string', ref: null, refHelp: null, long: false, pattern: null };
  }
}

export function ModFields(props: {
  store: ModuleStore;
  basePath: Path;
  fields: readonly OwnedField[];
}) {
  if (props.fields.length === 0) return null;

  return (
    <div className={styles.modFields}>
      <div className={styles.modFieldsHead}>
        Added by mods
        <span className="count">{props.fields.length}</span>
      </div>
      {props.fields.map((field) => {
        const path: Path = [...props.basePath, ...field.path];
        return (
          <div key={`${field.modId}:${field.path.join('.')}`} className={styles.modField}>
            <Field
              spec={specFor(field)}
              value={getAt(props.store.doc, path)}
              path={path}
              label={field.label}
              description={field.help ?? null}
              idsByCollection={props.store.idsByCollection}
              onChange={props.store.set}
              onRemove={props.store.remove}
            />
            {/* Whose field this is, because an unattributed one reads as part
                of the format and would be looked for in the schema. */}
            <code className={styles.modFieldOwner}>{field.modId}</code>
          </div>
        );
      })}
    </div>
  );
}
