/** The QuickJS host. */

import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import type { QuickJSContext, QuickJSRuntime, QuickJSWASMModule } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';

import { PRELUDE_SOURCE } from './prelude.js';
import type {
  HostOptions,
  InstallResult,
  LoadedMod,
  SandboxCall,
  SandboxHost,
  SandboxResult,
} from './host.js';

let wasmModule: QuickJSWASMModule | null = null;

/** Instantiate the WASM module once per process. */
export async function prepareSandbox(): Promise<void> {
  wasmModule ??= await newQuickJSWASMModuleFromVariant(variant);
}

interface InstalledMod {
  readonly mod: LoadedMod;
  readonly runtime: QuickJSRuntime;
  readonly context: QuickJSContext;
  readonly registered: readonly string[];
  failures: number;
}

/** Create a host. */
export function createHost(options: HostOptions): SandboxHost {
  if (!wasmModule) {
    throw new Error('createHost: call and await prepareSandbox() before creating a host');
  }
  const quickjs = wasmModule;
  const quarantineAfter = options.quarantineAfter ?? 3;

  const mods = new Map<string, InstalledMod>();
  const quarantine = new Set<string>();

  /** Per-call scratch, rebound on every crossing. */
  let draws = 0;
  let logs: string[] = [];
  let random: () => number = () => 0;
  let query: (path: string) => string | null = () => null;

  function install(mod: LoadedMod): InstallResult {
    const id = mod.manifest.id;
    const issues: string[] = [];

    const runtime = quickjs.newRuntime();
    runtime.setMemoryLimit(mod.manifest.limits.memoryBytes);

    let steps = 0;
    const budget = mod.manifest.limits.steps;
    runtime.setInterruptHandler(() => ++steps > budget);

    const context = runtime.newContext();

    const bind = (name: string, fn: (...args: string[]) => unknown) => {
      const handle = context.newFunction(name, (...args) => {
        const decoded = args.map((a) => (context.typeof(a) === 'string' ? context.getString(a) : ''));
        const out = fn(...decoded);
        if (typeof out === 'number') return context.newNumber(out);
        if (typeof out === 'string') return context.newString(out);
        return context.null;
      });
      context.setProp(context.global, name, handle);
      handle.dispose();
    };

    bind('__dm_random', () => {
      draws += 1;
      return random();
    });
    bind('__dm_query', (path: string) => query(path) ?? '');
    bind('__dm_log', (message: string) => {
      logs.push(message);
      return '';
    });

    const preludeResult = context.evalCode(PRELUDE_SOURCE);
    if (preludeResult.error) {
      const detail = describeError(context, preludeResult.error);
      preludeResult.error.dispose();
      context.dispose();
      runtime.dispose();
      return { ok: false, registered: [], issues: [`prelude failed: ${detail}`] };
    }
    preludeResult.value.dispose();

    // The entry file, then any other file the mod ships, are evaluated as one script each.
    const entry = mod.manifest.entry;
    const others = Object.keys(mod.files)
      .filter((p) => p !== entry && p !== 'mod.json' && p.endsWith('.js'))
      .sort();

    steps = 0;
    for (const path of [...others, entry]) {
      const source = mod.files[path];
      if (source === undefined) {
        issues.push(`${path} is declared but missing`);
        continue;
      }
      const result = context.evalCode(source, path);
      if (result.error) {
        const detail = describeError(context, result.error);
        result.error.dispose();
        context.dispose();
        runtime.dispose();
        return { ok: false, registered: [], issues: [...issues, `${path}: ${detail}`] };
      }
      result.value.dispose();
    }

    const registered = readRegistered(context);

    // Declared-but-unregistered is a warning: a hook the manifest promised was never installed.
    const declared = new Set(mod.manifest.hooks.map((h) => h.hook));
    for (const name of declared) {
      if (!registered.includes(name)) issues.push(`declares hook ${JSON.stringify(name)} but never registers one`);
    }
    // Registered-but-undeclared is an error: an undeclared handler is never crossed to.
    for (const name of registered) {
      if (!declared.has(name)) {
        issues.push(`registers hook ${JSON.stringify(name)} that the manifest does not declare — it would never run`);
      }
    }

    mods.set(id, { mod, runtime, context, registered, failures: 0 });
    return { ok: true, registered, issues };
  }

  function call(request: SandboxCall): SandboxResult {
    const entry = mods.get(request.mod);
    if (!entry) return { ok: false, kind: 'uninstalled', error: `mod ${request.mod} is not installed` };
    if (quarantine.has(request.mod)) {
      return { ok: false, kind: 'uninstalled', error: `mod ${request.mod} is quarantined` };
    }

    draws = 0;
    logs = [];
    random = request.random;
    query = request.query;

    const { context } = entry;
    let outcome: SandboxResult;

    const dispatch = context.getProp(context.global, '__dm_dispatch');
    const hookArg = context.newString(request.hook);
    const payloadArg = context.newString(request.payload);
    try {
      const result = context.callFunction(dispatch, context.undefined, hookArg, payloadArg);
      if (result.error) {
        const detail = describeError(context, result.error);
        result.error.dispose();
        outcome = { ok: false, kind: classify(detail), error: detail };
      } else {
        const text = context.getString(result.value);
        result.value.dispose();
        outcome = decode(text, draws, logs);
      }
    } catch (error) {
      // A host-side throw — a disposed handle, an FFI fault — must not escape into the engine either.
      outcome = { ok: false, kind: 'threw', error: error instanceof Error ? error.message : String(error) };
    } finally {
      payloadArg.dispose();
      hookArg.dispose();
      dispatch.dispose();
    }

    if (!outcome.ok) {
      entry.failures += 1;
      if (entry.failures >= quarantineAfter) quarantine.add(request.mod);
    }
    return outcome;
  }

  return {
    target: options.target,
    install,
    call,
    quarantined: (id) => quarantine.has(id),
    installed: (id) => mods.has(id),
    dispose() {
      for (const entry of mods.values()) {
        entry.context.dispose();
        entry.runtime.dispose();
      }
      mods.clear();
    },
  };
}

function decode(text: string, draws: number, logs: readonly string[]): SandboxResult {
  if (text === 'null') return { ok: true, directives: [], draws, logs };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, kind: 'badreturn', error: 'returned a value that is not JSON' };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, kind: 'badreturn', error: 'returned something other than a list of directives' };
  }
  return { ok: true, directives: parsed, draws, logs };
}

/** Reads the failure kind back off QuickJS's message. */
function classify(detail: string): 'threw' | 'interrupted' | 'oom' {
  const lower = detail.toLowerCase();
  if (lower.includes('interrupt')) return 'interrupted';
  if (lower.includes('out of memory') || lower.includes('oom')) return 'oom';
  return 'threw';
}

function describeError(context: QuickJSContext, handle: Parameters<QuickJSContext['dump']>[0]): string {
  try {
    const dumped = context.dump(handle) as { name?: string; message?: string } | string;
    if (typeof dumped === 'string') return dumped;
    if (dumped && typeof dumped === 'object') {
      const name = dumped.name ?? 'Error';
      return dumped.message ? `${name}: ${dumped.message}` : name;
    }
    return String(dumped);
  } catch {
    return 'unreadable error';
  }
}

function readRegistered(context: QuickJSContext): readonly string[] {
  const fn = context.getProp(context.global, '__dm_registered');
  try {
    const result = context.callFunction(fn, context.undefined);
    if (result.error) {
      result.error.dispose();
      return [];
    }
    const text = context.getString(result.value);
    result.value.dispose();
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  } finally {
    fn.dispose();
  }
}
