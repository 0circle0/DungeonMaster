/** One worked example: a title, the JSON, and a line about it. */

import type { Formula as FormulaData } from '../lib/formulas';

const KIND_LABEL: Record<FormulaData['kind'], string> = {
  expr: 'expression',
  predicate: 'predicate',
  effects: 'effects',
  rule: 'rule',
};

export function Formula({ formula }: { formula: FormulaData }) {
  return (
    <div className="ex">
      <div className="ex-head">
        <b>{formula.title}</b>
        <span className="ex-kind">{KIND_LABEL[formula.kind]}</span>
      </div>
      <pre className="code"><code>{formula.json}</code></pre>
      {formula.note ? <p className="ex-note">{formula.note}</p> : null}
    </div>
  );
}

export function Big({
  formula,
}: {
  formula: FormulaData & { where: string; what: string };
}) {
  return (
    <div className="ex ex-big">
      <div className="ex-head">
        <b>{formula.title}</b>
        <span className="ex-kind">{KIND_LABEL[formula.kind]}</span>
      </div>
      <p className="ex-what">{formula.what}</p>
      <div className="ex-where">Goes in <code>{formula.where}</code></div>
      <pre className="code"><code>{formula.json}</code></pre>
      {formula.note ? <p className="ex-note">{formula.note}</p> : null}
    </div>
  );
}
