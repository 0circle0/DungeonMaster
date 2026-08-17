"""Constructors and machinery shared by every world module in this repo.

Import submodules, not names from here:

    from dmkit.quests import quest, stage, arc
    from dmkit.places import area, poi, inn

There is deliberately nothing re-exported at this level. A flat
`from dmkit import quest, pool, gear, weapon, …` would rebuild, one level in,
exactly the colliding namespace the package exists to avoid — a world module
has its own `items.py`, `loot.py`, `prose.py` and `materials.py`, and which
layer a name came from has to stay visible at the import site. It would also
make `import dmkit.quests` execute every submodule, which drags in the fifty-odd
text pools `dmkit.dungeons` registers at import time.

See modules/shared/README.md for what a module has to provide in return.
"""
