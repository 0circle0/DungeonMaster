"""Aurendel after the Unsealing — the trials, and the five rules they keep.

The ninth door was the one everybody watched, because it was the one standing
open. Eight were opened before it, in order, over a long time, and whatever came
through those eight has been in Aurendel ever since — in cellars under places
you saved, in galleries nobody works, in a listening room four miles down. It
has been quiet because the ninth door was the interesting one. It is not any
more.

A trial is post-game content. The contract, all asserted by `check_quests.py`:

  1. **Behind the ending.** Nothing here is offered until `aurendel_finished` is
     set, which `the_unsealing` writes in its `onComplete` and which nothing
     read until this file existed. A trial can never appear in an `isEnding`
     arc, and nothing on the spine, in a chain or in a hidden thread may read a
     trial flag — the same containment the other two kinds of optional content
     keep, in the same direction.
  2. **A ladder, in order.** Tier one opens on the ending. Tier two opens on
     tier one's warrant, tier three on tier two's. The gate is an item the
     previous tier pays out, so the ladder is a thing you carry rather than a
     number the engine remembers.
  3. **Kitted, and checked.** Every tier's first door wants a fabled relic
     *worn*, not owned — `requires.items[].equipped`. A hidden thread is where
     fabled gear comes from, so the door that asks for it is asking whether you
     went and looked, and says so in words rather than refusing silently.
  4. **Tuned above the game.** A party that has done the spine finishes at
     level 10; one that has done the spine and the chains at 14; one that has
     pulled all thirty-eight threads at 19. Trials are written for the top of
     that, because the equipment gate means anybody standing at the door has
     been to the bottom of the threads.
  5. **The world changed.** A tier is not only a new dungeon. Places already
     walked get encounter groups gated on the same flag, so the quiet half of
     the continent stops being quiet the moment the ending lands.

Two things worth knowing before writing one:

  * **`start.postVictory` has to be `continue`,** or none of this is reachable:
    `settle` sets `outcome: 'victory'` and every affordance stops. `build.py`
    writes it into the `start` block; without it a trial validates perfectly and
    cannot be played.
  * **`quest.tags` is inert,** exactly as it is for a side chain. `["trial",
    key]` is written for `check_quests.py` and for us. Everything that gates
    lives in `requires`.
"""
from dmkit import trials
from dmkit.trials import link, warrant  # noqa: F401  re-exported

# What each tier waits on. Tier one is the ending itself; the other two are the
# warrant the tier below pays out, which is why they are items rather than
# flags — a thing in the pack reads better in a journal than a boolean, and
# `requires.items` was already there.
TIER_GATES = {
    "trial_one": {"flags": [{"flag": "aurendel_finished", "equals": True}]},
    "trial_two": {"items": [{"item": "first_warrant"}]},
    "trial_three": {"items": [{"item": "second_warrant"}]},
}

# The relics a tier's door will accept as proof you have been down a thread.
# Several rather than one, and `anyOf` rather than `items`, because insisting on
# a particular cloak would make the door a lottery over which region a party
# happened to work — every one of these is the payout of a hidden thread.
PROOFS = {
    "trial_one": ["greenway_cloak", "hermits_watch_cloak", "signal_hood",
                  "warm_water_hood", "breathing_hood"],
    "trial_two": ["beaters_cloak", "bog_belt", "ninth_column_coat",
                  "rime_singers_torc", "marshlight_belt"],
    "trial_three": ["bell_rope_ring", "shilling_ring", "hearth_ring",
                    "pilots_glass_ring", "cistern_keepers_ring"],
}


# What every post-game encounter group is gated on. A group that fails its
# `requires` is removed from the draw entirely (`world/populate.ts`), so before
# the ending the whole table collapses to its empty weight and the place is
# exactly as quiet as it has always been.
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
