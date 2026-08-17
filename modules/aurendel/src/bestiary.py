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
    # --- what the side chains brought with them ---------------------------
    bite("latch", "Latch On", "1d6", "piercing",
         "It does not bite so much as attach, and then not let go.",
         condition=("bleeding", 3)),
    bite("drag_under", "Drag Under", "1d8", "bludgeoning",
         "A hand at the ankle, and the water is closer than it was.",
         stat="might", condition=("prone", 1), cooldown=2),
    bite("cudgel", "Cudgel", "1d6", "bludgeoning",
         "A length of ash with a nail through it, swung by somebody who has "
         "done this before."),
    bite("cut_and_run", "Cut and Run", "1d6", "slashing",
         "A short blade, low, and then twenty yards of shingle.",
         stat="agility", condition=("bleeding", 2)),
    bite("digging_claw", "Digging Claw", "1d10", "slashing",
         "Made for spoil, and it does not know the difference.",
         cooldown=2),
    bite("bleed_white", "Bleed White", "2d4", "necrotic",
         "Nothing you can feel happening, which is the trouble with it.",
         stat="endurance", condition=("bleeding", 4)),
    # Bludgeoning rather than a sound: the ruleset has no thunder damage type,
    # and inventing one in a side chain would put a damage type in the world
    # that no resistance, immunity or piece of gear anywhere knows about.
    bite("toll", "Toll", "2d6", "bludgeoning",
         "One note, under the water, and it is in your chest before it is in "
         "your ears.", stat="presence", range_=30, targeting="allEnemies",
         condition=("stunned", 1), cooldown=5),
    bite("root_and_branch", "Root and Branch", "2d6", "bludgeoning",
         "The beech has been growing round the hollow for four hundred years "
         "and has opinions about being disturbed.", cooldown=2),
    bite("scouring_wind", "Scouring Wind", "2d6", "slashing",
         "Grit off two hundred miles of open grass, at the speed the grass "
         "grew used to.", stat="agility", range_=20, targeting="allEnemies",
         condition=("blinded", 2), cooldown=4),
    bite("calving", "Calving", "2d8", "cold",
         "A face of ice the height of a hall deciding, all at once, to be "
         "somewhere else.", stat="might", targeting="allEnemies", range_=20,
         condition=("prone", 1), cooldown=4),
    bite("salt_burn", "Salt Burn", "2d6", "acid",
         "Nine hundred years of pan salt, and it takes the water out of "
         "whatever it is on.", stat="endurance", range_=10,
         condition=("bleeding", 3)),
    bite("vent_breath", "Vent Breath", "2d8", "fire",
         "What the throat has been doing quietly for nine hundred years, done "
         "all at once and at you.", stat="endurance", range_=15,
         targeting="allEnemies", condition=("burning", 3), cooldown=4),
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

    # -- the Kingsvale side chains: the Weirwater and the setts -------------
    # Level 2 and no silver resistance, like the grave hound and for the same
    # reason: these are fought at level 1 or 2 with whatever came out of
    # character creation, and halving a starting party's only damage source is
    # how a side chain becomes a wall instead of a detour.
    creature("weir_lamprey", "Weir Lamprey", 2, 35, A(11, 13, 13, 2, 11, 4),
             ["latch"],
             "Two feet of it, and a mouth that is all of it.",
             creature_type="beast", size="small", faction="the_unsealed",
             descriptors=["a thrashing", "a grey"],
             loot="weir_scraps", immunities=["prone"], hp=8),
    creature("sett_delver", "The Delver", 3, 120, A(15, 10, 15, 4, 12, 6),
             ["digging_claw", "rend"],
             "Whatever cut the far end of the setts has been at it a long "
             "while, and has stopped needing to come up.",
             creature_type="aberration", descriptors=["a pale", "a blind"],
             behaviour=[{"priority": 10, "use": "digging_claw",
                         "when": {"chance": 0.4}},
                        {"priority": 0, "use": "rend"}],
             loot="setts_hoard", immunities=["blinded", "frightened"],
             hp=28, guard=13),

    # -- under Aurenhal ----------------------------------------------------
    # `faction: the_library` is the whole plot of the Bone Alley chain in one
    # field. The Library buys grave ash and will not say why; somebody is being
    # paid to go and get it, and they are not guild.
    creature("cellar_thief", "An Unliveried Digger", 2, 45,
             A(11, 14, 11, 9, 12, 10), ["cut_and_run"],
             "Working the under without a charter, for wages somebody in a "
             "much cleaner coat is paying.",
             creature_type="humanoid", faction="the_library",
             descriptors=["a wiry", "a soot-black"],
             loot="vermin_scraps", hp=12),
    creature("the_gaoler", "The Gaoler", 4, 190, A(15, 11, 15, 7, 12, 15),
             ["stone_fist", "grave_chill", "call_the_shut"],
             "The old gaol was bricked up with its register still on the desk "
             "and somebody still on the book.",
             descriptors=["a keyed", "a patient"],
             behaviour=[{"priority": 20, "use": "call_the_shut",
                         "when": {"chance": 0.25}},
                        {"priority": 10, "use": "grave_chill"},
                        {"priority": 0, "use": "stone_fist"}],
             loot="gaol_hoard", conditional=["silvered_cache"],
             interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned"], hp=40, guard=14),

    # -- the Silver Coast and Sarnport --------------------------------------
    # Living people, and the only faction in the bestiary that is not a thing
    # out of a hole. `deadMenTellNoTales` means how you deal with them is a
    # decision with consequences rather than a formality.
    creature("strand_wrecker", "A Wrecker", 2, 50, A(13, 12, 12, 9, 12, 9),
             ["cudgel"],
             "Lime under the fingernails and a lantern they only light in "
             "certain weather.",
             creature_type="humanoid", faction="the_salvors",
             descriptors=["a squat", "a weathered"],
             loot="strand_scraps", hp=14),
    creature("drowned_hand", "A Drowned Hand", 3, 110, A(14, 9, 14, 4, 11, 8),
             ["drag_under", "rend"],
             "Came off the reef with the rest of the cargo and did not stop "
             "at the tide line.",
             descriptors=["a bloated", "a weed-hung"],
             loot="strand_scraps", interactions=HALF_UNLESS_SILVER,
             immunities=["poisoned", "prone"], hp=26),
    creature("wreck_shade", "The Light on the Point", 4, 200,
             A(12, 15, 13, 12, 14, 16),
             ["grave_chill", "wither", "drag_under"],
             "Something has been showing a light off Gannet Head for ninety "
             "years, and the lighthouse is not it.",
             descriptors=["a cold", "a shining"],
             behaviour=[{"priority": 10, "use": "wither"},
                        {"priority": 0, "use": "grave_chill"}],
             loot="saltcliff_hoard", conditional=["silvered_cache"],
             interactions=HALF_UNLESS_SILVER + [
                 {"damageType": "cold", "multiplier": 0.5},
                 {"damageType": "radiant", "multiplier": 2}],
             immunities=["frightened", "poisoned", "prone"], hp=38, guard=15),

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

    # -- the Act II side chains --------------------------------------------
    # Levels 4 to 6, to sit beside the ward routes rather than above them: a
    # party that detours here is level 4 or 5 and carrying whatever Act I left
    # them, and the boss of a side chain should be the hardest fight of that
    # week without being harder than the ward at the end of the road.
    creature("beech_hollow", "The Hollow Beech", 5, 230, A(17, 7, 17, 6, 13, 9),
             ["root_and_branch", "rend"],
             "Four hundred years growing round a hole somebody dug, and it "
             "has taken the shape of what it grew around.",
             creature_type="plant", size="large",
             descriptors=["a vast", "a split"],
             behaviour=[{"priority": 10, "use": "root_and_branch",
                         "when": {"chance": 0.4}},
                        {"priority": 0, "use": "rend"}],
             loot="beeches_hoard", conditional=["silvered_cache"],
             interactions=[{"damageType": "fire", "multiplier": 2},
                           {"damageType": "piercing", "multiplier": 0.5}],
             immunities=["frightened", "prone", "poisoned"], hp=54, guard=13),

    creature("long_barrow_wight", "The East End", 5, 245,
             A(13, 12, 14, 11, 13, 16),
             ["bleed_white", "grave_chill", "call_the_shut"],
             "The Long Barrow has two ends and only one of them was ever "
             "dug. This is the other one's opinion about that.",
             descriptors=["a dry", "a crowned"],
             behaviour=[{"priority": 15, "use": "call_the_shut",
                         "when": {"chance": 0.3}},
                        {"priority": 10, "use": "bleed_white"},
                        {"priority": 0, "use": "grave_chill"}],
             loot="diggers_hoard", conditional=["silvered_cache"],
             interactions=HALF_UNLESS_SILVER + [
                 {"damageType": "necrotic", "multiplier": 0},
                 {"damageType": "radiant", "multiplier": 2}],
             immunities=["frightened", "poisoned", "bleeding"],
             hp=50, guard=15),

    creature("dust_shade", "The Dry River", 5, 235, A(12, 16, 13, 10, 14, 14),
             ["scouring_wind", "glass_shard"],
             "The river went somewhere else in somebody's great-grandfather's "
             "time and something stayed in the bed waiting for it.",
             descriptors=["a turning", "a gritted"],
             behaviour=[{"priority": 10, "use": "scouring_wind",
                         "when": {"chance": 0.35}},
                        {"priority": 0, "use": "glass_shard"}],
             loot="dry_river_hoard",
             interactions=[{"damageType": "slashing", "multiplier": 0.5},
                           {"damageType": "bludgeoning", "multiplier": 0.5},
                           {"damageType": "cold", "multiplier": 1.5}],
             immunities=["bleeding", "prone", "blinded"], hp=44, guard=16),

    creature("sink_thing", "What Is In the Sink", 5, 250,
             A(16, 11, 16, 5, 12, 8),
             ["drag_under", "stone_fist"],
             "The Weirwater goes into the ground at the swallet and comes out "
             "eleven miles away. Something in between has never needed to "
             "leave.",
             creature_type="aberration", size="large",
             descriptors=["a pallid", "a folded"],
             behaviour=[{"priority": 10, "use": "drag_under",
                         "when": {"chance": 0.4}},
                        {"priority": 0, "use": "stone_fist"}],
             loot="sink_hoard", conditional=["silvered_cache"],
             interactions=[{"damageType": "cold", "multiplier": 0.5},
                           {"damageType": "lightning", "multiplier": 2}],
             immunities=["prone", "blinded", "frightened"], hp=58, guard=14),

    creature("vent_wyrm", "The Thing In the Throat", 6, 330,
             A(17, 12, 18, 7, 13, 10),
             ["vent_breath", "cinder_lash", "stone_fist"],
             "Nine hundred years of the vent going quietly, and the reason it "
             "went quietly.",
             creature_type="elemental", size="large",
             descriptors=["a red", "a slow-moving"],
             behaviour=[{"priority": 20, "use": "vent_breath",
                         "when": {"chance": 0.35}},
                        {"priority": 10, "use": "cinder_lash"},
                        {"priority": 0, "use": "stone_fist"}],
             loot="throat_hoard",
             interactions=[{"damageType": "fire", "multiplier": 0},
                           {"damageType": "cold", "multiplier": 2}],
             immunities=["burning", "poisoned", "frightened"], hp=62, guard=15),

    # -- Thornmere, and the first monsters the drowned biome has ever had ---
    creature("leech_swarm", "Leech Swarm", 3, 95, A(6, 15, 12, 1, 10, 4),
             ["bleed_white"],
             "The warm channels breed them and the marsh has never once "
             "objected.",
             creature_type="beast", size="small", faction="the_unsealed",
             descriptors=["a boiling", "a spreading"],
             loot="marsh_scraps",
             interactions=[{"damageType": "slashing", "multiplier": 0.5},
                           {"damageType": "piercing", "multiplier": 0.5},
                           {"damageType": "fire", "multiplier": 2}],
             immunities=["frightened", "bleeding", "prone"], hp=18),
    creature("bog_walker", "A Bog Walker", 4, 165, A(15, 9, 16, 4, 11, 9),
             ["drag_under", "rend"],
             "The marsh keeps what it takes and occasionally gives some of it "
             "back on its feet.",
             descriptors=["a peat-black", "a dripping"],
             loot="marsh_scraps", interactions=HALF_UNLESS_SILVER,
             immunities=["poisoned", "prone", "slowed"], hp=36),
    creature("bell_shade", "What Rings the Bell", 5, 255,
             A(11, 14, 13, 13, 14, 17),
             ["toll", "grave_chill", "bleed_white"],
             "The old church went under in one night and the bell has been "
             "heard since, which is a thing the new tower will not discuss.",
             descriptors=["a tolling", "a drowned"],
             behaviour=[{"priority": 20, "use": "toll", "when": {"chance": 0.35}},
                        {"priority": 10, "use": "bleed_white"},
                        {"priority": 0, "use": "grave_chill"}],
             loot="bell_hoard", conditional=["silvered_cache"],
             interactions=HALF_UNLESS_SILVER + [
                 {"damageType": "necrotic", "multiplier": 0},
                 {"damageType": "radiant", "multiplier": 2}],
             immunities=["frightened", "poisoned", "prone", "silenced"],
             hp=48, guard=15),

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
    # -- the Act III side chains -------------------------------------------
    # Levels 7 and 8, beside the Deeproads rather than beyond it. A party here
    # has two ward-keys and whatever Act II left them; these are meant to be
    # the hardest fights available that are not the Keeper of the Ninth.
    creature("seam_thing", "What Is In the Old Seams", 7, 400,
             A(18, 10, 18, 6, 12, 9),
             ["stone_fist", "digging_claw", "call_the_shut"],
             "Karn Dolur stopped working the old seams in the year four "
             "hundred and has never written down which year it stopped for.",
             creature_type="elemental", size="large",
             descriptors=["a seamed", "a grinding"],
             behaviour=[{"priority": 15, "use": "call_the_shut",
                         "when": {"chance": 0.25}},
                        {"priority": 10, "use": "digging_claw"},
                        {"priority": 0, "use": "stone_fist"}],
             loot="seams_hoard", conditional=["silvered_cache"],
             interactions=[{"damageType": "piercing", "multiplier": 0.5},
                           {"damageType": "slashing", "multiplier": 0.5},
                           {"damageType": "lightning", "multiplier": 1.5}],
             immunities=["poisoned", "bleeding", "frightened", "blinded"],
             hp=78, guard=17),

    creature("rot_mother", "The Rot", 8, 700, A(16, 9, 19, 8, 13, 12),
             ["spore_burst", "bleed_white", "stone_fist", "call_the_shut"],
             "Mycelt grows what the Deeproads eat. This grows Mycelt, and has "
             "been patient about the order of those two facts.",
             creature_type="plant", size="large",
             descriptors=["a luminous", "a breathing"],
             behaviour=[{"priority": 25, "use": "spore_burst",
                         "when": {"chance": 0.4}},
                        {"priority": 15, "use": "call_the_shut",
                         "when": {"chance": 0.25}},
                        {"priority": 10, "use": "bleed_white"},
                        {"priority": 0, "use": "stone_fist"}],
             loot="rot_hoard", conditional=["silvered_cache"],
             interactions=[{"damageType": "poison", "multiplier": 0},
                           {"damageType": "necrotic", "multiplier": 0.5},
                           {"damageType": "fire", "multiplier": 2}],
             immunities=["poisoned", "bleeding", "frightened", "prone"],
             hp=96, guard=16),

    creature("salt_thing", "The Ninth Well", 7, 420, A(14, 13, 16, 11, 14, 13),
             ["salt_burn", "glass_shard", "wither"],
             "Eight wells were sunk for water. The ninth was sunk for "
             "something else and the diggers' camp does not go near it.",
             creature_type="aberration", descriptors=["a crusted", "a weeping"],
             behaviour=[{"priority": 10, "use": "salt_burn"},
                        {"priority": 0, "use": "glass_shard"}],
             loot="ninth_well_hoard", conditional=["silvered_cache"],
             interactions=[{"damageType": "acid", "multiplier": 0},
                           {"damageType": "cold", "multiplier": 1.5},
                           {"damageType": "bludgeoning", "multiplier": 1.5}],
             immunities=["poisoned", "bleeding", "blinded"], hp=70, guard=16),

    creature("cairn_thing", "What the Last Cairn Held", 7, 430,
             A(17, 11, 17, 9, 13, 14),
             ["rime_touch", "calving", "grave_chill"],
             "The Ice Moot has kept eleven hundred cairns for nine hundred "
             "years and this is the one they count from.",
             size="large", descriptors=["a rimed", "a shouldered"],
             behaviour=[{"priority": 20, "use": "calving",
                         "when": {"chance": 0.3}},
                        {"priority": 10, "use": "rime_touch"},
                        {"priority": 0, "use": "grave_chill"}],
             loot="last_cairn_hoard", conditional=["silvered_cache"],
             interactions=HALF_UNLESS_SILVER + [
                 {"damageType": "cold", "multiplier": 0},
                 {"damageType": "fire", "multiplier": 1.5}],
             immunities=["frightened", "slowed", "poisoned", "prone"],
             hp=82, guard=17),

    creature("reef_thing", "The Battery", 7, 410, A(16, 13, 16, 7, 14, 11),
             ["drag_under", "glass_shard", "rend"],
             "The drowned fort's guns are still pointed at the passage and "
             "something down there is still minding them.",
             size="large", descriptors=["a barnacled", "a green-black"],
             behaviour=[{"priority": 10, "use": "drag_under",
                         "when": {"chance": 0.35}},
                        {"priority": 0, "use": "rend"}],
             loot="drowned_fort_hoard", conditional=["silvered_cache"],
             interactions=HALF_UNLESS_SILVER + [
                 {"damageType": "cold", "multiplier": 0.5},
                 {"damageType": "lightning", "multiplier": 2}],
             immunities=["prone", "poisoned", "frightened"], hp=74, guard=16),

    creature("rime_wight", "A Rime Wight", 6, 300, A(14, 12, 15, 8, 12, 13),
             ["rime_touch", "grave_chill"],
             "The ice gives them back in the order it took them, which is not "
             "the order anybody would choose.",
             descriptors=["a blue-white", "a stiffened"],
             loot="ice_scraps", interactions=HALF_UNLESS_SILVER + [
                 {"damageType": "cold", "multiplier": 0}],
             immunities=["frightened", "slowed"], hp=42, guard=15),

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
