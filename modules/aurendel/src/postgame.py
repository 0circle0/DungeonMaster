"""Aurendel after the Unsealing — the trials, and the five rules they keep."""
from dmkit import trials
from dmkit.trials import link, warrant  # noqa: F401  re-exported

# What each tier waits on.
TIER_GATES = {
    "trial_one": {"flags": [{"flag": "aurendel_finished", "equals": True}]},
    "trial_two": {"items": [{"item": "first_warrant"}]},
    "trial_three": {"items": [{"item": "second_warrant"}]},
}

# The relics a tier's door will accept as proof you have been down a thread.
PROOFS = {
    "trial_one": ["greenway_cloak", "hermits_watch_cloak", "signal_hood",
                  "warm_water_hood", "breathing_hood"],
    "trial_two": ["beaters_cloak", "bog_belt", "ninth_column_coat",
                  "rime_singers_torc", "marshlight_belt"],
    "trial_three": ["bell_rope_ring", "shilling_ring", "hearth_ring",
                    "pilots_glass_ring", "cistern_keepers_ring"],
}


# What every post-game encounter group is gated on.
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
