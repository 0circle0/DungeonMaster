/** The world hierarchy: biome, area and POI, with the start location pinned on top. */

import { Fragment } from 'react';
import type { ModuleDoc } from '@/lib/store';
import {
  asList,
  displayName,
  hasAuthoredLayout,
  resolveStart,
  startOf,
  worldOf,
} from '@/lib/worldModel';
import type { WorldEntry } from '@/lib/worldModel';
import type { Selection } from '@/app/studio/selection';
import styles from '@/app/studio/studio.module.css';

export function StudioWorldTree(props: {
  doc: ModuleDoc;
  selection: Selection;
  onOpenStart: () => void;
  onOpenItem: (path: string, index: number) => void;
  onAdd: (path: string, seed: Record<string, unknown>) => void;
  onSetStart: (field: 'startingPoi' | 'startingArea' | 'startingDungeon', id: string) => void;
}) {
  const world = worldOf(props.doc);
  const biomes = asList(world['biomes']);
  const areas = asList(world['areas']);
  const pois = asList(world['pointsOfInterest']);
  const dungeons = asList(world['dungeons']);
  const gates = asList(world['gates']);
  const start = resolveStart(props.doc);
  const startConfig = startOf(props.doc);

  const gateName = (id: unknown) => displayName(gates.find((g) => g['id'] === id));

  const isActive = (path: string, index: number) =>
    props.selection.kind === 'item' && props.selection.path === path && props.selection.index === index;

  const startIsActive = props.selection.kind === 'start';

  const areaRow = (area: WorldEntry, index: number) => {
    const id = String(area['id'] ?? '');
    const areaPois = pois
      .map((poi, poiIndex) => ({ poi, poiIndex }))
      .filter(({ poi }) => poi['area'] === id);
    const isStartArea = start?.kind === 'area' && start.id === id;
    return (
      <Fragment key={`area_${index}`}>
        <div className={`${styles.treeRow} ${styles.treeIndent1} ${isActive('world.areas', index) ? styles.treeRowActive : ''}`}>
          <span className={styles.treeGlyph} title={hasAuthoredLayout(area) ? 'Hand-authored layout' : 'Generated from seed'}>
            {hasAuthoredLayout(area) ? '✎' : '🎲'}
          </span>
          <button className={styles.treeName} onClick={() => props.onOpenItem('world.areas', index)}>
            {displayName(area)}
          </button>
          {isStartArea && <span className={styles.treeChip}>start</span>}
          {area['requires'] !== undefined && <span className={`${styles.treeChip} ${styles.treeChipGate}`}>gated</span>}
          <button
            className={styles.treeAction}
            title="Start a new game in this area"
            onClick={() => props.onSetStart('startingArea', id)}
          >
            ▶ start here
          </button>
        </div>
        {areaPois.map(({ poi, poiIndex }) => poiRow(poi, poiIndex))}
        <button
          className={`${styles.treeAdd} ${styles.treeIndent2}`}
          onClick={() => props.onAdd('world.pointsOfInterest', { area: id })}
        >
          + point of interest
        </button>
      </Fragment>
    );
  };

  const poiRow = (poi: WorldEntry, index: number) => {
    const id = String(poi['id'] ?? '');
    const residentsRaw = poi['residents'];
    const residents = Array.isArray(residentsRaw)
      ? residentsRaw.filter((r): r is string => typeof r === 'string')
      : [];
    const isStartPoi = start?.kind === 'poi' && start.id === id;
    return (
      <div
        key={`poi_${index}`}
        className={`${styles.treeRow} ${styles.treeIndent2} ${isActive('world.pointsOfInterest', index) ? styles.treeRowActive : ''}`}
      >
        <span className={styles.treeGlyph} title={hasAuthoredLayout(poi) ? 'Hand-authored layout' : 'Generated from seed'}>
          {hasAuthoredLayout(poi) ? '✎' : '🎲'}
        </span>
        <button className={styles.treeName} onClick={() => props.onOpenItem('world.pointsOfInterest', index)}>
          {displayName(poi)}
        </button>
        {isStartPoi && <span className={styles.treeChip}>start</span>}
        {residents.length > 0 && (
          <span
            className={`${styles.treeChip} ${styles.treeChipResidents}`}
            title={`Residents (spawned on arrival):\n${residents.join('\n')}`}
          >
            ⌂ {residents.length}
          </span>
        )}
        {poi['gate'] !== undefined && (
          <span className={`${styles.treeChip} ${styles.treeChipGate}`} title={`Gate: ${gateName(poi['gate'])}`}>
            gate
          </span>
        )}
        {typeof poi['dungeon'] === 'string' && (
          <span className={`${styles.treeChip} ${styles.treeChipDungeon}`} title={`Leads into dungeon: ${String(poi['dungeon'])}`}>
            dungeon
          </span>
        )}
        <button
          className={styles.treeAction}
          title="Start a new game at this point of interest"
          onClick={() => props.onSetStart('startingPoi', id)}
        >
          ▶ start here
        </button>
      </div>
    );
  };

  const dungeonRow = (dungeon: WorldEntry, index: number) => {
    const id = String(dungeon['id'] ?? '');
    const isStartDungeon = start?.kind === 'dungeon' && start.id === id;
    return (
      <div
        key={`dungeon_${index}`}
        className={`${styles.treeRow} ${styles.treeIndent1} ${isActive('world.dungeons', index) ? styles.treeRowActive : ''}`}
      >
        <span className={styles.treeGlyph} title="Rooms, corridors, locks and keys are generated from the seed">
          🎲
        </span>
        <button className={styles.treeName} onClick={() => props.onOpenItem('world.dungeons', index)}>
          {displayName(dungeon)}
        </button>
        <span className={`${styles.treeChip} ${styles.treeChipDungeon}`}>dungeon</span>
        {isStartDungeon && <span className={styles.treeChip}>start</span>}
        <button
          className={styles.treeAction}
          title="Start a new game in this dungeon"
          onClick={() => props.onSetStart('startingDungeon', id)}
        >
          ▶ start here
        </button>
      </div>
    );
  };

  const knownBiomes = new Set(biomes.map((b) => b['id']));
  const orphanAreas = areas
    .map((area, index) => ({ area, index }))
    .filter(({ area }) => !knownBiomes.has(area['biome']));
  const knownAreas = new Set(areas.map((a) => a['id']));
  const orphanPois = pois
    .map((poi, index) => ({ poi, index }))
    .filter(({ poi }) => !knownAreas.has(poi['area']));
  const orphanDungeons = dungeons
    .map((dungeon, index) => ({ dungeon, index }))
    .filter(({ dungeon }) => !knownBiomes.has(dungeon['biome']));

  return (
    <div className={styles.tree}>
      <button
        className={`${styles.treeStart} ${startIsActive ? styles.treeStartActive : ''} ${start ? '' : styles.treeStartMissing}`}
        onClick={props.onOpenStart}
      >
        <span className={styles.treeStartGlyph}>▶</span>
        <span className={styles.treeStartWhere}>{start ? start.label : 'No start set'}</span>
        <span className={styles.treeStartKind}>
          {start ? `start · ${start.kind}` : 'pick one'}
        </span>
      </button>

      {biomes.map((biome, biomeIndex) => {
        const id = biome['id'];
        const biomeAreas = areas
          .map((area, index) => ({ area, index }))
          .filter(({ area }) => area['biome'] === id);
        const biomeDungeons = dungeons
          .map((dungeon, index) => ({ dungeon, index }))
          .filter(({ dungeon }) => dungeon['biome'] === id);
        return (
          <div className={styles.treeGroup} key={`biome_${biomeIndex}`}>
            <div className={`${styles.treeRow} ${isActive('world.biomes', biomeIndex) ? styles.treeRowActive : ''}`}>
              <button
                className={`${styles.treeName} ${styles.treeBiome}`}
                onClick={() => props.onOpenItem('world.biomes', biomeIndex)}
              >
                {displayName(biome)}
              </button>
            </div>
            {biomeAreas.map(({ area, index }) => areaRow(area, index))}
            {biomeDungeons.map(({ dungeon, index }) => dungeonRow(dungeon, index))}
            <button
              className={`${styles.treeAdd} ${styles.treeIndent1}`}
              onClick={() => props.onAdd('world.areas', { biome: String(id ?? '') })}
            >
              + area
            </button>
          </div>
        );
      })}

      {(orphanAreas.length > 0 || orphanPois.length > 0 || orphanDungeons.length > 0) && (
        <div className={styles.treeGroup}>
          <div className={styles.treeRow}>
            <span className={`${styles.treeName} ${styles.treeBiome}`}>Unplaced</span>
          </div>
          {orphanAreas.map(({ area, index }) => areaRow(area, index))}
          {orphanPois.map(({ poi, index }) => poiRow(poi, index))}
          {orphanDungeons.map(({ dungeon, index }) => dungeonRow(dungeon, index))}
        </div>
      )}

      {biomes.length === 0 && areas.length === 0 && dungeons.length === 0 && (
        <p className={styles.treeEmpty}>
          The world is empty. Add a biome, then an area inside it — or a dungeon for a dungeon-only module.
        </p>
      )}

      <button className={styles.treeAdd} onClick={() => props.onAdd('world.biomes', {})}>
        + biome
      </button>
      <button className={styles.treeAdd} onClick={() => props.onAdd('world.dungeons', {})}>
        + dungeon
      </button>
      {!startConfig['startingPoi'] && !startConfig['startingArea'] && !startConfig['startingDungeon'] && (
        <p className={styles.treeEmpty}>Tip: hover a row and press “▶ start here” to choose where play begins.</p>
      )}
    </div>
  );
}
