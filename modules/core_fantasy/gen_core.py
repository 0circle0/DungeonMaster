#!/usr/bin/env python3
"""Generate modules/core_fantasy/module.json — the base standard ruleset.

Rules + character content only. No items, monsters, NPCs, or loot: those belong
to a world module. A token `nowhere` area exists solely so the base validates
standalone; world modules $delete it.
"""
import json
import os, os, collections

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "modules/core_fantasy")

def mod(centre=10, step=2):
    return {"floor": {"div": [{"sub": [{"ref": "value"}, centre]}, step]}}

ATTRS = [
    ("might", "Might", "MIG", "Raw physical force: what you can lift, break, and hit with."),
    ("agility", "Agility", "AGI", "Speed, balance, and hands that do what you tell them."),
    ("endurance", "Endurance", "END", "How much the world can take out of you before you stop."),
    ("intellect", "Intellect", "INT", "Learning, reasoning, and the memory to hold a long thought."),
    ("instinct", "Instinct", "INS", "What you notice without being told, and what you feel about it."),
    ("presence", "Presence", "PRE", "The weight you carry in a room, and your grip on your own nerve."),
]

DAMAGE = [
    ("slashing", "Slashing", "Edges."),
    ("piercing", "Piercing", "Points."),
    ("bludgeoning", "Bludgeoning", "Weight, swung."),
    ("fire", "Fire", "Burning."),
    ("cold", "Cold", "The heat taken out of a thing."),
    ("lightning", "Lightning", "Storm and static."),
    ("acid", "Acid", "What eats what it touches."),
    ("poison", "Poison", "What works from inside."),
    ("necrotic", "Necrotic", "The withering that graves teach."),
    ("radiant", "Radiant", "Light with an opinion."),
]

CREATURE_TYPES = [
    ("humanoid", "Humanoid", "People, more or less."),
    ("beast", "Beast", "Things that hunt because they are hungry."),
    ("undead", "Undead", "What refuses the grave."),
    ("construct", "Construct", "Made things that were given a purpose and kept it."),
    ("elemental", "Elemental", "Fire, stone, storm, and flood, given a shape and a temper."),
    ("fey", "Fey", "Old, courteous, and not remotely safe."),
    ("giant", "Giant", "Large enough that the ground remembers them."),
    ("dragon", "Dragon", "Winged, scaled, and older than the roads."),
    ("aberration", "Aberration", "Shapes that do not belong to this world's grammar."),
    ("ooze", "Ooze", "Hunger without a face."),
    ("plant", "Plant", "What grows, and sometimes reaches back."),
]

ALIGNMENTS = [
    ("lawful_good", "Lawful Good", "LG"), ("neutral_good", "Neutral Good", "NG"),
    ("chaotic_good", "Chaotic Good", "CG"), ("lawful_neutral", "Lawful Neutral", "LN"),
    ("true_neutral", "True Neutral", "N"), ("chaotic_neutral", "Chaotic Neutral", "CN"),
    ("lawful_evil", "Lawful Evil", "LE"), ("neutral_evil", "Neutral Evil", "NE"),
    ("chaotic_evil", "Chaotic Evil", "CE"),
]

LANGUAGES = [
    ("common", "Common", "The trade tongue of the roads and the ports.", False),
    ("old_tongue", "The Old Tongue", "What was written before the roads were cut.", True),
    ("delving", "Delving Cant", "The clipped speech of the deep holds, half of it struck on stone.", False),
    ("sylvan", "Sylvan", "The forest speech. Nobody agrees on how many words it has.", True),
    ("steppe_tongue", "Steppe Tongue", "Carried by riders, and by nobody who stays put.", False),
    ("glass_script", "Glass Script", "A southern script, cut rather than written.", True),
    ("deep_speech", "Deep Speech", "Heard below. Rarely a comfort.", True),
]

SKILLS = [
    ("athletics", "Athletics", "might", "Climbing, swimming, forcing, and holding on."),
    ("acrobatics", "Acrobatics", "agility", "Balance, tumbling, and landing well."),
    ("stealth", "Stealth", "agility", "Moving without being heard. Ranks quieten a careful step further; nothing makes you silent outright."),
    ("lockpicking", "Lockpicking", "agility", "Locks, latches, and the small mechanisms of other people's privacy."),
    ("craft", "Craft", "agility", "Joining, shaping, and repairing with the right tool in hand."),
    ("survival", "Survival", "instinct", "Tracks, weather, water, and which way is out."),
    ("perception", "Perception", "instinct", "Noticing the thing that was not meant to be noticed."),
    ("insight", "Insight", "instinct", "Reading a face for what it is not saying."),
    ("medicine", "Medicine", "intellect", "Wounds, fevers, and knowing when to stop trying."),
    ("lore", "Lore", "intellect", "History, heraldry, and what the old books actually said."),
    ("arcana", "Arcana", "intellect", "Wards, runes, and the shape of a working."),
    ("nature", "Nature", "intellect", "Beasts, growing things, and the habits of both."),
    ("persuasion", "Persuasion", "presence", "Getting a yes out of someone who began with no."),
    ("deception", "Deception", "presence", "Being believed about something untrue."),
    ("intimidation", "Intimidation", "presence", "Being believed about something unpleasant."),
    ("resolve", "Resolve", "presence", "Holding your nerve when the situation stops being reasonable."),
]

SAVES = [
    ("fortitude", "Fortitude", "endurance", "Enduring what the body must endure."),
    ("reflex", "Reflex", "agility", "Being somewhere else when it lands."),
    ("will", "Will", "presence", "Holding your own mind against something that wants it."),
]

CONDITIONS = [
    {"id": "bleeding", "name": "Bleeding", "description": "An open wound that has not been seen to.",
     "stacking": "stack", "defaultDuration": 3,
     "onTick": [{"damage": {"target": {"ref": "actor.id"}, "amount": 1, "damageType": "slashing"}}]},
    {"id": "burning", "name": "Burning", "description": "Alight, and not going out on its own.",
     "stacking": "refresh", "defaultDuration": 2,
     "onTick": [{"damage": {"target": {"ref": "actor.id"}, "amount": {"roll": "1d4"}, "damageType": "fire"}}]},
    {"id": "poisoned", "name": "Poisoned", "description": "Something in the blood that should not be there.",
     "stacking": "refresh", "defaultDuration": 4, "modifiers": {"guard": -1},
     "swings": {"ownAttacks": "disadvantage", "checks": "disadvantage"},
     "savingThrow": {"save": "fortitude", "difficulty": 12, "timing": "endOfTurn"},
     "onTick": [{"damage": {"target": {"ref": "actor.id"}, "amount": 1, "damageType": "poison"}}]},
    {"id": "frightened", "name": "Frightened", "description": "Nerve gone, and the body arguing for the door.",
     "stacking": "refresh", "defaultDuration": 2, "modifiers": {"guard": -2},
     "swings": {"ownAttacks": "disadvantage", "checks": "disadvantage"},
     "savingThrow": {"save": "will", "difficulty": 12, "timing": "endOfTurn"}},
    {"id": "emboldened", "name": "Emboldened", "description": "Steadied, and standing a little straighter for it.",
     "stacking": "refresh", "defaultDuration": 3, "modifiers": {"guard": 2}},
    {"id": "blinded", "name": "Blinded", "description": "Sight gone, whether from dark, dazzle, or injury.",
     "stacking": "refresh", "defaultDuration": 2, "modifiers": {"guard": -3},
     "swings": {"ownAttacks": "disadvantage"}, "suppressesSenses": ["sight"]},
    {"id": "disengaging", "name": "Disengaging", "description": "Backing out with your guard up, giving nobody a clean parting swing.",
     "stacking": "refresh", "defaultDuration": 1},
    {"id": "dodging", "name": "Dodging", "description": "Giving ground on purpose, and watching the hands.",
     "stacking": "refresh", "defaultDuration": 1,
     "swings": {"attacksAgainstSelf": "disadvantage"}},
    {"id": "helped", "name": "Helped", "description": "Someone steadying the ladder, holding the light, taking the weight.",
     "stacking": "refresh", "defaultDuration": 1,
     "swings": {"checks": "advantage"}},
    {"id": "silenced", "name": "Silenced", "description": "Sound will not leave you.",
     "stacking": "refresh", "defaultDuration": 2, "prevents": ["speak"]},
    {"id": "slowed", "name": "Slowed", "description": "Every movement costs more than it should.",
     "stacking": "refresh", "defaultDuration": 2, "modifiers": {"initiative": -2}},
    {"id": "stunned", "name": "Stunned", "description": "Nothing gets through for a moment.",
     "stacking": "refresh", "defaultDuration": 1, "modifiers": {"guard": -4},
     "prevents": ["action", "quick"],
     "savingThrow": {"save": "fortitude", "difficulty": 13, "timing": "endOfTurn"}},
    {"id": "prone", "name": "Prone", "description": "On the ground, and everyone above you knows it.",
     "stacking": "ignore", "defaultDuration": 1, "modifiers": {"guard": -2}},
]

ABILITIES = [
    {"id": "strike", "name": "Strike", "description": "A swing with whatever you are holding.",
     "actionType": "action", "targeting": "single",
     "attack": {"stat": "might", "against": "guard"}},
    {"id": "quick_shot", "name": "Quick Shot", "description": "A shot loosed before the target has finished deciding.",
     "actionType": "action", "targeting": "single", "range": 60,
     "attack": {"stat": "agility", "against": "guard"}},
    {"id": "guarded_stance", "name": "Guarded Stance", "description": "Give up the initiative and keep the ribs.",
     "actionType": "quick", "targeting": "self", "cooldown": 2,
     "onUse": [{"applyCondition": {"target": {"ref": "actor.id"}, "condition": "emboldened", "duration": 2}}]},
    {"id": "disengage", "name": "Disengage", "description": "Break away without turning your back on it.",
     "actionType": "action", "targeting": "self",
     "onUse": [{"applyCondition": {"target": {"ref": "actor.id"}, "condition": "disengaging", "duration": 1}}]},
    {"id": "dodge", "name": "Dodge", "description": "Spend the moment on not being hit.",
     "actionType": "action", "targeting": "self",
     "onUse": [{"applyCondition": {"target": {"ref": "actor.id"}, "condition": "dodging", "duration": 1}}]},
    {"id": "assist", "name": "Assist", "description": "Take the other half of whatever they are trying to do.",
     "actionType": "quick", "targeting": "single", "range": 5,
     "onUse": [{"applyCondition": {"target": {"ref": "target.id"}, "condition": "helped", "duration": 1}}]},
    {"id": "rally", "name": "Rally", "description": "A word at the right moment, worth more than a shield.",
     "actionType": "quick", "targeting": "allAllies", "costs": {"focus": 1}, "cooldown": 3,
     "onUse": [{"applyCondition": {"target": {"ref": "target.id"}, "condition": "emboldened", "duration": 3}}]},
    {"id": "shove", "name": "Shove", "description": "Put them on the ground and take the second you bought.",
     "actionType": "action", "targeting": "single",
     "attack": {"stat": "might", "against": "guard"},
     "onUse": [{"applyCondition": {"target": {"ref": "target.id"}, "condition": "prone", "duration": 1}}]},
    {"id": "first_aid", "name": "First Aid", "description": "Pressure, a clean strip of cloth, and a hand that does not shake.",
     "actionType": "action", "targeting": "single", "range": 5, "costs": {"focus": 1}, "cooldown": 2,
     "onUse": [{"heal": {"target": {"ref": "target.id"}, "amount": {"roll": "1d6"}}},
               {"removeCondition": {"target": {"ref": "target.id"}, "condition": "bleeding"}}]},
    {"id": "read_runes", "name": "Read Runes", "description": "An hour with a hand on the carving, and it gives up its sense.",
     "actionType": "action", "targeting": "none",
     "requires": {"skills": [{"skill": "arcana", "minRank": 2, "minTier": "adept"}]},
     "onUse": [{"setFlag": {"flag": "runes_read", "value": True}}]},
    {"id": "wardlight", "name": "Wardlight", "description": "A cold light that clings to the one who holds it.",
     "actionType": "action", "targeting": "self", "spellLevel": 1, "concentration": True,
     "components": ["verbal", "somatic"], "duration": "10 minutes",
     "onUse": [{"applyCondition": {"target": {"ref": "actor.id"}, "condition": "emboldened"}}]},
    {"id": "arcane_bolt", "name": "Arcane Bolt", "description": "A splinter of will, thrown.",
     "actionType": "action", "targeting": "single", "range": 60, "spellLevel": 1,
     "components": ["verbal", "somatic"],
     "attack": {"stat": "intellect", "against": "guard"},
     "onUse": [{"damage": {"target": {"ref": "target.id"}, "amount": {"roll": "2d6"}, "damageType": "fire"}}],
     "upcast": [{"damage": {"target": {"ref": "target.id"}, "amount": {"roll": "1d6"}, "damageType": "fire"}}]},
    {"id": "frost_lance", "name": "Frost Lance", "description": "A line of cold, drawn straight through whatever is standing in it.",
     "actionType": "action", "targeting": "allEnemies", "range": 30, "spellLevel": 2,
     "components": ["verbal", "somatic"],
     "areaOfEffect": {"shape": "line", "size": 30, "affects": "enemies"},
     "savingThrow": {"save": "reflex", "difficulty": 13, "onSuccess": "half"},
     "onUse": [{"damage": {"target": {"ref": "target.id"}, "amount": {"roll": "3d6"}, "damageType": "cold"}},
               {"applyCondition": {"target": {"ref": "target.id"}, "condition": "slowed", "duration": 1}}]},
    {"id": "mend_flesh", "name": "Mend Flesh", "description": "The wound closes, though it will still want telling about later.",
     "actionType": "action", "targeting": "single", "range": 5, "spellLevel": 1,
     "components": ["verbal", "somatic"],
     "onUse": [{"heal": {"target": {"ref": "target.id"}, "amount": {"roll": "2d4"}}}],
     "upcast": [{"heal": {"target": {"ref": "target.id"}, "amount": {"roll": "1d4"}}}]},
    {"id": "turn_the_dark", "name": "Turn the Dark", "description": "Named aloud, the old cold gives ground.",
     "actionType": "action", "targeting": "allEnemies", "range": 30, "spellLevel": 2,
     "components": ["verbal"],
     "savingThrow": {"save": "will", "difficulty": 13, "onSuccess": "negates"},
     "onUse": [{"applyCondition": {"target": {"ref": "target.id"}, "condition": "frightened", "duration": 3}}]},
    {"id": "augury", "name": "Augury", "description": "An hour of quiet and the right question, and something answers.",
     "actionType": "action", "targeting": "none", "spellLevel": 1, "ritual": True,
     "castingTime": "60 minutes", "components": ["verbal"],
     "onUse": [{"setFlag": {"flag": "augury_taken", "value": True}}]},
]

ANCESTRIES = [
    {"id": "human", "name": "Human", "description": "Everywhere, adaptable, and short-lived enough to be in a hurry about it.",
     "attributeBonuses": {"presence": 1}, "skillBonuses": {"persuasion": 1},
     "creatureType": "humanoid", "size": "medium", "languages": ["common"]},
    {"id": "dwarf", "name": "Dwarf", "description": "Hold-born. They measure a thing in centuries and are rarely wrong about stone.",
     "attributeBonuses": {"endurance": 1}, "skillBonuses": {"craft": 1, "lore": 1},
     "creatureType": "humanoid", "size": "medium", "languages": ["common", "delving"],
     "senses": {"sight": 30},
     "damageInteractions": [{"damageType": "poison", "multiplier": 0.5}]},
    {"id": "elf", "name": "Elf", "description": "Wood-kin and ruin-keepers. Long memories, longer grudges.",
     "attributeBonuses": {"agility": 1}, "skillBonuses": {"perception": 1, "arcana": 1},
     "creatureType": "humanoid", "size": "medium", "languages": ["common", "sylvan"],
     "senses": {"hearing": 30}},
    {"id": "halfling", "name": "Halfling", "description": "Small, unhurried, and very hard to catch.",
     "attributeBonuses": {"agility": 1}, "skillBonuses": {"stealth": 1, "survival": 1},
     "creatureType": "humanoid", "size": "small", "languages": ["common"],
     "speeds": {"walk": 25}},
    {"id": "orc", "name": "Orc", "description": "Steppe-bred and hold-broken both. Reputation runs ahead of them and is usually wrong.",
     "attributeBonuses": {"might": 1}, "skillBonuses": {"intimidation": 1, "athletics": 1},
     "creatureType": "humanoid", "size": "medium", "languages": ["common", "steppe_tongue"],
     "damageInteractions": [{"damageType": "bludgeoning", "multiplier": 0.75}]},
]

CLASSES = [
    {"id": "warden", "name": "Warden", "description": "Trained to hold a line, a bridge, or a doorway, and to be the last one through it.",
     "hitDie": "1d10", "primaryAttribute": "might", "attributeBonuses": {"might": 1},
     "skillProficiencies": ["athletics", "perception", "resolve"],
     "saveProficiencies": ["fortitude", "will"],
     "abilitiesByLevel": {"1": ["strike", "guarded_stance", "dodge", "assist", "disengage"], "2": ["rally"], "3": ["shove"]}},
    {"id": "stalker", "name": "Stalker", "description": "Roads, roofs, and other people's locks. Prefers the fight that never starts.",
     "hitDie": "1d8", "primaryAttribute": "agility", "attributeBonuses": {"agility": 1},
     "skillProficiencies": ["stealth", "lockpicking", "acrobatics", "perception"],
     "saveProficiencies": ["reflex"],
     "abilitiesByLevel": {"1": ["strike", "quick_shot", "dodge", "assist", "disengage"], "3": ["shove"]}},
    {"id": "ranger", "name": "Ranger", "description": "Between the settlements, where the roads stop being roads.",
     "hitDie": "1d10", "primaryAttribute": "instinct", "attributeBonuses": {"instinct": 1},
     "skillProficiencies": ["survival", "nature", "perception", "athletics"],
     "saveProficiencies": ["fortitude", "reflex"],
     "abilitiesByLevel": {"1": ["strike", "quick_shot", "dodge", "assist", "disengage"], "2": ["first_aid"]}},
    {"id": "adept", "name": "Adept", "description": "A scholar of workings. Fewer bones than the others and rather more books.",
     "hitDie": "1d6", "primaryAttribute": "intellect", "attributeBonuses": {"intellect": 2},
     "skillProficiencies": ["arcana", "lore", "insight"],
     "saveProficiencies": ["will"],
     "abilitiesByLevel": {"1": ["strike", "wardlight", "arcane_bolt", "dodge", "assist", "disengage"], "2": ["read_runes"], "3": ["frost_lance"]},
     "spellcasting": {"castingAttribute": "intellect",
                      "spellList": ["wardlight", "arcane_bolt", "frost_lance", "read_runes"],
                      "progression": 1, "knownByLevel": {"1": 2, "2": 3, "3": 4, "4": 5, "5": 6}}},
    {"id": "keeper", "name": "Keeper", "description": "Tends the shrines on the road and what walks between them.",
     "hitDie": "1d8", "primaryAttribute": "presence", "attributeBonuses": {"presence": 1, "instinct": 1},
     "skillProficiencies": ["medicine", "insight", "resolve", "lore"],
     "saveProficiencies": ["will", "fortitude"],
     "abilitiesByLevel": {"1": ["strike", "mend_flesh", "dodge", "assist", "disengage"], "2": ["first_aid", "augury"], "3": ["turn_the_dark"]},
     "spellcasting": {"castingAttribute": "presence",
                      "spellList": ["mend_flesh", "turn_the_dark", "augury", "wardlight"],
                      "progression": 1, "knownByLevel": {"1": 2, "2": 3, "3": 4, "4": 5, "5": 6}}},
]

LEVELS = [
    (1, 0), (2, 100), (3, 300), (4, 600), (5, 1000), (6, 1500), (7, 2100),
    (8, 2800), (9, 3600), (10, 4500), (11, 5500), (12, 6600), (13, 7800),
    (14, 9100), (15, 10500), (16, 12000), (17, 13600), (18, 15300),
    (19, 17100), (20, 19000),
]

rules = {
    "attributes": [
        {"id": i, "name": n, "abbrev": a, "description": d,
         "min": 8, "max": 20, "default": 10, "modifier": mod()}
        for i, n, a, d in ATTRS
    ],
    "resources": [
        {"id": "hp", "name": "Hit Points",
         "description": "What is left between you and the end of the story.",
         "max": {"max": [1, {"add": [8, {"mul": [{"ref": "actor.mod.endurance"}, {"ref": "actor.level"}]}]}]},
         "restoreOnShortRest": 0.25, "restoreOnLongRest": 1,
         "onDepleted": [{"emit": {"event": "died", "data": {"who": {"ref": "actor.id"}}}}]},
        {"id": "focus", "name": "Focus",
         "description": "Concentration spent on the difficult thing rather than the ordinary one.",
         "max": {"max": [0, {"add": [2, {"ref": "actor.mod.intellect"}]}]},
         "restoreOnShortRest": 0.5, "restoreOnLongRest": 1},
    ],
    "derivedStats": [
        {"id": "guard", "name": "Guard", "description": "How hard you are to land a blow on.",
         "formula": {"add": [10, {"ref": "actor.mod.agility"}]}},
        {"id": "initiative", "name": "Initiative", "description": "Who moves first when it starts.",
         "formula": {"ref": "actor.mod.agility"}},
        {"id": "carry", "name": "Carry", "description": "What you can haul before it starts to matter.",
         "formula": {"mul": [15, {"add": [1, {"ref": "actor.mod.might"}]}]}},
    ],
    "damageTypes": [{"id": i, "name": n, "description": d} for i, n, d in DAMAGE],
    "conditions": CONDITIONS,
    "savingThrows": [
        {"id": i, "name": n, "attribute": a, "description": d, "defaultDifficulty": 12}
        for i, n, a, d in SAVES
    ],
    "actionTypes": [
        {"id": "action", "name": "Action", "description": "The one substantial thing you do in a turn.", "perTurn": 1},
        {"id": "quick", "name": "Quick Action", "description": "Something done in the same breath as the main thing.", "perTurn": 1},
        {"id": "reaction", "name": "Reaction", "description": "Spent out of turn, on somebody else's mistake.", "perTurn": 1},
        {"id": "speak", "name": "Speech", "description": "Talking costs nothing but the breath.", "perTurn": 99},
        {"id": "gesture", "name": "Gesture", "description": "A sign, a point, a hand held up.", "perTurn": 99},
    ],
    "equipmentSlots": [
        {"id": "hand", "name": "Hand", "capacity": 2},
        {"id": "body", "name": "Body", "capacity": 1},
        {"id": "head", "name": "Head", "capacity": 1},
        {"id": "cloak", "name": "Cloak", "capacity": 1},
        {"id": "ring", "name": "Ring", "capacity": 2},
        {"id": "belt", "name": "Belt", "capacity": 1},
    ],
    "itemProperties": [
        {"id": "silvered", "name": "Silvered", "description": "Chased with silver along the edge. Old things feel it."},
        {"id": "two_handed", "name": "Two-Handed", "description": "Needs both hands, and gives up the shield to get them."},
        # The property that gives the word its meaning: a finesse weapon may be
        # swung with agility instead, and the better of the two is used for the
        # damage as well as for the roll.
        {"id": "finesse", "name": "Finesse", "description": "Rewards a quick hand over a heavy one.",
         "attackStats": ["agility"]},
        {"id": "thrown", "name": "Thrown", "description": "Meant to leave your hand and be regretted at a distance."},
        {"id": "heavy", "name": "Heavy", "description": "Slow to bring round, and worth it when it lands."},
        {"id": "reach", "name": "Reach", "description": "Keeps them a step further away than they would like."},
    ],
    "masteryTiers": [
        {"id": "novice", "name": "Novice", "atRank": 1},
        {"id": "adept", "name": "Adept", "atRank": 3},
        {"id": "expert", "name": "Expert", "atRank": 5},
        {"id": "master", "name": "Master", "atRank": 7},
    ],
    "creatureTypes": [{"id": i, "name": n, "description": d} for i, n, d in CREATURE_TYPES],
    "languages": [{"id": i, "name": n, "description": d, "exotic": e} for i, n, d, e in LANGUAGES],
    "alignments": [{"id": i, "name": n, "abbrev": a} for i, n, a in ALIGNMENTS],
    "sizes": [
        {"id": "tiny", "name": "Tiny", "space": 2, "reach": 0, "carryMultiplier": 0.25, "hitDie": "1d4"},
        {"id": "small", "name": "Small", "space": 5, "reach": 5, "carryMultiplier": 0.75, "hitDie": "1d6"},
        {"id": "medium", "name": "Medium", "space": 5, "reach": 5, "carryMultiplier": 1, "hitDie": "1d8"},
        {"id": "large", "name": "Large", "space": 10, "reach": 10, "carryMultiplier": 2, "hitDie": "1d10"},
        {"id": "huge", "name": "Huge", "space": 15, "reach": 15, "carryMultiplier": 4, "hitDie": "1d12"},
    ],
    "rests": [
        {"id": "breather", "name": "Breather", "description": "An hour sat down, out of the wind.",
         "kind": "short", "duration": 60, "interruptChance": 0.1},
        {"id": "camp", "name": "Make Camp", "description": "A fire, a watch rota, and eight hours of not walking.",
         "kind": "long", "duration": 480, "interruptChance": 0.25},
        {"id": "lodging", "name": "Take a Room", "description": "A bed with a roof over it. Nothing interrupts a paid bed.",
         "kind": "long", "duration": 480, "interruptChance": 0},
    ],
    "resolution": {
        "checkDice": "1d20", "advantageDice": "2d20kh1", "disadvantageDice": "2d20kl1",
        "criticalSuccessAt": 20, "criticalFailureAt": 1, "criticalDamageMultiplier": 2,
        "saveSuccessMultiplier": 0.5, "passiveBase": 10, "defaultDifficulty": 12,
        # A swung weapon scales the same way a cast spell does. Without this a
        # warden hits exactly as often at level 20 as at level 1, because
        # nothing raises an attribute after character creation.
        "attackBonus": {"add": [{"ref": "actor.proficiency"}, {"ref": "actor.attackMod"}]},
        "difficulties": {"trivial": 5, "easy": 8, "standard": 12, "hard": 16, "daunting": 20, "heroic": 25},
    },
    "progression": {
        "maxLevel": 20,
        "levels": [{"level": l, "xpRequired": x} for l, x in LEVELS],
        "proficiency": {"add": [2, {"floor": {"div": [{"sub": [{"ref": "actor.level"}, 1]}, 4]}}]},
        "levelVitality": {"policy": "average", "die": "class"},
    },
    "vitalResource": "hp",
    "initiativeStat": "initiative",
    "defaultSize": "medium",
    "defaultMovementMode": "walk",
    "senses": [
        {"id": "sight", "name": "Sight",
         "description": "What you can see, which is nothing at all through a wall. Either something is in view or it is not, so every threshold is the same.",
         "defaultRange": 60, "propagation": "line", "blockedBy": "opaque", "falloff": "cliff"},
        {"id": "hearing", "name": "Hearing",
         "description": "Sound travels in a straight line and stops at stone, but passes an open doorway perfectly well. It fades with distance, so a far-off clatter is worth walking towards and a near one is worth drawing steel for.",
         "defaultRange": 120, "propagation": "line", "blockedBy": "impassable", "falloff": "linear",
         "rememberMinutes": 30, "impressionTextKey": "heard_something",
         "faintImpressionTextKey": "heard_something_faint", "emptyTextKey": "heard_nothing",
         "thresholds": {"detect": 0.05, "investigate": 0.25, "aggro": 0.8}},
        {"id": "smell", "name": "Smell",
         "description": "Scent seeps around corners and hangs about long after you have gone. A hound follows where you went rather than where you are, and a cold trail is faint even underfoot.",
         "defaultRange": 125, "propagation": "field", "blockedBy": "impassable", "falloff": "linear",
         "lingerMinutes": 90, "spreadPerMinute": 0.4, "rememberMinutes": 60,
         "impressionTextKey": "smelled_something", "faintImpressionTextKey": "smelled_something_faint",
         "emptyTextKey": "smelled_nothing",
         "thresholds": {"detect": 0.05, "investigate": 0.3, "aggro": 0.95}},
    ],
    "stances": [
        {"id": "sneak", "name": "Sneak",
         "description": "Slow and careful. Half pace, a fifth the noise, and rather less of your smell on the wind.",
         "speedMultiplier": 0.5, "emits": {"hearing": 0.2, "smell": 0.6},
         "concealedBy": "stealth", "concealmentPerPoint": 0.04},
        {"id": "walk", "name": "Walk",
         "description": "An ordinary pace. Nothing gained, nothing given away.", "speedMultiplier": 1},
        {"id": "dash", "name": "Dash",
         "description": "Quick, and heard from a long way off.",
         "speedMultiplier": 1.5, "emits": {"hearing": 2.2, "smell": 1.4}},
    ],
    "perception": {"defaultStance": "walk", "sightSense": "sight", "curiosityMinutes": 20},
    "movementModes": [
        {"id": "walk", "name": "Walk", "defaultSpeed": 30, "terrainMultiplier": 1},
        {"id": "swim", "name": "Swim", "defaultSpeed": 15, "terrainMultiplier": 1},
        {"id": "climb", "name": "Climb", "defaultSpeed": 15, "terrainMultiplier": 1},
    ],
    "opportunities": [
        {"id": "parting_blow", "name": "Parting Blow",
         "description": "Anyone who walks out of your reach gives you one free swing, which is what makes disengaging a decision rather than a formality.",
         "on": "moveAway", "actionType": "reaction", "use": "strike", "usesPerRound": 1,
         # Nobody gets a free swing at someone who spent their action backing
         # out carefully. This is the whole of disengaging, and it needed the
         # gate to be able to see the creature that is leaving.
         "requires": {"not": {"exists": "target.conditions.disengaging"}}},
    ],
    "coverTypes": [
        {"id": "half", "name": "Half Cover", "defenceBonus": 2},
        {"id": "three_quarters", "name": "Three-Quarters Cover", "defenceBonus": 5},
        {"id": "total", "name": "Total Cover", "defenceBonus": 0, "blocksTargeting": True},
    ],
    "currency": {"name": "marks", "abbrev": "m"},
    "interactionRange": {"talk": 2, "reach": 1},
    "search": {"trapRadius": 2, "disarmReach": 1},
    "dispositionBands": [
        {"id": "devoted", "atLeast": 60, "stance": "ally"},
        {"id": "friendly", "atLeast": 20, "stance": "ally"},
        {"id": "neutral", "atLeast": -19, "stance": "neutral"},
        {"id": "hostile", "stance": "hostile"},
    ],
    "spellcasting": {
        "mode": "slots", "maxSpellLevel": 5,
        "slotTable": {"1": [2], "2": [3], "3": [4, 2], "4": [4, 3], "5": [4, 3, 2],
                      "6": [4, 3, 3], "7": [4, 3, 3, 1], "8": [4, 3, 3, 2],
                      "9": [4, 3, 3, 3, 1], "10": [4, 3, 3, 3, 2]},
        # Both scale with the proficiency curve. The literal 2 that used to
        # stand in for it was a level-1 caster's bonus, so a level-20 one
        # threw spells that were exactly as easy to dodge.
        "saveDifficulty": {"add": [8, {"ref": "actor.proficiency"}, {"ref": "actor.castingMod"}]},
        "attackBonus": {"add": [{"ref": "actor.proficiency"}, {"ref": "actor.castingMod"}]},
        "concentration": {"enabled": True, "savingThrow": "will",
                          "difficulty": {"max": [10, {"floor": {"div": [{"ref": "damage"}, 2]}}]},
                          "maxConcurrent": 1},
        "recoverOn": ["camp", "lodging"],
        "ritualCasting": True,
        "componentActionTypes": {"verbal": "speak", "somatic": "gesture"},
    },
}

content = {
    "skills": [{"id": i, "name": n, "attribute": a, "description": d} for i, n, a, d in SKILLS],
    "abilities": ABILITIES,
    "ancestries": ANCESTRIES,
    "classes": CLASSES,
}

world = {
    "terrains": [
        {"id": "void_floor", "name": "Nowhere", "description": "Placeholder ground. A world module replaces this.",
         "glyph": ".", "passable": True},
        {"id": "void_wall", "name": "The Edge", "description": "Placeholder wall.",
         "glyph": "#", "passable": False, "opaque": True},
    ],
    "palettes": [{"id": "void", "name": "Nowhere", "floor": "void_floor", "wall": "void_wall"}],
    "biomes": [{"id": "nowhere", "name": "Nowhere",
                "description": "The ruleset has to stand somewhere to be validated. A world module deletes this.",
                "layer": "overworld", "palette": "void"}],
    "areas": [{"id": "nowhere", "name": "Nowhere",
               "description": "A blank room that exists so the ruleset validates on its own. World modules delete it.",
               "biome": "nowhere", "dangerLevel": 0,
               "map": {"width": "9", "height": "9", "palette": "void"},
               "entryPoint": {"x": 4, "y": 4}}],
    "time": {
        "minutesPerDay": 1440, "minutesPerHour": 60, "daysPerMonth": 30,
        "startMinute": 480, "minutesPerTile": 1,
        "actionMinutes": {"search": 10, "disarm": 10, "sense": 1, "wait": 10},
    },
}

doc = collections.OrderedDict()
doc["format"] = 1
doc["id"] = "core_fantasy"
doc["version"] = "1.0.0"
doc["engine"] = "^1.0.0"
doc["extends"] = None
doc["meta"] = {
    "title": "Core Fantasy",
    "author": "DungeonMaster",
    "description": "The standard fantasy ruleset, with no world attached: six attributes, "
                   "hit points and focus, a d20 resolution, sixteen skills, five ancestries "
                   "and five classes, and the engine's full vocabulary of system text. "
                   "Worlds extend this and supply their own geography, items, and people.",
    "tags": ["ruleset", "base", "fantasy"],
    "license": "",
}
doc["rules"] = rules
doc["content"] = content
doc["world"] = world
def pool(pid, *texts):
    return {"id": pid, "variants": [{"text": t} for t in texts]}

# Sense impressions are ruleset furniture, not world colour: `rules.senses`
# points at them by name, so they have to live wherever the senses live. They
# are deliberately place-agnostic — a world module overrides any it wants to
# give a local accent.
TEXT_GRAMMAR = [
    pool("heard_something",
         "Something moves out there, {direction} of you, and does not care who knows it.",
         "A heavy sound, {direction}. Then nothing.",
         "Something shifts its weight somewhere {direction}.",
         "A clatter {direction} of you, and it does not repeat."),
    pool("heard_something_faint",
         "A sound, maybe. Somewhere {direction}.",
         "You stop. Whatever it was does not come again.",
         "Far off {direction}, something disturbs the quiet.",
         "The edge of a noise, {direction}, already gone."),
    pool("heard_nothing",
         "You hold still. Your own breathing, and nothing else.",
         "Nothing moving. Nothing in a hurry, at least.",
         "You listen a while. Whatever is out there is not walking.",
         "Quiet, and the particular kind that means nothing has noticed you yet."),
    pool("smelled_something",
         "Wet fur and old meat, carried {direction} on the air.",
         "A rank animal smell, close enough to place: {direction}.",
         "Something has been through here recently, and it stank.",
         "The air {direction} of you has something living in it."),
    pool("smelled_something_faint",
         "The wind turns and brings something sour from {direction}.",
         "A trace of musk, going cold.",
         "Something passed this way. Hours ago, by the smell.",
         "Faint, and old, and unmistakably an animal."),
    pool("smelled_nothing",
         "You take the air. Nothing in it but the place itself.",
         "Cold air, and no trail in it.",
         "Nothing has come this way lately, or the wind has taken it.",
         "You breathe deep. The air keeps its own counsel."),
]

# Keep whatever `npm run systemtext` already seeded, so regenerating this file
# never has to be followed by re-seeding 198 messages.
_existing_system_text = {}
_prev = os.path.join(OUT, "module.json")
if os.path.exists(_prev):
    with open(_prev) as _f:
        _existing_system_text = json.load(_f).get("narrative", {}).get("systemText", {})

doc["narrative"] = {"textGrammar": TEXT_GRAMMAR, "systemText": _existing_system_text}
doc["start"] = {
    "partySize": 4,
    "creation": {
        "attributePoints": 27,
        "attributeCosts": {"8": 0, "9": 1, "10": 2, "11": 3, "12": 4, "13": 5, "14": 7, "15": 9},
        "startingLevel": 1,
        "skillRanks": 4,
        "startingItems": [],
        "startingCurrency": 25,
    },
    "startingArea": "nowhere",
}

def jsonable(value):
    """A document Python and JavaScript serialize identically.

    A whole float becomes an int: JSON has one number type, but Python writes
    `1.0` where `JSON.stringify` writes `1`. Same value, same hash, pure diff.

    This mirrors `dmkit.assemble.jsonable`, copied rather than imported because
    this module is generated with nothing but the standard library on the path —
    `core_fantasy` is the base every other module composes in, so it does not
    depend on the shared kit.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [jsonable(v) for v in value]
    return value


os.makedirs(OUT, exist_ok=True)
# `ensure_ascii=False`: the studio writes these files too, and `JSON.stringify`
# emits an em dash as itself. Escaping here makes the editor's first save rewrite
# lines nobody touched.
with open(os.path.join(OUT, "module.json"), "w", encoding="utf-8") as f:
    json.dump(jsonable(doc), f, indent=2, ensure_ascii=False)
    f.write("\n")
print("wrote", os.path.join(OUT, "module.json"))
