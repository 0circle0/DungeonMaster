"""Aurendel — the side chains, and the five rules every one of them keeps."""
from dmkit import chains
from dmkit.chains import link  # noqa: F401  re-exported: a chain file wants one import

from act3 import TWO_KEYS

ACT_GATES = {
    # The tutorial.
    "act1": {"quests": [{"quest": "the_open_door", "status": "complete"}]},
    # The Undercroft is what puts the three roads on the map, and what makes a level-4 region survivable.
    "act2": {"quests": [{"quest": "the_undercroft", "status": "complete"}]},
    # Deliberately not "you are in the Deeproads".
    "act3": TWO_KEYS,
}


def chain(key, links, *, act, region, giver, level=None):
    """`dmkit.chains.chain`, with Aurendel's act gate resolved for it."""
    if act not in ACT_GATES:
        raise ValueError(f"{key}: unknown act {act!r}")
    return chains.chain(key, links, act=act, gate=ACT_GATES[act],
                        region=region, giver=giver, level=level)
