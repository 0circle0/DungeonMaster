"""The text-pool registry.

Every place the party can stand narrates from a `narrative.textGrammar` pool
named by its `descriptionKey`; the plain `description` field is only ever shown
by `look <name>` (narrate.ts:709). Pools need three or more variants or the
linter calls them thin.

`pool()` is the only constructor and this module registers nothing itself —
prose belongs to the world that speaks it. A module imports `pool`, calls it at
module level, and the build collects the lot with `registered()`.
"""

_POOLS = {}


def pool(pid, *texts, **kw):
    """Register a text pool. Later calls with the same id replace earlier ones.

    Last-write-wins is deliberate: it is how a module overrides a pool some
    shared file registered with prose of its own. `registered()` sorts, so
    import *order* cannot otherwise reach the built document.
    """
    variants = []
    for t in texts:
        variants.append({"text": t} if isinstance(t, str) else t)
    entry = {"id": pid, "variants": variants}
    entry.update(kw)
    _POOLS[pid] = entry
    return pid


def registered():
    return [_POOLS[k] for k in sorted(_POOLS)]


def has(pid):
    return pid in _POOLS
