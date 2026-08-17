"""Aurendel — the side chains, and the five rules every one of them keeps.

A side chain is a small questline: three or four quests, one region, its own
people, its own dungeon, its own ending. What makes it a *side* chain rather
than a branch of the spine is a contract, and the contract is mechanical:

  1. **Skippable.** Nothing here appears in an ending arc, and nothing on the
     spine waits on a flag written here. A party that walks past every one of
     these still finishes the game.
  2. **Act-contained.** One region, one level band. An Act I chain does not send
     you to the Frostmere and does not require an Act II quest.
  3. **Never expiring.** Gated on the act being open and on nothing else. There
     is no window to miss, because permanently locking a player out of content
     they did not know existed is a cruelty the geography does not need.
  4. **Startable.** A `giver` who lists it in `offersQuests` — the linter's
     `unobtainable_quest` warning is the floor, not the goal.
  5. **Paying.** Gear the spine does not offer, a faction that moves, and the
     deed emitted from the node where the work is reported.

`check_quests.py` asserts all five against the built module, because four of
them are the kind of thing that reads fine in the source and fails silently in
play.

The wiring is `dmkit.chains`; what is here is the part that is a fact about
Aurendel — which quest opens which act. That division is the whole reason this
file exists. `ACT_GATES["act3"]` is the same predicate `the_way_below` uses,
imported from `act3` rather than copied, because "two of the three routes are
done" is one fact about a run and should have one definition — and a shared kit
may not import story content, so the import lives on this side of the line.
"""
from dmkit import chains
from dmkit.chains import link  # noqa: F401  re-exported: a chain file wants one import

from act3 import TWO_KEYS

ACT_GATES = {
    # The tutorial. Everything in the Kingsvale, the capital and the coast is
    # open once the barrow is dealt with.
    "act1": {"quests": [{"quest": "the_open_door", "status": "complete"}]},
    # The Undercroft is what puts the three roads on the map; it is also what
    # makes a level-4 region survivable.
    "act2": {"quests": [{"quest": "the_undercroft", "status": "complete"}]},
    # Deliberately *not* "you are in the Deeproads". Two ward-keys says Act II
    # is behind you without insisting you have gone underground first, so the
    # Frostmere and the Isles are reachable in the order a player chooses.
    "act3": TWO_KEYS,
}


def chain(key, links, *, act, region, giver, level=None):
    """`dmkit.chains.chain`, with Aurendel's act gate resolved for it."""
    if act not in ACT_GATES:
        raise ValueError(f"{key}: unknown act {act!r}")
    return chains.chain(key, links, act=act, gate=ACT_GATES[act],
                        region=region, giver=giver, level=level)
