/** The clamp is the design, so it is what the tests are about. */

import { describe, it, expect } from 'vitest';
import { Rng } from '@dm/core';
import { evalExpr } from '@dm/module';
import type { Expr } from '@dm/module';
import { standingDc, dcAt } from './standing.js';

const run = (expr: Record<string, unknown>, standing: number): unknown =>
  evalExpr(expr as Expr, {
    scope: { reputation: { wardens: standing } },
    rng: Rng.fromSeed(1),
  });

describe('standingDc', () => {
  it('is the base at standing 0', () => {
    expect(run(standingDc(14, 'wardens'), 0)).toBe(14);
  });

  it('moves a point every five, in the asker’s favour', () => {
    expect(run(standingDc(14, 'wardens'), 5)).toBe(13);
    expect(run(standingDc(14, 'wardens'), 20)).toBe(10);
    expect(run(standingDc(14, 'wardens'), -20)).toBe(18);
  });

  it('clamps, so goodwill never makes it automatic nor hatred impossible', () => {
    expect(run(standingDc(14, 'wardens'), 100)).toBe(8);
    expect(run(standingDc(14, 'wardens'), -100)).toBe(20);
  });

  it('takes a span and a rate', () => {
    expect(run(standingDc(14, 'wardens', { span: 2, per: 10 }), 100)).toBe(12);
  });

  it('is fractional between steps, because the DSL divides for real', () => {
    expect(run(standingDc(14, 'wardens'), -27)).toBeCloseTo(19.4);
    expect(dcAt(14, -27)).toBeCloseTo(19.4);
  });

  /** The preview and the expression are one rule; this is what keeps them one. */
  it('dcAt predicts what the expression evaluates to', () => {
    for (const options of [{}, { span: 2, per: 10 }, { span: 8, per: 3 }]) {
      for (let standing = -60; standing <= 60; standing += 3) {
        expect(dcAt(14, standing, options)).toBe(run(standingDc(14, 'wardens', options), standing));
      }
    }
  });
});
