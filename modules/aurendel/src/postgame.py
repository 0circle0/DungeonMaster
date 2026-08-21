"""Aurendel after the Unsealing — the trials, and the five rules they keep.

Eight doors were opened before the ninth, and whatever came through them has been in Aurendel ever
since. It has been quiet because the ninth door was the interesting one.

A trial is post-game content. The contract, all asserted by `check_quests.py`:

  1. Behind the ending. Nothing here is offered until `aurendel_finished` is set, which
     `the_unsealing` writes in its `onComplete`. A trial can never appear in an `isEnding` arc, and
     nothing on the spine, in a chain or in a hidden thread may read a trial flag.
  2. A ladder, in order. Tier one opens on the ending, tier two on tier one's warrant, tier three on
     tier two's. The gate is an item the previous tier pays out, so the ladder is a thing you carry.
  3. Kitted, and checked. Every tier's first door wants a fabled relic worn, not owned —
     `requires.items[].equipped` — and says so in words rather than refusing silently.
  4. Tuned above the game. A party that has done the spine finishes at level 10, spine plus chains
     at 14, all thirty-eight threads at 19.
  5. The world changed. Places already walked get encounter groups gated on the same flag.

Two things worth knowing before writing one:

  * `start.postVictory` has to be `continue`, or `settle` sets `outcome: 'victory'` and every
    affordance stops. `build.py` writes it into the `start` block.
  * `quest.tags` is inert, exactly as for a side chain. `["trial", key]` is written for
    `check_quests.py`; everything that gates lives in `requires`.
"""
from dmkit import trials
from dmkit.trials import link, warrant  # noqa: F401  re-exported

# What each tier waits on. Tier one is the ending itself; the other two are the warrant the tier
# below pays out, as items rather than flags — a thing in the pack reads better in a journal, and
# `requires.items` was already there.
TIER_GATES = {
    "trial_one": {"flags": [{"flag": "aurendel_finished", "equals": True}]},
    "trial_two": {"items": [{"item": "first_warrant"}]},
    "trial_three": {"items": [{"item": "second_warrant"}]},
}

# The relics a tier's door will accept as proof you have been down a thread. `anyOf` rather than
# `items`, because insisting on a particular cloak would make the door a lottery over which region a
# party happened to work.
PROOFS = {
    "trial_one": ["greenway_cloak", "hermits_watch_cloak", "signal_hood",
                  "warm_water_hood", "breathing_hood"],
    "trial_two": ["beaters_cloak", "bog_belt", "ninth_column_coat",
                  "rime_singers_torc", "marshlight_belt"],
    "trial_three": ["bell_rope_ring", "shilling_ring", "hearth_ring",
                    "pilots_glass_ring", "cistern_keepers_ring"],
}


# What every post-game encounter group is gated on. A group that fails its `requires` is removed
# from the draw entirely (`world/populate.ts`), so before the ending the table collapses to its
# empty weight.
AFTER_THE_ENDING = {"flags": [{"flag": "aurendel_finished", "equals": True}]}


def proving(gid, name, description, blocked_key, key, *, opens_flag):
    """`dmkit.trials.proving`, with this tier's gate and relics resolved."""
    if key not in TIER_GATES:
        raise ValueError(f"unknown tier {key!r}")
    return trials.proving(gid, name, description, blocked_key,
                          gate=TIER_GATES[key], proofs=PROOFS[key],
                          opens_flag=opens_flag)


def tier(key, links, *, giver, warrant_item, level):
    """`dmkit.trials.tier`, with this tier's gate resolved."""
    if key not in TIER_GATES:
        raise ValueError(f"unknown tier {key!r}")
    return trials.tier(key, links, gate=TIER_GATES[key], giver=giver,
                       warrant_item=warrant_item, level=level)


def loosed(table_id, entries, *, chance=0.4, empty=3):
    """`dmkit.trials.loosed`, gated on the ending."""
    return trials.loosed(table_id, entries, requires=AFTER_THE_ENDING,
                         chance=chance, empty=empty)
