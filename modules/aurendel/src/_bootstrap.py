"""Put this directory and `modules/shared` on `sys.path`.

Imported for its side effect, first, by every entry point in this directory —
`build.py`, `staticmaps.py`, `check_quests.py`. Content files never import it:
by the time one of them is loaded, an entry point has already run.

`HERE` goes in front of `SHARED` so a bare sibling name resolves exactly as it
did before there was a shared layer — `sys.path[0]` was this directory, because
that is where the script was. `regions.py` and `story.py` reach their region and
act files by `importlib.import_module` on a bare name, `regions.start()` reaches
`items` the same way, and `check_quests.py` reaches the trial modules the same
way; all four depend on that ordering holding.

`dmkit` is a package, so nothing in this directory can shadow anything in it —
which is the whole reason it is a package. `modules/aurendel/src/items.py` and
`dmkit/items.py` are different modules and both are importable at once.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SHARED = os.path.join(ROOT, "modules", "shared")

# Removed before inserting so the order is true even when the interpreter has
# already put HERE at index 0, which it does for a directly-invoked script.
for path in (SHARED, HERE):
    if path in sys.path:
        sys.path.remove(path)
    sys.path.insert(0, path)
