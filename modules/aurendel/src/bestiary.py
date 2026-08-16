"""Aurendel — what the wards were built against, and what wandered in after.

The one rule that governs every entry: **a monster's abilities must carry their
own damage.** `weaponDamage` only fires when an ability produced none itself,
and it reads the attacker's `equipped` — which for a spawned monster is empty.
An ability with no `onUse` therefore hits for nothing at all. Every attack
below declares its damage inline, which is why this file adds abilities rather
than reusing the party's `strike`.

Levels run 1 to 9, roughly one per act-and-a-half, and `xp` is set even though
the engine grants none for a kill: progression is quest-driven, and the numbers
are there for the day it is not.
"""

# --- the abilities they attack with ---------------------------------------

def bite(aid, name, dice, damage_type, description, *, stat="might", range_=0,
         condition=None, cooldown=0, targeting="single", action="action"):
    effects = [{"damage": {"target": {"ref": "target.id"},
                           "amount": {"roll": dice}, "damageType": damage_type}}]
    if condition:
        effects.append({"applyCondition": {"target": {"ref": "target.id"},
                                           "condition": condition[0],
                                           "duration": condition[1]}})
    out = {
        "id": aid, "name": name, "description": description,
        "actionType": action, "targeting": targeting,
        "attack": {"stat": stat, "against": "guard"},
        "onUse": effects,
    }
    if range_:
        out["range"] = range_
    if cooldown:
        out["cooldown"] = cooldown
    return out


ABILITIES = [
    bite("rend", "Rend", "1d6", "slashing", "Teeth, and a great deal of "
         "enthusiasm.", condition=("bleeding", 2)),
    bite("gore", "Gore", "1d8", "piercing", "Head down, and it does not stop "
         "when it connects."),
    bite("grave_chill", "Grave Chill", "1d6", "necrotic",
         "The cold of a sealed place, reaching.", stat="presence", range_=30),
    bite("wither", "Wither", "2d6", "necrotic",
         "What the barrows do to a living hand.", stat="presence", range_=15,
         cooldown=3),
    bite("stone_fist", "Stone Fist", "2d6", "bludgeoning",
         "Slow, and it does not need to be fast.", cooldown=2),
    bite("spore_burst", "Spore Burst", "2d4", "poison",
         "A cloud, and then a great deal of coughing.", stat="endurance",
         range_=15, targeting="allEnemies", condition=("poisoned", 3), cooldown=4),
    bite("cinder_lash", "Cinder Lash", "2d6", "fire",
         "Something between a limb and a flow.", range_=10,
         condition=("burning", 2)),
    bite("glass_shard", "Glass Shard", "2d6", "slashing",
         "Thrown, and it does not lose its edge on the way.", stat="agility",
         range_=45, condition=("bleeding", 2)),
    bite("rime_touch", "Rime Touch", "2d6", "cold",
         "Everything it holds stops moving quite so freely.",
         condition=("slowed", 2)),
    {
        "id": "unmaking_word", "name": "The Unmaking Word",
        "description": "Not shouted. Said, once, in a language the wards were "
                       "written to refuse.",
        "actionType": "action", "targeting": "allEnemies", "range": 30,
        "savingThrow": {"save": "will", "difficulty": 16, "onSuccess": "half"},
        "onUse": [
            {"damage": {"target": {"ref": "target.id"}, "amount": {"roll": "4d6"},
                        "damageType": "necrotic"}},
            {"applyCondition": {"target": {"ref": "target.id"},
                                "condition": "frightened", "duration": 3}},
        ],
        "cooldown": 4,
    },
    {
        "id": "call_the_shut", "name": "Call the Shut",
        "description": "It does not fight alone if it can help it.",
        "actionType": "quick", "targeting": "allAllies",
        "onUse": [{"applyCondition": {"target": {"ref": "target.id"},
                                      "condition": "emboldened", "duration": 3}}],
        "cooldown": 5,
    },
]


# --- the creatures --------------------------------------------------------

def creature(mid, name, level, xp, attrs, abilities, description, *,
             behaviour=None, loot=None, conditional=(), faction="the_unsealed",
             creature_type="undead", size="medium", descriptors=(),
             interactions=(), immunities=(), special=(), reactions=(),
             hp=None, guard=None):
    out = {
        "id": mid, "name": name, "description": description,
        "level": level, "xp": xp,
        "attributes": attrs,
        "abilities": list(abilities),
        "behaviour": behaviour or [{"priority": 0, "use": abilities[0]}],
        "faction": faction, "creatureType": creature_type, "size": size,
        "descriptors": list(descriptors),
        "conditionalLoot": list(conditional),
    }
    if loot:
        out["loot"] = loot
    if interactions:
        out["damageInteractions"] = list(interactions)
    if immunities:
        out["conditionImmunities"] = list(immunities)
    if special:
        out["specialTurns"] = list(special)
    if reactions:
        out["reactions"] = list(reactions)
    if hp is not None:
        out["resourceOverrides"] = {"hp": hp}
    if guard is not None:
        out["derivedOverrides"] = {"guard": guard}
    return out


A = lambda might, agility, endurance, intellect, instinct, presence: {
    "might": might, "agility": agility, "endurance": endurance,
    "intellect": intellect, "instinct": instinct, "presence": presence,
}

# Silver is the questline's answer to the things the wards were built against,
# and `unless` is how a weapon's tags get an exception to a resistance.
HALF_UNLESS_SILVER = [
    {"damageType": "slashing", "multiplier": 0.5, "unless": ["silvered"]},
    {"damageType": "piercing", "multiplier": 0.5, "unless": ["silvered"]},
]

MONSTERS = [
    # -- act I: what came out of the Dene Barrow ---------------------------
    creature("barrow_rat", "Barrow Rat", 1, 15, A(8, 14, 10, 3, 12, 6),
             ["rend"], "Too large, too bold, and it came from under the mound.",
             creature_type="beast", size="small", faction="the_unsealed",
             descriptors=["a scrabbling", "a bloated"], loot="vermin_scraps", hp=6),
    # Deliberately *not* silver-resistant, unlike everything else out of a
    # barrow. This is the first fight in the game, in `the_open_door`, and
    # a starting party's only damage is a plain iron blade: halving it here
    # turned the tutorial into a loss. Silver starts mattering at the
    # Door-Warden, by which point Hesk will sell you a silvered blade.
    creature("grave_hound", "Grave Hound", 2, 40, A(12, 12, 12, 3, 14, 8),
             ["rend", "gore"],
             "It was a dog. The barrow has had it for some while.",
             creature_type="undead", descriptors=["a lean", "a silent"],
             behaviour=[{"priority": 10, "use": "gore", "when": {"chance": 0.35}},
                        {"priority": 0, "use": "rend"}],
             loot="barrow_scraps",
             immunities=["frightened", "poisoned"], hp=9),
    creature("door_warden", "The Door-Warden", 4, 200, A(16, 11, 16, 8, 12, 14),
             ["gore", "grave_chill", "call_the_shut"],
             "It was set to keep the barrow shut and it is still, in its way, "
             "doing that.",
             descriptors=["a wrapped", "a patient"],
             behaviour=[{"priority": 20, "use": "call_the_shut",
                         "when": {"chance": 0.3}},
                        {"priority": 10, "use": "grave_chill",
                         "when": {"gt": [{"ref": "actor.res.hp"}, 0]}},
                        {"priority": 0, "use": "gore"}],
             loot="door_warden_hoard", conditional=["silvered_cache"],
             interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned", "bleeding"],
             hp=46, guard=14,
             reactions=[{"id": "warden_wakes", "on": "seePlayer", "priority": 5,
                         "effects": [{"setFlag": {"flag": "warden_saw_you",
                                                  "value": True}}]}]),

    # -- act II: the ward sites -------------------------------------------
    creature("thorn_thing", "Thorn-Thing", 3, 90, A(13, 15, 12, 5, 15, 8),
             ["rend", "glass_shard"],
             "The Thornward grew it, or grew around it. Elderhollow will not "
             "be drawn.",
             creature_type="plant", faction="the_unsealed",
             descriptors=["a bristling", "a creaking"],
             loot="wood_scraps", hp=22),
    creature("hollow_walker", "Hollow Walker", 4, 160, A(15, 10, 15, 6, 11, 12),
             ["stone_fist", "grave_chill"],
             "Under the Ring, and it has been walking the same circuit for a "
             "very long time.",
             descriptors=["a slow", "a grey"],
             loot="barrow_scraps", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "slowed"], hp=34),
    creature("sister_shade", "A Sister's Shade", 5, 240, A(10, 16, 12, 14, 14, 16),
             ["wither", "grave_chill"],
             "One of the nine. It is not pleased about the tenth.",
             descriptors=["a tall", "an unlit"],
             behaviour=[{"priority": 10, "use": "wither"},
                        {"priority": 0, "use": "grave_chill"}],
             loot="sisters_hoard", conditional=["silvered_cache"],
             interactions=HALF_UNLESS_SILVER + [
                 {"damageType": "necrotic", "multiplier": 0},
                 {"damageType": "radiant", "multiplier": 2}],
             immunities=["frightened", "poisoned", "bleeding", "prone"],
             hp=52, guard=15),
    creature("slag_crawler", "Slag Crawler", 4, 170, A(16, 9, 16, 4, 10, 8),
             ["cinder_lash", "stone_fist"],
             "Cooled enough to move and not enough to touch.",
             creature_type="elemental", size="large",
             descriptors=["a glowing", "a cracked"],
             loot="ember_scraps",
             interactions=[{"damageType": "fire", "multiplier": 0},
                           {"damageType": "cold", "multiplier": 2}],
             immunities=["burning", "poisoned"], hp=38),
    creature("kurgan_rider", "A Kurgan Rider", 5, 250, A(16, 14, 14, 8, 13, 13),
             ["gore", "rend", "call_the_shut"],
             "Buried with the horse, and neither of them has settled.",
             size="large", descriptors=["a mounted", "a wind-dried"],
             behaviour=[{"priority": 15, "use": "call_the_shut",
                         "when": {"chance": 0.25}},
                        {"priority": 0, "use": "gore"}],
             loot="kurgan_hoard", conditional=["silvered_cache"],
             interactions=HALF_UNLESS_SILVER, immunities=["frightened"],
             hp=48, guard=15),
    creature("glass_thing", "A Glass Thing", 6, 320, A(12, 17, 13, 12, 15, 10),
             ["glass_shard", "rend"],
             "The crater made it, or something in the crater did.",
             creature_type="aberration", descriptors=["a translucent", "a ringing"],
             loot="glass_hoard", conditional=["silvered_cache"],
             interactions=[{"damageType": "slashing", "multiplier": 0.5},
                           {"damageType": "bludgeoning", "multiplier": 2}],
             hp=44, guard=16),

    # -- act III: the Deeproads -------------------------------------------
    creature("fungal_horror", "Fungal Horror", 6, 300, A(15, 8, 18, 4, 12, 8),
             ["spore_burst", "stone_fist"],
             "The Rot, walking, and it is mostly what it has eaten.",
             creature_type="plant", size="large",
             descriptors=["a swollen", "a luminous"],
             behaviour=[{"priority": 10, "use": "spore_burst"},
                        {"priority": 0, "use": "stone_fist"}],
             loot="deep_scraps", immunities=["poisoned", "bleeding"], hp=56),
    creature("rime_shade", "Rime Shade", 6, 310, A(11, 15, 13, 13, 14, 15),
             ["rime_touch", "grave_chill"],
             "It came up the Broken Stair from somewhere colder than the "
             "Frostmere.",
             descriptors=["a pale", "a drifting"],
             loot="deep_scraps", interactions=HALF_UNLESS_SILVER + [
                 {"damageType": "cold", "multiplier": 0}],
             immunities=["frightened", "slowed"], hp=46, guard=16),
    creature("door_keeper", "The Keeper of the Ninth", 8, 900,
             A(18, 13, 18, 16, 15, 18),
             ["unmaking_word", "wither", "stone_fist", "call_the_shut"],
             "It has been on the other side of the ninth door for as long as "
             "there has been a ninth door.",
             size="large", descriptors=["a vast", "an unhurried"],
             behaviour=[{"priority": 30, "use": "unmaking_word",
                         "when": {"chance": 0.4}},
                        {"priority": 20, "use": "call_the_shut",
                         "when": {"chance": 0.3}},
                        {"priority": 10, "use": "wither"},
                        {"priority": 0, "use": "stone_fist"}],
             loot="ninth_door_hoard", conditional=["warden_blade_cache"],
             interactions=HALF_UNLESS_SILVER + [
                 {"damageType": "necrotic", "multiplier": 0},
                 {"damageType": "radiant", "multiplier": 1.5}],
             immunities=["frightened", "poisoned", "bleeding", "prone", "stunned"],
             special=[{"id": "the_door_answers", "name": "The Door Answers",
                       "use": "grave_chill", "uses": 1}],
             hp=120, guard=18,
             reactions=[
                 {"id": "names_you", "on": "seePlayer", "priority": 10,
                  "effects": [{"setFlag": {"flag": "the_keeper_knows_you",
                                           "value": True}}]},
                 {"id": "the_door_shudders", "on": "selfHurt", "priority": 5,
                  "oncePerEncounter": True,
                  "effects": [{"applyCondition": {"target": {"ref": "actor.id"},
                                                  "condition": "emboldened",
                                                  "duration": 4}}]},
             ]),
]

# Every monster ability must exist in `content.abilities`; these are additive to
# the five the party already has from core_fantasy.
MONSTER_ABILITY_IDS = [a["id"] for a in ABILITIES]
