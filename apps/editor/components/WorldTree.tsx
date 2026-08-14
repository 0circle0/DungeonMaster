/**
 * The world as a tree: Biome → Area → Point of Interest.
 *
 * The flat per-collection lists are still there and still work, but a world is
 * authored spatially — you think "what is in the fens", not "show me every
 * point of interest in the module". This view makes the containment visible,
 * surfaces the gates and triggers hanging off each place, and is where a
 * missing connection or an orphaned area becomes obvious.
 */

'use client';

import { useMemo } from 'react';
import type { ModuleDoc } from '@/lib/store';
import { getAt } from '@/lib/store';

interface Named {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export interface WorldTreeProps {
  doc: ModuleDoc;
  onOpen: (collectionPath: string, index: number) => void;
  onAdd: (collectionPath: string, seed: Record<string, unknown>) => void;
}

function list(doc: ModuleDoc, path: string): Named[] {
  const value = getAt(doc, path.split('.'));
  return Array.isArray(value) ? (value as Named[]) : [];
}

export function WorldTree({ doc, onOpen, onAdd }: WorldTreeProps) {
  const biomes = list(doc, 'world.biomes');
  const areas = list(doc, 'world.areas');
  const pois = list(doc, 'world.pointsOfInterest');
  const gates = list(doc, 'world.gates');
  const dungeons = list(doc, 'world.dungeons');

  const index = useMemo(() => {
    const areasByBiome = new Map<string, { entry: Named; index: number }[]>();
    areas.forEach((entry, i) => {
      const key = String(entry['biome'] ?? '');
      const bucket = areasByBiome.get(key) ?? [];
      bucket.push({ entry, index: i });
      areasByBiome.set(key, bucket);
    });

    const poisByArea = new Map<string, { entry: Named; index: number }[]>();
    pois.forEach((entry, i) => {
      const key = String(entry['area'] ?? '');
      const bucket = poisByArea.get(key) ?? [];
      bucket.push({ entry, index: i });
      poisByArea.set(key, bucket);
    });

    return { areasByBiome, poisByArea };
  }, [areas, pois]);

  const gateName = (id: unknown) => gates.find((g) => g.id === id)?.name ?? String(id);
  const dungeonName = (id: unknown) => dungeons.find((d) => d.id === id)?.name ?? String(id);

  // Areas and points of interest whose parent does not exist would otherwise be
  // invisible in a tree — surfaced rather than silently dropped.
  const orphanAreas = index.areasByBiome.get('') ?? [];
  const orphanPois: { entry: Named; index: number }[] = [];
  for (const [areaId, bucket] of index.poisByArea) {
    if (!areas.some((a) => a.id === areaId)) orphanPois.push(...bucket);
  }
  const unknownParentAreas = [...index.areasByBiome]
    .filter(([biomeId]) => biomeId !== '' && !biomes.some((b) => b.id === biomeId))
    .flatMap(([, bucket]) => bucket);

  return (
    <div className="world-tree">
      <div className="pane-head">
        <h2 className="pane-title">
          World
          <code className="pane-path">biome → area → point of interest</code>
        </h2>
        <button className="btn primary" onClick={() => onAdd('world.biomes', { name: 'New Biome' })}>
          + Biome
        </button>
      </div>

      {biomes.length === 0 && <p className="empty">No biomes yet. A world starts with one.</p>}

      {biomes.map((biome, biomeIndex) => {
        const inBiome = index.areasByBiome.get(biome.id) ?? [];
        return (
          <section className="tree-biome" key={biome.id}>
            <div className="tree-row biome">
              <button className="tree-name" onClick={() => onOpen('world.biomes', biomeIndex)}>
                {biome.name ?? biome.id}
              </button>
              <code className="tree-id">{biome.id}</code>
              <span className="tree-meta">{String(biome['layer'] ?? 'underworld')}</span>
              <button
                className="btn tiny"
                onClick={() => onAdd('world.areas', { name: 'New Area', biome: biome.id })}
              >
                + Area
              </button>
            </div>

            {inBiome.length === 0 && <p className="empty indent">no areas in this biome</p>}

            {inBiome.map(({ entry: area, index: areaIndex }) => {
              const inArea = index.poisByArea.get(area.id) ?? [];
              const connections = Array.isArray(area['connections'])
                ? (area['connections'] as { to?: unknown; gate?: unknown }[])
                : [];
              const triggers = Array.isArray(area['triggers']) ? area['triggers'].length : 0;

              return (
                <div className="tree-area" key={area.id}>
                  <div className="tree-row area">
                    <button className="tree-name" onClick={() => onOpen('world.areas', areaIndex)}>
                      {area.name ?? area.id}
                    </button>
                    <code className="tree-id">{area.id}</code>
                    {typeof area['dangerLevel'] === 'number' && (
                      <span className="tree-meta">danger {area['dangerLevel']}</span>
                    )}
                    {triggers > 0 && <span className="tree-chip">{triggers} trigger{triggers === 1 ? '' : 's'}</span>}
                    <button
                      className="btn tiny"
                      onClick={() => onAdd('world.pointsOfInterest', { name: 'New Place', area: area.id })}
                    >
                      + Place
                    </button>
                  </div>

                  {connections.length > 0 && (
                    <div className="tree-connections indent">
                      {connections.map((connection, i) => (
                        <span className="tree-conn" key={i}>
                          → {String(connection.to)}
                          {connection.gate ? <em> via {gateName(connection.gate)}</em> : null}
                        </span>
                      ))}
                    </div>
                  )}

                  {inArea.map(({ entry: poi, index: poiIndex }) => {
                    const poiTriggers = Array.isArray(poi['triggers']) ? poi['triggers'].length : 0;
                    return (
                      <div className="tree-row poi" key={poi.id}>
                        <button
                          className="tree-name"
                          onClick={() => onOpen('world.pointsOfInterest', poiIndex)}
                        >
                          {poi.name ?? poi.id}
                        </button>
                        <code className="tree-id">{poi.id}</code>
                        <span className="tree-meta">{String(poi['kind'] ?? 'landmark')}</span>
                        {poi['hidden'] === true && <span className="tree-chip hidden">hidden</span>}
                        {poi['gate'] ? (
                          <span className="tree-chip gate">🔒 {gateName(poi['gate'])}</span>
                        ) : null}
                        {poi['dungeon'] ? (
                          <span className="tree-chip dungeon">⛏ {dungeonName(poi['dungeon'])}</span>
                        ) : null}
                        {poiTriggers > 0 && (
                          <span className="tree-chip">{poiTriggers} trigger{poiTriggers === 1 ? '' : 's'}</span>
                        )}
                      </div>
                    );
                  })}

                  {inArea.length === 0 && <p className="empty indent2">nothing here yet</p>}
                </div>
              );
            })}
          </section>
        );
      })}

      {(orphanAreas.length > 0 || unknownParentAreas.length > 0 || orphanPois.length > 0) && (
        <section className="tree-biome orphans">
          <div className="tree-row biome">
            <span className="tree-name warn-text">Unplaced</span>
            <span className="tree-meta">these will not appear in the world</span>
          </div>
          {[...orphanAreas, ...unknownParentAreas].map(({ entry, index: i }) => (
            <div className="tree-row area" key={`a-${entry.id}`}>
              <button className="tree-name" onClick={() => onOpen('world.areas', i)}>
                {entry.name ?? entry.id}
              </button>
              <span className="tree-chip err">
                {entry['biome'] ? `unknown biome "${String(entry['biome'])}"` : 'no biome'}
              </span>
            </div>
          ))}
          {orphanPois.map(({ entry, index: i }) => (
            <div className="tree-row poi" key={`p-${entry.id}`}>
              <button className="tree-name" onClick={() => onOpen('world.pointsOfInterest', i)}>
                {entry.name ?? entry.id}
              </button>
              <span className="tree-chip err">unknown area &quot;{String(entry['area'])}&quot;</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
