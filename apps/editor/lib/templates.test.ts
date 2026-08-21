import { describe, it, expect } from 'vitest';
import { compileModule, lintModule } from '@dm/module';
import { blankModule } from './templates';

describe('the blank module scaffold', () => {
  it('compiles', () => {
    const result = compileModule(blankModule());
    if (!result.ok) {
      throw new Error(`blank module does not compile:\n${result.errors.map((e) => `${e.path}: ${e.message}`).join('\n')}`);
    }
    expect(result.ok).toBe(true);
  });

  it('lints clean except for the intended start to-dos', () => {
    const result = lintModule(JSON.stringify(blankModule()));
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.map((e) => e.code).sort()).toEqual(['empty_world', 'no_start_location']);
  });
});
