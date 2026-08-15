/**
 * `npm run newgame -- [module] [--seed N] [--party N]`
 *
 * Initiates a game and prints the resulting state. There is no play loop yet
 * (that is M3); this exists to make the bootstrap inspectable — every number
 * shown is computed from the module's own formulas.
 */

import type { CompiledModule } from '@dm/module';
import { newGame, defaultChoices, statsOf } from '@dm/engine';
import type { Entity, GameState } from '@dm/engine';
import { loadModule } from '../loader.js';

function flag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const NAMES = ['Ash', 'Vess', 'Korrin', 'Mire', 'Sable', 'Dun', 'Wren', 'Halt'];

function renderEntity(module: CompiledModule, e: Entity, indent = '  '): string {
  const stats = statsOf(module, e);
  const lines: string[] = [];

  const ancestry = e.ancestry ? module.get<{ name: string }>('content.ancestries', e.ancestry).name : '';
  const klass = e.characterClass ? module.get<{ name: string }>('content.classes', e.characterClass).name : '';
  lines.push(`${indent}${e.name}  —  level ${e.level} ${ancestry} ${klass}`.trimEnd());

  const attrs = module
    .all<{ id: string; abbrev: string }>('rules.attributes')
    .map((a) => {
      const mod = stats.mod[a.id] ?? 0;
      return `${a.abbrev} ${e.attributes[a.id]} (${mod >= 0 ? '+' : ''}${mod})`;
    })
    .join('   ');
  lines.push(`${indent}  ${attrs}`);

  const pools = module
    .all<{ id: string; name: string }>('rules.resources')
    .map((r) => `${r.name} ${e.resources[r.id]}/${stats.max[r.id]}`)
    .join('   ');
  if (pools) lines.push(`${indent}  ${pools}`);

  const derived = module
    .all<{ id: string; name: string }>('rules.derivedStats')
    .map((d) => `${d.name} ${stats.derived[d.id]}`)
    .join('   ');
  if (derived) lines.push(`${indent}  ${derived}`);

  if (e.abilities.length > 0) {
    const names = e.abilities.map((id) => module.get<{ name: string }>('content.abilities', id).name);
    lines.push(`${indent}  Abilities: ${names.join(', ')}`);
  }
  if (e.inventory.length > 0) {
    const carried = e.inventory
      .map((s) => {
        const item = module.get<{ name: string }>('content.items', s.item);
        return s.quantity > 1 ? `${item.name} x${s.quantity}` : item.name;
      })
      .join(', ');
    lines.push(`${indent}  Carrying: ${carried}`);
  }
  return lines.join('\n');
}

function renderState(module: CompiledModule, state: GameState): string {
  const time = module.source.world.time;
  const day = Math.floor(state.minute / time.minutesPerDay) + 1;
  const clock = state.minute % time.minutesPerDay;
  const hh = String(Math.floor(clock / 60)).padStart(2, '0');
  const mm = String(clock % 60).padStart(2, '0');

  const where =
    state.location.kind === 'dungeon'
      ? module.get<{ name: string }>('world.dungeons', state.location.dungeon).name
      : state.location.kind === 'poi'
        ? `${module.get<{ name: string }>('world.pointsOfInterest', state.location.poi).name}, ${
            module.get<{ name: string }>('world.areas', state.location.area).name
          }`
        : module.get<{ name: string }>('world.areas', state.location.area).name;

  const lines = [
    '',
    `  ${module.source.meta.title}   ${module.identity}`,
    `  seed ${state.seed}    day ${day}, ${hh}:${mm}    ${where}`,
    '',
    '  ── Party ' + '─'.repeat(48),
    '',
  ];

  for (const id of state.party) lines.push(renderEntity(module, state.entities[id]!), '');

  const facts: string[] = [];
  if (Object.keys(state.flags).length > 0) facts.push(`flags: ${JSON.stringify(state.flags)}`);
  if (Object.keys(state.reputation).length > 0) {
    facts.push(`reputation: ${JSON.stringify(state.reputation)}`);
  }
  if (facts.length > 0) {
    lines.push('  ── World ' + '─'.repeat(48), '', ...facts.map((f) => `  ${f}`), '');
  }

  const size = JSON.stringify(state).length;
  lines.push(`  state: ${size} bytes, rng [${state.rng.join(', ')}]`, '');
  return lines.join('\n');
}

function main(): number {
  const positional = process.argv[2];
  const moduleArg = positional && !positional.startsWith('--') ? positional : 'modules/minimal';

  let module: CompiledModule;
  try {
    module = loadModule(moduleArg);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }

  const seed = flag('seed', 12345);
  const partySize = Math.min(flag('party', module.source.start.partySize), module.source.start.partySize);

  try {
    const state = newGame(module, {
      seed,
      party: Array.from({ length: partySize }, (_, i) => defaultChoices(module, NAMES[i] ?? `Hero ${i + 1}`)),
    });
    process.stdout.write(renderState(module, state));

    // Same seed, same state — the property replay tests rest on.
    const again = newGame(module, {
      seed,
      party: Array.from({ length: partySize }, (_, i) => defaultChoices(module, NAMES[i] ?? `Hero ${i + 1}`)),
    });
    const identical = JSON.stringify(again) === JSON.stringify(state);
    process.stdout.write(`  reproducible from seed ${seed}: ${identical ? 'yes' : 'NO'}\n\n`);
    return identical ? 0 : 1;
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }
}

process.exit(main());
