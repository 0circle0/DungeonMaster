/** The frame every documentation page sits in: navigation, a title, and the body. */

import { Nav } from './Nav';

export function Page({
  here,
  title,
  lede,
  children,
}: {
  here: string;
  title: string;
  lede?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="side"><Nav here={here} /></aside>
      <main className="main">
        <header className="page-head">
          <h1>{title}</h1>
          {lede ? <p className="lede">{lede}</p> : null}
        </header>
        {children}
      </main>
    </div>
  );
}

/** A fenced example. */
export function Code({ children }: { children: string }) {
  return <pre className="code"><code>{children}</code></pre>;
}

/** A short labelled note that is worth stopping at. */
export function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="note">
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}
