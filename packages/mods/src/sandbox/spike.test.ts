/**
 * Phase 0 spike: does QuickJS-in-WASM meet the three properties the mod design
 * depends on?
 *
 *   1. It instantiates and evaluates **synchronously** after an async setup, so
 *      `reduce()` can stay a synchronous pure function.
 *   2. Non-determinism can be removed by construction — `Date` and
 *      `Math.random` deleted rather than policed.
 *   3. A runaway mod is interrupted rather than hanging the host.
 *
 * If any of these fail the sandbox choice changes, so this file runs first and
 * is kept afterwards as the regression guard on the QuickJS upgrade path.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';

let QuickJS: QuickJSWASMModule;

beforeAll(async () => {
  QuickJS = await newQuickJSWASMModuleFromVariant(variant);
});

describe('quickjs spike', () => {
  it('evaluates synchronously once the module is instantiated', () => {
    const runtime = QuickJS.newRuntime();
    const context = runtime.newContext();
    try {
      const result = context.evalCode('1 + 1');
      expect(context.dump(context.unwrapResult(result))).toBe(2);
    } finally {
      context.dispose();
      runtime.dispose();
    }
  });

  it('calls a registered function synchronously and round-trips JSON', () => {
    const runtime = QuickJS.newRuntime();
    const context = runtime.newContext();
    try {
      context.unwrapResult(
        context.evalCode(`
          globalThis.handler = (json) => {
            const input = JSON.parse(json);
            return JSON.stringify({ doubled: input.n * 2 });
          };
        `),
      ).dispose();

      const fn = context.getProp(context.global, 'handler');
      const arg = context.newString(JSON.stringify({ n: 21 }));
      const out = context.unwrapResult(context.callFunction(fn, context.undefined, arg));
      expect(JSON.parse(context.getString(out))).toEqual({ doubled: 42 });
      out.dispose();
      arg.dispose();
      fn.dispose();
    } finally {
      context.dispose();
      runtime.dispose();
    }
  });

  it('has no Date, Math.random, or fetch after the prelude deletes them', () => {
    const runtime = QuickJS.newRuntime();
    const context = runtime.newContext();
    try {
      context.unwrapResult(
        context.evalCode(`
          delete globalThis.Date;
          delete globalThis.performance;
          Math.random = undefined;
        `),
      ).dispose();

      const probe = context.unwrapResult(
        context.evalCode(`JSON.stringify({
          date: typeof globalThis.Date,
          random: typeof Math.random,
          fetch: typeof globalThis.fetch,
          process: typeof globalThis.process,
          require: typeof globalThis.require,
        })`),
      );
      expect(JSON.parse(context.getString(probe))).toEqual({
        date: 'undefined',
        random: 'undefined',
        fetch: 'undefined',
        process: 'undefined',
        require: 'undefined',
      });
      probe.dispose();
    } finally {
      context.dispose();
      runtime.dispose();
    }
  });

  it('interrupts an infinite loop instead of hanging', () => {
    const runtime = QuickJS.newRuntime();
    let ticks = 0;
    runtime.setInterruptHandler(() => ++ticks > 2_000);
    const context = runtime.newContext();
    try {
      const result = context.evalCode('while (true) {}');
      // An interrupt surfaces as an error result, not a thrown host exception.
      expect(result.error).toBeDefined();
      result.error?.dispose();
      expect(ticks).toBeGreaterThan(2_000);
    } finally {
      context.dispose();
      runtime.dispose();
    }
  });

  it('contains a throwing mod: the error is a result, not a host exception', () => {
    const runtime = QuickJS.newRuntime();
    const context = runtime.newContext();
    try {
      const result = context.evalCode('throw new Error("mod exploded")');
      expect(result.error).toBeDefined();
      const dumped = context.dump(result.error!) as { message?: string };
      expect(dumped.message).toBe('mod exploded');
      result.error?.dispose();
    } finally {
      context.dispose();
      runtime.dispose();
    }
  });

  it('crosses the boundary fast enough for the reduce hot path', () => {
    const runtime = QuickJS.newRuntime();
    const context = runtime.newContext();
    try {
      context.unwrapResult(
        context.evalCode(`
          globalThis.handler = (json) => {
            const input = JSON.parse(json);
            return JSON.stringify({ n: input.entities.length });
          };
        `),
      ).dispose();

      // ~1 KB, shaped like a real hook payload rather than filler.
      const payload = JSON.stringify({
        hook: 'action.before',
        now: { minute: 480, day: 2, map: 'mill_interior', outcome: 'ongoing' },
        subject: { action: { type: 'attack', target: 'e:12' }, actorId: 'e:1' },
        entities: Array.from({ length: 12 }, (_, i) => ({
          id: `e:${i}`,
          hp: 10 + i,
          tags: ['living', 'hostile'],
        })),
      });
      expect(payload.length).toBeGreaterThan(700);

      const fn = context.getProp(context.global, 'handler');
      const runs = 10_000;
      const started = performance.now();
      for (let i = 0; i < runs; i++) {
        const arg = context.newString(payload);
        const out = context.unwrapResult(context.callFunction(fn, context.undefined, arg));
        context.getString(out);
        out.dispose();
        arg.dispose();
      }
      const perCall = ((performance.now() - started) * 1000) / runs;
      fn.dispose();

      // eslint-disable-next-line no-console
      console.log(`[bench] ${payload.length}B payload: ${perCall.toFixed(1)}µs per crossing`);

      // A turn makes well under 20 crossings, so anything at or below ~100µs
      // keeps mods invisible next to perceiveAll and runAiTurns. Generous
      // enough not to flake on a loaded machine.
      expect(perCall).toBeLessThan(100);
    } finally {
      context.dispose();
      runtime.dispose();
    }
  });

  it('binds a host function the sandbox can call back into', () => {
    const runtime = QuickJS.newRuntime();
    const context = runtime.newContext();
    try {
      const draws: number[] = [];
      const next = 0.25;
      const random = context.newFunction('random', () => {
        draws.push(next);
        return context.newNumber(next);
      });
      context.setProp(context.global, '__random', random);
      random.dispose();

      const out = context.unwrapResult(context.evalCode('__random() + __random()'));
      expect(context.dump(out)).toBe(0.5);
      expect(draws).toEqual([0.25, 0.25]);
      out.dispose();
      void next;
    } finally {
      context.dispose();
      runtime.dispose();
    }
  });
});
