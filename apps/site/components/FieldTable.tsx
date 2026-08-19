/**
 * A section of the format, as a table.
 *
 * Server rendered, so the page ships finished HTML and the schemas stay on the
 * build machine. Rows carry `data-row` and a lowercase `data-text` so the
 * filter can hide them without any of this being re-rendered on the client.
 */

import Link from 'next/link';
import { anchorFor, linkFor, type DocField, type DocSection, type TypeNode } from '../lib/fields';

function TypeCell({ node }: { node: TypeNode }) {
  switch (node.kind) {
    case 'scalar':
      return <span className="t-scalar">{node.name}</span>;
    case 'id':
      return <span className="t-scalar">id</span>;
    case 'dice':
      return <Link className="t-link" href="/format/dsl#dice">dice</Link>;
    case 'ref':
      return <Link className="t-ref" href={linkFor(node.target)}>{node.target}</Link>;
    case 'enum':
      // One chip per value rather than a run of pipe separated text. Twelve
      // values on one line is what made the type column 145 characters wide;
      // chips wrap between values and never inside one.
      return (
        <span className="t-enum">
          {node.values.map((value) => <code key={value}>{value}</code>)}
        </span>
      );
    case 'literal':
      return <code>{node.value}</code>;
    case 'object': {
      const label = node.variants ? `object, ${node.variants} variants` : 'object';
      return node.section
        ? <Link className="t-link" href={`#${anchorFor(node.section)}`}>{label}</Link>
        : <span className="t-scalar">{label}</span>;
    }
    case 'dsl':
      return <Link className="t-link" href={`/format/dsl#${node.dsl}`}>{node.dsl}</Link>;
    case 'array':
      return <><TypeCell node={node.of} /><span className="t-arr">[]</span></>;
    case 'record':
      return (
        <span className="t-record">
          {'{ '}<TypeCell node={node.key} />{': '}<TypeCell node={node.value} />{' }'}
        </span>
      );
    case 'union':
      return (
        <>
          {node.of.map((branch, index) => (
            <span key={index}>
              {index > 0 ? <span className="t-bar"> | </span> : null}
              <TypeCell node={branch} />
            </span>
          ))}
        </>
      );
  }
}

function defaultOf(value: unknown): string {
  if (value === undefined) return '';
  if (Array.isArray(value) && value.length === 0) return '[]';
  if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) return '{}';
  const text = JSON.stringify(value);
  return text.length > 42 ? `${text.slice(0, 41)}…` : text;
}

function Row({ field }: { field: DocField }) {
  return (
    <tr data-row data-text={`${field.path} ${field.doc}`.toLowerCase()}>
      <td><code className="f-key">{field.key}</code></td>
      <td className="f-type"><span className="t-wrap"><TypeCell node={field.type} /></span></td>
      <td className="f-req">{field.required ? <span className="req">yes</span> : null}</td>
      <td className="f-def">{defaultOf(field.defaultValue) ? <code>{defaultOf(field.defaultValue)}</code> : null}</td>
      <td className="f-doc">{field.doc}</td>
    </tr>
  );
}

export function FieldTable({ section, note }: { section: DocSection; note?: React.ReactNode }) {
  return (
    <section className="sec" id={anchorFor(section.path)} data-section data-text={section.path.toLowerCase()}>
      <h3>
        <a href={`#${anchorFor(section.path)}`} className="sec-anchor">{section.title}</a>
        <code className="sec-path">{section.path}</code>
      </h3>
      {note ? <p className="sec-note">{note}</p> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Field</th><th>Type</th><th>Req</th><th>Default</th><th>What it does</th></tr>
          </thead>
          <tbody>
            {section.fields.map((field) => <Row key={field.path} field={field} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function FieldTables({ sections }: { sections: DocSection[] }) {
  return <>{sections.map((section) => <FieldTable key={section.path} section={section} />)}</>;
}
