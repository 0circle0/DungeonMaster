"""The text-pool registry."""

_POOLS = {}


def pool(pid, *texts, **kw):
    """Register a text pool."""
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
