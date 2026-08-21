/** Render dialogue reachability as a graph. */

'use client';

import { useMemo, useState } from 'react';
import { summariseRequirement } from '@/lib/events';
import type { ModuleDoc } from '@/lib/store';
import { getAt } from '@/lib/store';

type Row = Record<string, unknown>;

interface Node {
  id: string;
  depth: number;
  row: number;
  says: number;
  remembers: string | null;
  optionCount: number;
  isEnd: boolean;
  reachable: boolean;
}

interface Edge {
  from: string;
  to: string;
  label: string;
  gated: boolean;
  kind: 'option' | 'check' | 'redirect';
}

const NODE_WIDTH = 190;
const NODE_HEIGHT = 54;
const COLUMN_GAP = 96;
const ROW_GAP = 26;

function layout(dialogue: Row): { nodes: Node[]; edges: Edge[] } {
  const rows = Array.isArray(dialogue['nodes']) ? (dialogue['nodes'] as Row[]) : [];
  const byId = new Map(rows.map((n) => [String(n['id']), n]));
  const start = String(dialogue['start'] ?? rows[0]?.['id'] ?? '');

  const edges: Edge[] = [];
  for (const node of rows) {
    const from = String(node['id']);

    for (const redirect of (node['redirectWhen'] as Row[] | undefined) ?? []) {
      edges.push({
        from,
        to: String(redirect['goto']),
        label: summariseRequirement(redirect['requires']).join(', ') || 'redirect',
        gated: true,
        kind: 'redirect',
      });
    }

    for (const option of (node['options'] as Row[] | undefined) ?? []) {
      const why = summariseRequirement(option['requires']);
      const text = String(option['text'] ?? option['id']);
      const check = option['check'] as Row | undefined;

      if (option['goto']) {
        edges.push({
          from,
          to: String(option['goto']),
          label: text,
          gated: why.length > 0,
          kind: 'option',
        });
      }
      // Add both success and failure branches for each check.
      if (check?.['onSuccess']) {
        edges.push({ from, to: String(check['onSuccess']), label: `${text} ✓`, gated: true, kind: 'check' });
      }
      if (check?.['onFailure']) {
        edges.push({ from, to: String(check['onFailure']), label: `${text} ✗`, gated: true, kind: 'check' });
      }
    }
  }

  // Breadth-first traversal assigns depth and reachability.
  const depth = new Map<string, number>();
  const queue: string[] = start ? [start] : [];
  depth.set(start, 0);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges.filter((e) => e.from === current)) {
      if (depth.has(edge.to)) continue;
      if (!byId.has(edge.to)) continue;
      depth.set(edge.to, (depth.get(current) ?? 0) + 1);
      queue.push(edge.to);
    }
  }

  const maxDepth = Math.max(0, ...[...depth.values()]);
  const perColumn = new Map<number, number>();

  const nodes: Node[] = rows.map((row) => {
    const id = String(row['id']);
    const reachable = depth.has(id);
    // Place unreachable nodes after the reachable graph.
    const column = reachable ? depth.get(id)! : maxDepth + 1;
    const position = perColumn.get(column) ?? 0;
    perColumn.set(column, position + 1);

    const options = (row['options'] as Row[] | undefined) ?? [];
    return {
      id,
      depth: column,
      row: position,
      says: Array.isArray(row['says']) ? (row['says'] as unknown[]).length : 0,
      remembers: row['remembers'] ? String(row['remembers']) : null,
      optionCount: options.length,
      isEnd: options.length === 0,
      reachable,
    };
  });

  return { nodes, edges };
}

export function DialogueGraph({ doc }: { doc: ModuleDoc }) {
  const dialogues = (getAt(doc, ['narrative', 'dialogues']) as Row[] | undefined) ?? [];
  const [selected, setSelected] = useState(0);
  const dialogue = dialogues[selected];

  const { nodes, edges } = useMemo(() => (dialogue ? layout(dialogue) : { nodes: [], edges: [] }), [dialogue]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const node of nodes) {
      map.set(node.id, {
        x: node.depth * (NODE_WIDTH + COLUMN_GAP) + 20,
        y: node.row * (NODE_HEIGHT + ROW_GAP) + 20,
      });
    }
    return map;
  }, [nodes]);

  if (dialogues.length === 0) {
    return (
      <>
        <h2 className="pane-title">Dialogue</h2>
        <p className="empty">No dialogues yet.</p>
      </>
    );
  }

  const width = Math.max(...nodes.map((n) => (positions.get(n.id)?.x ?? 0) + NODE_WIDTH), 400) + 40;
  const height = Math.max(...nodes.map((n) => (positions.get(n.id)?.y ?? 0) + NODE_HEIGHT), 200) + 40;
  const unreachable = nodes.filter((n) => !n.reachable);
  const danglingEdges = edges.filter((e) => !positions.has(e.to));

  return (
    <div className="dialogue-graph">
      <div className="pane-head">
        <h2 className="pane-title">
          Dialogue
          <code className="pane-path">reachability</code>
        </h2>
        <select className="input narrow" value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
          {dialogues.map((d, i) => (
            <option key={String(d['id'])} value={i}>
              {String(d['id'])}
            </option>
          ))}
        </select>
      </div>

      {(unreachable.length > 0 || danglingEdges.length > 0) && (
        <div className="graph-warnings">
          {unreachable.length > 0 && (
            <p>
              <strong>{unreachable.length} unreachable node{unreachable.length === 1 ? '' : 's'}:</strong>{' '}
              {unreachable.map((n) => n.id).join(', ')} — no path from the start node reaches
              {unreachable.length === 1 ? ' it' : ' them'}.
            </p>
          )}
          {danglingEdges.length > 0 && (
            <p>
              <strong>{danglingEdges.length} broken link{danglingEdges.length === 1 ? '' : 's'}:</strong>{' '}
              {danglingEdges.map((e) => `${e.from} → ${e.to}`).join(', ')}
            </p>
          )}
        </div>
      )}

      <div className="graph-scroll">
        <svg width={width} height={height} className="graph-svg">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#4e5468" />
            </marker>
          </defs>

          {edges.map((edge, i) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;

            const x1 = from.x + NODE_WIDTH;
            const y1 = from.y + NODE_HEIGHT / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_HEIGHT / 2;
            // A loop back to an earlier column needs to bow outward to stay readable.
            const backwards = x2 < x1;
            const midX = backwards ? x1 + 40 : (x1 + x2) / 2;

            return (
              <g key={i}>
                <path
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${backwards ? x2 - 40 : midX} ${y2}, ${x2} ${y2}`}
                  className={`edge ${edge.kind} ${edge.gated ? 'gated' : ''}`}
                  markerEnd="url(#arrow)"
                />
                <title>{edge.label}</title>
              </g>
            );
          })}

          {nodes.map((node) => {
            const position = positions.get(node.id)!;
            return (
              <g key={node.id} transform={`translate(${position.x}, ${position.y})`}>
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={6}
                  className={`gnode ${node.reachable ? '' : 'unreachable'} ${node.isEnd ? 'ending' : ''}`}
                />
                <text x={10} y={20} className="gnode-title">
                  {node.id}
                </text>
                <text x={10} y={38} className="gnode-meta">
                  {node.says} line{node.says === 1 ? '' : 's'} · {node.optionCount} option
                  {node.optionCount === 1 ? '' : 's'}
                  {node.remembers ? ' · remembers' : ''}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="hint">
        Solid edges are ordinary replies; dashed edges are gated or the outcome of a check. Nodes with
        no options end the conversation.
      </p>
    </div>
  );
}
