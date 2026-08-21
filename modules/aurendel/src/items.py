"""Aurendel — things you can carry."""
from dmkit.items import (HEAL, armour, gear, key, potion,  # noqa: F401
                         treasure, weapon)


# --- what the side chains pay in: head, cloak, ring and belt ---


SIDE_GEAR = [
    # -- act I -------------------------------------------------------------
    gear("poachers_lamp", "A Poacher's Lamp", "belt", 60,
         "Shuttered on three sides, and the fourth is shuttered too until you "
         "want it. The eel-men make them and do not sell them.",
         skills={"survival": 1, "stealth": 1}, weight=2),
    gear("tallow_hood", "The Tallow Hood", "head", 75,
         "Waxed against the drip, black against the dark, and cut so the "
         "hearing is not covered. The guild issues them and takes them back.",
         skills={"stealth": 2}, weight=1),
    gear("wreckers_lantern", "A Wrecker's Lantern", "belt", 70,
         "Shows a light that is the wrong colour for a harbour and exactly "
         "the colour of one, at four miles, in rain.",
         skills={"perception": 1, "deception": 1}, weight=2),
    gear("pilots_glass", "A Pilot's Glass", "head", 110,
         "Ground at Vashta Qal, mounted at Saltcliff, and worth more than the "
         "boat it is usually in.",
         skills={"perception": 2}, weight=1, rarity="uncommon"),

    # -- act II -------------------------------------------------------------
    gear("greenway_charm", "A Greenway Charm", "ring", 130,
         "Laid thorn, three turns, grown rather than tied. Elderhollow makes "
         "them for people going into the Witchwood and does not explain them.",
         skills={"nature": 2}, weight=0.2, rarity="uncommon"),
    gear("torc_of_the_ridge", "The Torc of the Ridge", "ring", 150,
         "Off the undug end of the Long Barrow, and whoever it was sized for "
         "was buried facing the other way from everybody else.",
         skills={"insight": 1, "resolve": 1}, guard=1, weight=0.5,
         rarity="rare"),
    gear("horn_bow", "An Ilkhet Horn Bow", "hand", 145,
         "Sinew, horn and forty years' seasoning, and it will outshoot yew at "
         "twice the distance nobody on foot needs.",
         damage=("1d8", "piercing", "agility"), properties=["two_handed"],
         skills={"survival": 1}, weight=3, rarity="uncommon"),
    gear("hold_hammer", "A Hold Hammer", "hand", 160,
         "Karn Dolur's pattern, made for a hand that expects to be swinging "
         "at stone and is not disappointed when it is not.",
         damage=("1d10", "bludgeoning", "might"), properties=["heavy", "two_handed"],
         skills={"craft": 1}, weight=8, rarity="uncommon"),
    gear("cinder_cloak", "A Cinder Cloak", "cloak", 180,
         "Woven from what the vent-readers pull out of the ash fall, which "
         "they will tell you is a kind of rock and is not.",
         skills={"resolve": 1}, resist=[("fire", 0.5)], weight=3,
         rarity="rare"),
    gear("bell_bronze_mace", "Bell-Bronze", "hand", 175,
         "Cast from what came up with the old church, and it still has the "
         "note in it. Things that have been under water a long time do not "
         "care for the note.",
         damage=("1d8", "radiant", "might"), skills={"resolve": 1}, weight=5,
         rarity="rare"),

    # -- act III ------------------------------------------------------------
    gear("hold_plate", "Hold Plate", "body", 320,
         "Karn Dolur's own, off the muster floor, and the ledger number is "
         "struck into the inside of the shoulder where it will outlast you.",
         guard=4, skills={"athletics": 1}, weight=26, rarity="rare"),
    gear("sporeward_mask", "A Sporeward Mask", "head", 280,
         "Charcoal, wet linen and a picker's patience. The Rot goes through "
         "everything eventually and it goes through this last.",
         skills={"medicine": 2}, resist=[("poison", 0.5)], weight=1,
         rarity="rare"),
    gear("fulgurite_lens", "The Fulgurite Lens", "head", 340,
         "Crater glass, ground at the Glass Quarter over nine years by a man "
         "who would not say what he was grinding it for.",
         skills={"lore": 2, "arcana": 1}, weight=1, rarity="very_rare"),
    gear("rimeward_coat", "The Rimeward Coat", "cloak", 300,
         "The Ice Moot cuts them from what the glacier gives back, and will "
         "not sell one to anybody who has not set a cairn.",
         skills={"athletics": 1, "survival": 1}, resist=[("cold", 0.5)],
         weight=6, rarity="rare"),
    gear("drowned_blade", "The Drowned Blade", "hand", 360,
         "Off the battery floor, green to the hilt, and silver under the "
         "green because the fort's armoury knew what the passage held.",
         damage=("1d10", "slashing", "might"), properties=["silvered"],
         tags=["silvered"], skills={"intimidation": 1}, weight=3,
         rarity="very_rare"),
]


ITEMS = [
    # -- weapons ----------------------------------------------------------
    weapon("iron_sword", "Iron Sword", "1d8", "slashing", 18,
           "Plain, well balanced, and made by somebody who makes a great many."),
    weapon("hunting_bow", "Hunting Bow", "1d6", "piercing", 16,
           "Yew, drawn to the ear, and quiet.", stat="agility",
           properties=["two_handed"]),
    weapon("boar_spear", "Boar Spear", "1d8", "piercing", 14,
           "A crossbar below the head, so what you stop stays stopped.",
           properties=["reach", "two_handed"]),
    weapon("oak_staff", "Oak Staff", "1d6", "bludgeoning", 8,
           "Shoulder height, iron-shod, and a great deal older than its owner.",
           stat="might", properties=["two_handed"]),
    weapon("iron_mace", "Iron Mace", "1d8", "bludgeoning", 16,
           "Flanged, short, and entirely honest about what it is for."),
    weapon("silvered_blade", "The Silvered Blade", "1d8", "slashing", 140,
           "Chased with silver along the edge. Old things feel it, and the "
           "wards were built against old things.",
           properties=["silvered"], tags=["silvered"], rarity="rare"),
    weapon("warden_blade", "A Warden's Blade", "1d10", "slashing", 260,
           "One of nine, made when the wards were made, and this is the only "
           "one anybody has found.",
           properties=["silvered"], tags=["silvered"], rarity="very_rare"),

    # -- armour -----------------------------------------------------------
    armour("leather_jerkin", "Leather Jerkin", 1, 12,
           "Boiled, shaped, and cheaper than caring about it."),
    armour("ring_mail", "Ring Mail", 2, 45,
           "Rings sewn to a coat. Noisy, heavy, and it works.", weight=20),
    armour("warded_coat", "The Warded Coat", 3, 180,
           "Stitched through with fine wire in a pattern somebody copied off a "
           "standing stone without asking what it meant.",
           weight=14, rarity="rare"),

    # -- consumables ------------------------------------------------------
    potion("bandages", "Bandages", 6, "Clean linen and a firm hand.", HEAL("1d6")),
    potion("healing_draught", "Healing Draught", 22,
           "Bitter, warm going down, and worth every mark.", HEAL("2d4")),
    potion("antidote", "Antidote", 18,
           "For the fen, the leech channels, and whatever the barrows use.",
           [{"removeCondition": {"target": {"ref": "actor.id"}, "condition": "poisoned"}}]),
    potion("ward_salt", "Ward Salt", 30,
           "A handful thrown over a threshold. The Keepers make it and will "
           "not say how.",
           [{"applyCondition": {"target": {"ref": "actor.id"},
                                "condition": "emboldened", "duration": 4}}],
           tags=["consumable", "ward"]),

    # -- quest objects ----------------------------------------------------
    key("undercroft_key", "The Undercroft Key",
        "Iron, cold, and it carries the steward's seal on a cord."),
    key("the_wardlist", "The Wardlist",
        "Nine entries in a hand four centuries dead. Three of them have been "
        "crossed through, recently, in different ink.", kind="trinket"),
    key("grown_key", "The Grown Key",
        "Not carved. The Witchwood put out a shape and somebody took it.",
        kind="trinket"),
    key("cast_key", "The Cast Key",
        "Poured, like the cathedral above it, in one piece and while hot.",
        kind="trinket"),
    key("glass_key", "The Glass Key",
        "Fulgurite, hollow, and it rings a note that is very slightly wrong.",
        kind="trinket"),
    # `thornward_token` was here with no source and no consumer.
    key("hold_warrant", "A Deep Warrant",
        "Karn Dolur's seal on slate, and the ledger number that goes with it."),

    # -- treasure, which is the party's only income -----------------------
    treasure("barrow_torc", "A Barrow Torc", 70,
             "Twisted gold, sized for a neck rather thicker than yours."),
    treasure("hold_silver", "Hold Silver", 45,
             "Struck at Karn Dolur and stamped with a year nobody uses."),
    treasure("glass_bead", "A Glass Bead", 28,
             "Crater glass, drilled, and green all the way through."),
    treasure("old_coin", "An Old Coin", 16,
             "Worn past reading on one face and perfectly sharp on the other."),
    treasure("amber_lump", "Amber", 34,
             "Something is in it. Nobody agrees what."),
    treasure("wight_ash", "Grave Ash", 20,
             "What a barrow-thing leaves. The Library buys it and will not say "
             "why."),

    # -- materials --------------------------------------------------------
    {"id": "iron_ore", "name": "Iron Ore", "kind": "material", "value": 5,
     "weight": 4, "stackable": True, "tags": ["material"],
     "description": "Graded and stamped at the Ore Yard."},
    {"id": "fungus_cap", "name": "Lantern Cap", "kind": "material", "value": 4,
     "weight": 0.2, "stackable": True, "tags": ["material"],
     "description": "Glows enough to read by for about nine hours."},
    {"id": "eel_skin", "name": "Eel Skin", "kind": "material", "value": 6,
     "weight": 0.3, "stackable": True, "tags": ["material"],
     "description": "Cured, it will outlast the boot it is sewn to."},
    {"id": "wreck_brass", "name": "Wreck Brass", "kind": "material", "value": 12,
     "weight": 1.5, "stackable": True, "tags": ["material", "treasure"],
     "description": "Fittings off something that did not make the passage. "
                    "The Countinghouse would rather you did not say where."},
] + SIDE_GEAR


# --- what everybody walks out of character creation holding ---

CLASS_KIT = {
    "warden":  [("iron_sword", 1), ("ring_mail", 1)],
    "stalker": [("hunting_bow", 1), ("iron_sword", 1), ("leather_jerkin", 1)],
    "ranger":  [("boar_spear", 1), ("hunting_bow", 1), ("leather_jerkin", 1)],
    "adept":   [("oak_staff", 1), ("leather_jerkin", 1)],
    "keeper":  [("iron_mace", 1), ("ring_mail", 1)],
}

# Everybody gets these on top of their class kit.
PARTY_KIT = [("bandages", 3), ("healing_draught", 2)]
