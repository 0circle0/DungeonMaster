/** The world clock, beyond counting minutes. */

import type { CompiledModule } from '@dm/module';

interface PhaseDef {
  id: string;
  name: string;
  startMinute: number;
}

export interface WorldDate {
  /** Days since the game began, counting the first as 1. */
  readonly day: number;
  readonly dayOfMonth: number;
  /** 1-based, so it reads like a date rather than an array index. */
  readonly month: number;
  readonly monthName: string | null;
  readonly year: number;
  readonly hour: number;
  readonly minute: number;
}

/** Which phase of the day it is, or null underground. */
export function phaseOf(
  module: CompiledModule,
  minute: number,
  layer: 'overworld' | 'underworld' = 'overworld',
): { id: string; name: string } | null {
  if (layer === 'underworld') return null;

  const time = module.source.world.time;
  const phases = [...(time.dayPhases as PhaseDef[])].sort((a, b) => a.startMinute - b.startMinute);
  if (phases.length === 0) return null;

  const clock = ((minute % time.minutesPerDay) + time.minutesPerDay) % time.minutesPerDay;

  // The last phase that has already started.
  let current = phases[phases.length - 1]!;
  for (const phase of phases) {
    if (phase.startMinute <= clock) current = phase;
  }
  return { id: current.id, name: current.name };
}

/** The calendar date, from a module's own month length and names. */
export function dateOf(module: CompiledModule, minute: number): WorldDate {
  const time = module.source.world.time;
  const day = Math.floor(minute / time.minutesPerDay) + 1;
  const clock = minute % time.minutesPerDay;

  const perHour = time.minutesPerHour;
  const monthLength = Math.max(1, time.daysPerMonth);
  const names = time.monthNames;
  const monthsPerYear = Math.max(1, names.length);

  const dayIndex = day - 1;
  const monthIndex = Math.floor(dayIndex / monthLength);

  return {
    day,
    dayOfMonth: (dayIndex % monthLength) + 1,
    month: (monthIndex % monthsPerYear) + 1,
    monthName: names.length > 0 ? (names[monthIndex % monthsPerYear] ?? null) : null,
    year: Math.floor(monthIndex / monthsPerYear) + 1,
    hour: Math.floor(clock / perHour),
    minute: clock % perHour,
  };
}

/** Which layer the party is standing on, for the phase. */
export function layerOf(
  module: CompiledModule,
  location: { kind: string; area?: string },
): 'overworld' | 'underworld' {
  if (location.kind === 'dungeon') return 'underworld';
  if (!location.area) return 'overworld';

  const area = module.find<{ layer?: string; biome?: string }>('world.areas', location.area);
  if (area?.layer === 'underworld') return 'underworld';

  // An area that declares no layer inherits its biome's.
  const biome = area?.biome
    ? module.find<{ layer?: string }>('world.biomes', area.biome)
    : undefined;
  return biome?.layer === 'underworld' ? 'underworld' : 'overworld';
}
