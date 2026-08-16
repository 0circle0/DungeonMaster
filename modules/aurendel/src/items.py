"""Aurendel — things you can carry.

The first entry in this file is the reason it exists. `strike` declares no
`onUse`, so an attack's damage comes entirely from `weaponOf()` reading the
attacker's equipped gear (rules/combat/attack.ts). With no items in the module,
every warden, stalker, ranger and keeper in Aurendel swung for exactly nothing
and the only class that could hurt anything was the adept, whose spells carry
their own damage. A weapon in `classes[].startingItems` is not flavour here; it
is the difference between combat existing and not.

Two other rules worth stating once:

  * A **key** is `value: 0`, because `shopStock` skips anything worth nothing —
    which is what keeps a quest object off a shopkeeper's shelf.
  * `properties` and `tags` both matter and do different jobs. A weapon's
    `tags` travel with its damage, so `damageInteractions[].unless` can name
    one; that is how silver bites something that shrugs off ordinary steel.
"""


def weapon(wid, name, dice, damage_type, value, description, *, stat="might",
           properties=(), tags=(), rarity=None):
    out = {
        "id": wid, "name": name, "description": description, "kind": "weapon",
        "slot": "hand", "value": value, "weight": 3,
        "damage": {"dice": dice, "damageType": damage_type, "stat": stat},
        "properties": list(properties), "tags": list(tags),
    }
    if rarity:
        out["rarity"] = rarity
    return out


def armour(aid, name, guard, value, description, *, weight=8, rarity=None):
    out = {
        "id": aid, "name": name, "description": description, "kind": "armor",
        "slot": "body", "value": value, "weight": weight,
        "modifiers": {"guard": guard},
    }
    if rarity:
        out["rarity"] = rarity
    return out


def potion(pid, name, value, description, effects, *, tags=("consumable",)):
    return {
        "id": pid, "name": name, "description": description, "kind": "consumable",
        "value": value, "weight": 0.5, "stackable": True, "consumedOnUse": True,
        "onUse": effects, "tags": list(tags),
    }


def treasure(tid, name, value, description):
    return {
        "id": tid, "name": name, "description": description, "kind": "treasure",
        "value": value, "weight": 1, "tags": ["treasure"],
    }


def key(kid, name, description, *, kind="key"):
    # `value: 0` keeps it off every shop shelf in the world. A quest object is
    # not merchandise, and `shopStock` enforces that by skipping it.
    return {
        "id": kid, "name": name, "description": description, "kind": kind,
        "value": 0, "weight": 0.5, "tags": ["quest"],
    }


HEAL = lambda dice: [{"heal": {"target": {"ref": "actor.id"}, "amount": {"roll": dice}}}]


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
    key("thornward_token", "The Moot's Token",
        "A slip of laid thorn. Elderhollow gives them out rarely and takes "
        "them back."),
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
]


# --- what everybody walks out of character creation holding ----------------
# `character.ts` merges `classes[].startingItems` with
# `start.creation.startingItems` and equips what it can, so the party arrives
# with the blade drawn rather than in the pack.

CLASS_KIT = {
    "warden":  [("iron_sword", 1), ("ring_mail", 1)],
    "stalker": [("hunting_bow", 1), ("iron_sword", 1), ("leather_jerkin", 1)],
    "ranger":  [("boar_spear", 1), ("hunting_bow", 1), ("leather_jerkin", 1)],
    "adept":   [("oak_staff", 1), ("leather_jerkin", 1)],
    "keeper":  [("iron_mace", 1), ("ring_mail", 1)],
}

# Everybody gets these on top of their class kit. Measured rather than
# guessed: the barrow was a two-in-ten party wipe without them.
PARTY_KIT = [("bandages", 3), ("healing_draught", 2)]


def outfit(classes):
    """Give every class its gear. Mutates the list `build.py` is about to emit."""
    for entry in classes:
        kit = CLASS_KIT.get(entry["id"])
        if kit:
            entry["startingItems"] = [{"item": i, "quantity": q} for i, q in kit]
    return classes
