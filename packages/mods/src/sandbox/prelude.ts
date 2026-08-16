/**
 * The `dm` global, and the removal of everything non-deterministic.
 *
 * This runs once per mod context before the mod's own code. It is a source
 * string rather than a module because it has to be evaluated *inside* QuickJS,
 * where our imports do not reach.
 *
 * Determinism is achieved by **deletion, not policing**: `Date` and
 * `Math.random` are removed, so a mod cannot reach them by accident or on
 * purpose. `dm.random()` is the only entropy available and it draws from an Rng
 * derived off game state, so a replay reproduces it exactly.
 */

/**
 * Host-bound functions the prelude expects to already exist as globals:
 * `__dm_random`, `__dm_query`, `__dm_log`. They are installed by the host
 * before this source is evaluated.
 */
export const PRELUDE_SOURCE = `
(() => {
  'use strict';

  const handlers = Object.create(null);

  const dm = {
    /**
     * Register a handler. The name must match one the manifest declared —
     * the host checks, because a handler nobody asked for would otherwise
     * fail silently and look like a broken mod.
     */
    hook(name, handler) {
      if (typeof name !== 'string' || !name) throw new TypeError('dm.hook needs a hook name');
      if (typeof handler !== 'function') throw new TypeError('dm.hook needs a function');
      (handlers[name] || (handlers[name] = [])).push(handler);
    },

    /** Deterministic entropy. Draws from an Rng derived off game state. */
    random() {
      return __dm_random();
    },

    state: {
      /** Pull one value by dotted path. Returns null for anything absent. */
      get(path) {
        const raw = __dm_query(String(path));
        return raw === undefined || raw === null ? null : JSON.parse(raw);
      },
    },

    /** Diagnostics. Never console — there is no console in here. */
    log(message) {
      __dm_log(String(message));
    },
  };

  Object.freeze(dm.state);
  Object.freeze(dm);
  globalThis.dm = dm;

  /**
   * The dispatcher the host calls. Takes and returns JSON text, because a
   * string is the one thing that crosses the boundary cheaply.
   */
  globalThis.__dm_dispatch = (hookName, payloadJson) => {
    const list = handlers[hookName];
    if (!list || list.length === 0) return 'null';
    const context = JSON.parse(payloadJson);
    const out = [];
    for (const handler of list) {
      const result = handler(context);
      if (result === undefined || result === null) continue;
      if (Array.isArray(result)) out.push(...result);
      else out.push(result);
    }
    return JSON.stringify(out);
  };

  /** Lets the host verify that what was declared was actually registered. */
  globalThis.__dm_registered = () => JSON.stringify(Object.keys(handlers));

  // Non-determinism, removed rather than policed. A mod cannot reach a clock
  // or an unseeded generator because neither exists in this realm.
  delete globalThis.Date;
  delete globalThis.performance;
  Math.random = undefined;
  delete Math.random;

  // Freezing the intrinsics stops one mod's monkey-patching from becoming
  // another mod's mystery. Each mod already has its own context, so this is
  // defence in depth rather than the isolation itself.
  Object.freeze(Object.prototype);
  Object.freeze(Array.prototype);
  Object.freeze(Function.prototype);
  Object.freeze(String.prototype);
  Object.freeze(Number.prototype);
})();
`;
