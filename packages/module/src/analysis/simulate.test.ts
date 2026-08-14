import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simulateMemory } from './simulate.js';

const doc = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../modules/greenmarch/module.json', import.meta.url)), 'utf8'),
) as Record<string, any>;

describe('simulateMemory', () => {
  const memory = doc['narrative']['memory'];
  const npcs = [
    { id: 'vess', memorySpan: 120, gullibility: 0.4 },
    { id: 'a', gullibility: 0.5 },
    { id: 'b', gullibility: 0.5 },
    { id: 'c', gullibility: 0.5 },
  ];

  it('starts with only the witnesses', () => {
    const result = simulateMemory(memory, npcs, { kind: 'mill_cleared', day: 1, witnesses: ['a'], severity: 15 }, { days: 30, seed: 1 });
    expect(result.days[0]!.knowers.map((k) => k.npc)).toEqual(['a']);
  });

  it('spreads to others over time', () => {
    const result = simulateMemory(memory, npcs, { kind: 'mill_cleared', day: 1, witnesses: ['a'], severity: 15 }, { days: 60, seed: 1 });
    expect(result.everKnew.length).toBeGreaterThan(1);
  });

  it('fades: strength falls as days pass', () => {
    const result = simulateMemory(memory, npcs, { kind: 'mill_cleared', day: 1, witnesses: ['a'], severity: 15 }, { days: 90, seed: 1 });
    const first = result.days[0]!.knowers.find((k) => k.npc === 'a')!.strength;
    const last = result.days.at(-1)!.knowers.find((k) => k.npc === 'a')!.strength;
    expect(last).toBeLessThan(first);
  });

  // The GM override in greenmarch: Vess always learns of a theft, and never forgets.
  it('honours alwaysKnownBy and a pinned half-life', () => {
    const result = simulateMemory(memory, npcs, { kind: 'theft', day: 1, witnesses: [], severity: 20 }, { days: 200, seed: 1 });
    expect(result.days[0]!.knowers.map((k) => k.npc)).toContain('vess');
    const last = result.days.at(-1)!.knowers.find((k) => k.npc === 'vess')!;
    expect(last.strength).toBeGreaterThan(0.9);
  });

  it('honours neverKnownBy', () => {
    const result = simulateMemory(memory, npcs, { kind: 'barrow_robbed', day: 1, witnesses: ['a'], severity: 10 }, { days: 90, seed: 1 });
    expect(result.everKnew).not.toContain('vess');
  });

  it('never forgets what the module says is unforgettable', () => {
    const result = simulateMemory(memory, npcs, { kind: 'barrow_robbed', day: 1, witnesses: ['a'], severity: 10 }, { days: 300, seed: 1 });
    expect(result.days.at(-1)!.knowers.find((k) => k.npc === 'a')!.strength).toBe(1);
  });

  it('does not spread below the minimum severity', () => {
    const result = simulateMemory(memory, npcs, { kind: 'mill_cleared', day: 1, witnesses: ['a'], severity: 1 }, { days: 90, seed: 1 });
    expect(result.everKnew).toEqual(['a']);
  });

  it('does not spread at all in manual mode', () => {
    const manual = { ...memory, mode: 'manual' };
    const result = simulateMemory(manual, npcs, { kind: 'mill_cleared', day: 1, witnesses: ['a'], severity: 20 }, { days: 90, seed: 1 });
    expect(result.everKnew).toEqual(['a']);
  });

  it('accumulates distortion with each retelling', () => {
    const result = simulateMemory(memory, npcs, { kind: 'mill_cleared', day: 1, witnesses: ['a'], severity: 15 }, { days: 90, seed: 3 });
    const hopped = result.days.at(-1)!.knowers.find((k) => k.hops > 0);
    if (hopped) expect(hopped.distortion).toBeGreaterThan(0);
  });

  it('is deterministic for a seed', () => {
    const run = () => JSON.stringify(simulateMemory(memory, npcs, { kind: 'mill_cleared', day: 1, witnesses: ['a'], severity: 15 }, { days: 40, seed: 9 }));
    expect(run()).toBe(run());
  });
});
