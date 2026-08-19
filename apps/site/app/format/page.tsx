import Link from 'next/link';
import { Page, Code, Note } from '../../components/Page';
import { collectionPaths, formatSize, pageFor, anchorFor } from '../../lib/fields';

export default function Format() {
  const size = formatSize();
  return (
    <Page
      here="/format"
      title="The document"
      lede="How a world is put together, and how to read the tables on the pages that follow."
    >
      <p>
        A world is one JSON file with seven top level keys. Five carry the game. Every table on
        these pages is generated from the same definition the studio checks your work against.
      </p>

      <h2>Reading a table</h2>
      <table className="plain">
        <tbody>
          <tr><td><code>Field</code></td><td>The property name, exactly as it is written in JSON.</td></tr>
          <tr><td><code>Type</code></td><td>What may go there. A blue name is a reference to another collection and links to it.</td></tr>
          <tr><td><code>Req</code></td><td>Marked when the field must be present. Everything else may be left out.</td></tr>
          <tr><td><code>Default</code></td><td>What you get when it is left out.</td></tr>
          <tr><td><code>What it does</code></td><td>One line. Where a field has a trap, this is the trap rather than the obvious meaning.</td></tr>
        </tbody>
      </table>
      <p>
        {size.fields} fields across {size.sections} sections. Use the filter box on each page to
        narrow by name or description.
      </p>

      <h2>Ids</h2>
      <p>
        Everything is addressed by id. An id is lowercase letters, digits, and underscores,
        starting with a letter, up to 64 characters, and unique inside its collection.
      </p>
      <Code>{`iron_sword    crypt_03    the_mill_door`}</Code>
      <p>
        Every reference is proven to resolve before a world will load. In the studio a reference
        field is a dropdown of ids that exist. A few fields hold a bare id that is{' '}
        <em>not</em> checked; each says so in its description.
      </p>

      <Note title="Unknown properties are refused">
        Every object rejects a property it does not recognise, and names it. Adding data of your
        own goes <Link href="/custom">through one of six mechanisms</Link>.
      </Note>

      <h2>The addressable collections</h2>
      <p>Every one of these is a list whose entries are identified by an <code>id</code>.</p>
      <div className="cards">
        {collectionPaths().map((path) => (
          <Link key={path} href={`${pageFor(path)}#${anchorFor(path)}`} className="card">
            <b>{path.split('.')[1]}</b>
            <span>{path}</span>
          </Link>
        ))}
      </div>

      <h2>Your world is a file</h2>
      <ul>
        <li>The studio keeps worlds in your browser and saves as you work.</li>
        <li><b>Export</b> hands you the JSON. That file is the whole world.</li>
        <li>Export writes exactly what you wrote. A field you left out stays out.</li>
        <li>Opening accepts an exported file, a hand written world, or either compressed.</li>
      </ul>
    </Page>
  );
}
