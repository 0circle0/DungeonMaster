"""Aurendel — Stage 1: the materials the world is drawn from.

Terrains, palettes, biomes, and the calendar. Nothing here names a place; it is
all the vocabulary that places are built out of.

Two engine facts shape this file:

  * `biome.palette` overrides `area.map.palette` (sim/enter.ts:688), so a
    settlement cannot borrow its region's biome — every built-up place needs an
    urban biome of its own or the town renders as the field it stands in.
  * A POI interior is built by `buildMap` with no palette override
    (sim/enter.ts:818), so `poi.map.palette` *is* honoured. That is what the
    `int_*` palettes are for: a generated interior is a walled rectangle plus
    scatter, which makes scatter the furniture.
"""
# `biomes()` below names an `<id>_ambience` pool for every non-dungeon biome.
# Imported for that side effect: the file that names a pool is the file that
# has to make sure something registered it.
import ambience  # noqa: F401

from dmkit import materials as _kit
from dmkit.materials import sc

# --- terrains ---------------------------------------------------------------
# (id, name, glyph, colour, passable, opaque, moveCost, description)
# Extra keyword columns are attached below by id.

T = [
    # open ground
    ("grass",        "Grass",            ".",  "green",   1, 0, 1,   "Ordinary turf, cropped short by whatever grazes here."),
    ("meadow",       "Meadow",           ",",  "green",   1, 0, 1,   "Long grass and flowering weeds, up to the knee."),
    ("cropland",     "Cropland",         ";",  "yellow",  1, 0, 1,   "Planted rows. Walking through them is nobody's favourite."),
    ("fallow",       "Fallow Field",     "'",  "yellow",  1, 0, 1,   "Turned earth resting a season."),
    ("moss",         "Mossy Ground",     "`",  "green",   1, 0, 1,   "Deep moss over old roots. Quiet underfoot."),
    ("leaf_litter",  "Leaf Litter",      "\"", "yellow",  1, 0, 1,   "Years of leaf-fall, and it announces every step."),
    ("heather",      "Heather",          "%",  "magenta", 1, 0, 1.5, "Woody purple scrub that hides the ground it grows on."),
    ("steppe_grass", "Steppe Grass",     "|",  "yellow",  1, 0, 1,   "Grass to the horizon, all of it leaning the same way."),
    ("shingle",      "Shingle",          "o",  "gray",    1, 0, 1.5, "Wave-rolled stones that slide underfoot."),
    ("saltflat",     "Salt Flat",        "-",  "white",   1, 0, 1,   "White crust over old sea-bed. It crunches."),

    # roads and paving
    ("dirt_road",    "Dirt Road",        "=",  "yellow",  1, 0, 0.8, "Rutted track, and better than the field beside it."),
    ("kingsroad",    "The Kingsroad",    "_",  "gray",    1, 0, 0.6, "Cut stone laid straight, kept up by the crown and its tolls."),
    ("cobble",       "Cobbles",          "e",  "gray",    1, 0, 0.8, "Round stones set in sand. Cart-ruts worn into them."),
    ("flagstone",    "Flagstones",       ":",  "gray",    1, 0, 0.8, "Flat-cut paving, the mark of somewhere that had money."),
    ("boardwalk",    "Boardwalk",        "-",  "yellow",  1, 0, 0.8, "Planks over water or mud, with gaps to watch for."),
    ("timber_floor", "Timber Floor",     "-",  "yellow",  1, 0, 1,   "Swept boards."),
    ("rug",          "Rug",              "~",  "red",     1, 0, 1,   "Woven and much walked on."),
    ("bridge",       "Bridge",           "b",  "yellow",  1, 0, 1,   "A crossing with rails, or without."),
    ("jetty",        "Jetty",            "j",  "yellow",  1, 0, 1,   "Boards on piles, out over the water."),
    ("stair",        "Stair",            ">",  "gray",    1, 0, 1.5, "Cut steps, going up or down as the case may be."),

    # water
    ("shallows",     "Shallows",         "~",  "blue",    1, 0, 2,   "Ankle-deep and cold."),
    ("deep_water",   "Deep Water",       "W",  "blue",    1, 0, 3,   "Over your head. You will have to swim it."),
    ("river",        "River",            "r",  "blue",    1, 0, 3,   "Moving water with an opinion about where you are going."),
    ("marsh",        "Marsh",            "m",  "green",   1, 0, 3,   "Standing water and sucking mud in equal measure."),
    ("reeds",        "Reeds",            "R",  "green",   1, 1, 2,   "Tall enough to hide a person, and often does."),
    ("bog_pool",     "Bog Pool",         "0",  "blue",    1, 0, 4,   "Black water of no honest depth."),

    # forest
    ("tree",         "Tree",             "T",  "green",   0, 1, 0,   "Trunk enough to stop you and shade enough to hide what is behind it."),
    ("thicket",      "Thicket",          "t",  "green",   1, 1, 3,   "Young growth packed tight. Slow, and blind."),
    ("bramble",      "Bramble",          "&",  "green",   1, 0, 4,   "Thorns that take payment in cloth and skin."),
    ("stump",        "Stump",            "n",  "yellow",  0, 0, 0,   "Cut a long time ago by somebody who is not here."),

    # rock and height
    ("rock",         "Rock",             "^",  "gray",    0, 1, 0,   "Bare stone, gone vertical."),
    ("scree",        "Scree",            "s",  "gray",    1, 0, 2,   "Loose slope that moves when you do."),
    ("cliff",        "Cliff",            "C",  "gray",    0, 1, 0,   "You would need hands and a great deal of confidence."),
    ("rubble",       "Rubble",           "u",  "gray",    1, 0, 2,   "What a wall becomes."),
    ("standing_stone", "Standing Stone", "I",  "gray",    0, 1, 0,   "Raised by somebody, for some reason, and still standing."),

    # cold
    ("snow",         "Snow",             "*",  "white",   1, 0, 2,   "Knee-deep in the drifts and shin-deep everywhere else."),
    ("ice",          "Ice",              "i",  "cyan",    1, 0, 1.5, "Blue-white and unsympathetic."),
    ("wall_ice",     "Ice Wall",         "#",  "cyan",    0, 1, 0,   "Glacier, sheared flat, older than any road."),
    ("crevasse",     "Crevasse",         "V",  "cyan",    0, 0, 0,   "A blue slot in the ice, and no bottom to see."),

    # heat
    ("ash",          "Ash",              "a",  "gray",    1, 0, 1.5, "Grey drift that takes a footprint and keeps it."),
    ("cinder",       "Cinder",           "c",  "red",     1, 0, 2,   "Black grit still warm from below."),
    ("lava",         "Lava",             "L",  "red",     0, 0, 0,   "No."),
    ("vent",         "Steam Vent",       "!",  "red",     1, 0, 1,   "A crack that breathes out, on its own schedule."),
    ("obsidian",     "Obsidian Shelf",   "x",  "gray",    1, 0, 1,   "Black glass in sheets, and every edge of it is an edge."),

    # desert
    ("sand",         "Sand",             "S",  "yellow",  1, 0, 1.5, "Fine, pale, and everywhere afterwards."),
    ("dune",         "Dune",             "D",  "yellow",  1, 0, 3,   "A slope that resets itself while you climb it."),
    ("glass_crust",  "Glass Crust",      "z",  "cyan",    1, 0, 2,   "Fused sand in fragile sheets. It sings when it breaks."),

    # underground
    ("cave_floor",   "Cave Floor",       ".",  "gray",    1, 0, 1,   "Dry stone, worn smooth in the middle where things walk."),
    ("cave_wall",    "Cave Wall",        "#",  "gray",    0, 1, 0,   "Living rock."),
    ("mushroom",     "Fungal Growth",    "M",  "magenta", 1, 0, 1.5, "Cap-forest to the shoulder, and it glows enough to see by."),
    ("chasm",        "Chasm",            "X",  "gray",    0, 0, 0,   "The floor stops. Something below it does not."),

    # built structure
    ("wall_stone",   "Stone Wall",       "#",  "gray",    0, 1, 0,   "Dressed block, or field-stone and mortar."),
    ("wall_timber",  "Timber Wall",      "H",  "yellow",  0, 1, 0,   "Frame and daub, or plank on plank."),
    ("wall_mudbrick","Mudbrick Wall",    "B",  "yellow",  0, 1, 0,   "Sun-dried brick, whitewashed against the glare."),
    ("wall_hull",    "Hull Timber",      "h",  "yellow",  0, 1, 0,   "Ship's planking, put to a second use ashore."),
    ("door",         "Door",             "+",  "yellow",  1, 1, 1,   "Shut, but not necessarily against you."),
    ("gate_arch",    "Gate Arch",        "A",  "gray",    1, 0, 1,   "The way through a wall, when somebody is minded to let you."),
    ("portcullis",   "Portcullis",       "P",  "gray",    0, 1, 0,   "Down, and going nowhere while it is."),
    ("fence",        "Fence",            "f",  "yellow",  0, 0, 0,   "Waist-high, and worth crouching behind."),
    ("hedgerow",     "Hedgerow",         "Y",  "green",   0, 1, 0,   "Centuries of laid thorn. A wall that grew."),
    ("palisade",     "Palisade",         "p",  "yellow",  0, 1, 0,   "Sharpened stakes, set close."),

    # furniture and dressing (interior scatter)
    ("hearth",       "Hearth",           "F",  "red",     0, 0, 0,   "Banked, and the warmest thing for a mile."),
    ("brazier",      "Brazier",          "v",  "red",     0, 0, 0,   "Coals in an iron basket, on a stand."),
    ("table",        "Table",            "T",  "yellow",  0, 0, 0,   "Scarred, and bolted down in the rougher places."),
    ("counter",      "Counter",          "=",  "yellow",  0, 0, 0,   "The line between the customer and the stock."),
    ("shelf",        "Shelving",         "E",  "yellow",  0, 1, 0,   "Floor to ceiling, and not quite full."),
    ("barrel",       "Barrel",           "O",  "yellow",  0, 0, 0,   "Stood on end, and used as a table by whoever got there first."),
    ("crate",        "Crate",            "#",  "yellow",  0, 0, 0,   "Stencilled with a mark you would need the ledger to read."),
    ("bed",          "Bed",              "q",  "yellow",  1, 0, 1.5, "Straw tick on a rope frame. It has known worse guests."),
    ("anvil",        "Anvil",            "d",  "gray",    0, 0, 0,   "Horn, face, and a hardy hole worn oval."),
    ("loom",         "Loom",             "l",  "yellow",  0, 1, 0,   "Warp-weighted, and taller than the weaver."),
    ("pillar",       "Pillar",           "1",  "gray",    0, 1, 0,   "Holding up more than it looks like it should."),
    ("altar",        "Altar",            "2",  "white",   0, 0, 0,   "Stone, worn pale in the middle by hands."),
    ("urn",          "Urn",              "3",  "yellow",  0, 0, 0,   "Waist-high, glazed, and sealed with wax."),
    ("well",         "Well",             "4",  "blue",    0, 0, 0,   "Wall, windlass, and a very long rope."),
    ("stall",        "Market Stall",     "5",  "magenta", 0, 0, 0,   "Trestle and awning, struck every evening."),
    ("cart",         "Cart",             "6",  "yellow",  0, 0, 0,   "Shafts down, tail-gate open."),
]

# Per-terrain extras, keyed by id.
TERRAIN_EXTRAS = {
    "deep_water":  {"requiresMode": ["swim"]},
    "river":       {"requiresMode": ["swim"]},
    "bog_pool":    {"requiresMode": ["swim"]},
    "cliff":       {"requiresMode": ["climb"]},
    "crevasse":    {"requiresMode": ["climb"]},
    "chasm":       {"requiresMode": ["climb"]},
    "thicket":     {"providesCover": "half"},
    "bramble":     {"providesCover": "half"},
    "rubble":      {"providesCover": "half"},
    "scree":       {"providesCover": "half"},
    "reeds":       {"providesCover": "half"},
    "fence":       {"providesCover": "half"},
    "stump":       {"providesCover": "half"},
    "obsidian":    {"providesCover": "half"},
    "table":       {"providesCover": "half"},
    "counter":     {"providesCover": "half"},
    "barrel":      {"providesCover": "half"},
    "crate":       {"providesCover": "half"},
    "cart":        {"providesCover": "half"},
    "stall":       {"providesCover": "half"},
    "urn":         {"providesCover": "half"},
    "altar":       {"providesCover": "half"},
    "pillar":      {"providesCover": "three_quarters"},
    "standing_stone": {"providesCover": "three_quarters"},
    "rock":        {"providesCover": "three_quarters"},
    "palisade":    {"providesCover": "three_quarters"},
    "door":        {"isDoor": True},
    "gate_arch":   {"isDoor": True},
    "portcullis":  {"isDoor": True},
    "hearth":      {"lightRadius": 4},
    "brazier":     {"lightRadius": 5},
    "mushroom":    {"lightRadius": 2},
    "lava":        {"lightRadius": 6},
    "vent": {
        "onEnter": [{"damage": {"target": {"ref": "actor.id"},
                                "amount": {"roll": "1d6"}, "damageType": "fire"}}],
    },
    "bramble": {
        "providesCover": "half",
        "onEnter": [{"applyCondition": {"target": {"ref": "actor.id"},
                                        "condition": "bleeding", "duration": 1}}],
    },
}

# What the ground is made of, for the purposes of what it remembers. Grouped
# by footing rather than by biome: a print is a fact about mud, and there are
# only about four kinds of mud in seventy-seven terrains.
#
# `stone` covers bare rock and everything built on it -- the cave floors and
# flagstones where a party can genuinely lose whatever is tracking it, which is
# the tactical point of the whole distinction.
GROUND = {
    "soft":    {"tracks": 1,   "smell": 1},
    "stone":   {"tracks": 0,   "smell": 0.6},
    "washed":  {"tracks": 0,   "smell": 0.15},
    "shifting": {"tracks": 0.5, "smell": 0.7},
}

TAGS = {
    # -- footing, for what the ground keeps -----------------------------------
    "soft": ["marsh", "reeds", "leaf_litter", "moss", "meadow", "cropland",
             "fallow", "heather", "steppe_grass", "grass", "dirt_road",
             "thicket", "bramble", "mushroom", "ash", "cinder"],
    "stone": ["rock", "scree", "cliff", "rubble", "standing_stone", "obsidian",
              "glass_crust", "cave_floor", "cobble", "flagstone", "boardwalk",
              "timber_floor", "kingsroad", "bridge", "jetty", "stair", "ice",
              "shingle", "saltflat", "lava", "vent"],
    "washed": ["shallows", "deep_water", "river", "bog_pool"],
    "shifting": ["sand", "dune", "snow"],

    "water": ["shallows", "deep_water", "river", "marsh", "bog_pool", "well"],
    "built": ["cobble", "flagstone", "boardwalk", "timber_floor", "rug", "wall_stone",
              "wall_timber", "wall_mudbrick", "wall_hull", "door", "gate_arch",
              "portcullis", "fence", "palisade", "stair", "bridge", "jetty"],
    "furniture": ["hearth", "brazier", "table", "counter", "shelf", "barrel", "crate",
                  "bed", "anvil", "loom", "pillar", "altar", "urn", "well", "stall", "cart"],
    "hazard": ["lava", "vent", "crevasse", "chasm", "bog_pool", "bramble"],
}


# --- palettes ---------------------------------------------------------------

PALETTES = [
    # -- wilderness ---------------------------------------------------------
    ("vale", "The Kingsvale", "grass", "hedgerow", None, "hedgerow", [
        sc("meadow", 0.20, "patch", scale=10, priority=0),
        sc("cropland", 0.14, "patch", scale=12, priority=1),
        sc("tree", 0.03, priority=2),
        sc("shallows", 0.06, "patch", scale=14, edgeTerrain="reeds", edgeWidth=1, priority=3),
        sc("fence", 0.02, priority=4),
    ]),
    ("coast", "The Silver Coast", "grass", "cliff", None, "cliff", [
        sc("shingle", 0.18, "patch", scale=9, priority=0),
        sc("deep_water", 0.16, "patch", scale=16, edgeTerrain="shallows", edgeWidth=2, priority=1),
        sc("rock", 0.05, priority=2),
        sc("heather", 0.08, "patch", scale=8, priority=3),
    ]),
    ("deepwood", "Duskwood", "moss", "tree", None, "tree", [
        sc("tree", 0.26, "patch", scale=7, priority=0),
        sc("leaf_litter", 0.20, "patch", scale=9, priority=1),
        sc("thicket", 0.09, priority=2),
        sc("bramble", 0.04, priority=3),
        sc("stump", 0.02, priority=4),
    ]),
    ("alpine", "The Skarnspine", "scree", "rock", None, "cliff", [
        sc("rock", 0.20, "patch", scale=8, priority=0),
        sc("snow", 0.16, "patch", scale=11, priority=1),
        sc("cliff", 0.06, priority=2),
        sc("grass", 0.07, "patch", scale=6, priority=3),
    ]),
    ("glacier", "Frostmere Waste", "snow", "wall_ice", None, "wall_ice", [
        sc("ice", 0.22, "patch", scale=12, priority=0),
        sc("rock", 0.05, priority=1),
        sc("crevasse", 0.03, priority=2),
        sc("shingle", 0.06, "patch", scale=8, priority=3),
    ]),
    ("moor", "The Weeping Moor", "heather", "rock", None, "rock", [
        sc("heather", 0.24, "patch", scale=10, priority=0),
        sc("marsh", 0.10, "patch", scale=13, edgeTerrain="reeds", edgeWidth=1, priority=1),
        sc("standing_stone", 0.015, priority=2),
        sc("rock", 0.05, priority=3),
    ]),
    ("volcanic", "The Ember Reach", "ash", "rock", None, "rock", [
        sc("cinder", 0.20, "patch", scale=9, priority=0),
        sc("obsidian", 0.10, "patch", scale=7, priority=1),
        sc("lava", 0.04, "patch", scale=6, edgeTerrain="cinder", edgeWidth=1, priority=2),
        sc("vent", 0.02, priority=3),
        sc("rock", 0.06, priority=4),
    ]),
    ("swamp", "Thornmere", "marsh", "tree", None, "tree", [
        sc("bog_pool", 0.14, "patch", scale=10, edgeTerrain="marsh", edgeWidth=1, priority=0),
        sc("reeds", 0.16, "patch", scale=8, priority=1),
        sc("tree", 0.10, priority=2),
        sc("thicket", 0.05, priority=3),
    ]),
    ("steppe", "The Sunward Steppe", "steppe_grass", "rock", None, "rock", [
        sc("meadow", 0.14, "patch", scale=14, priority=0),
        sc("scree", 0.06, "patch", scale=9, priority=1),
        sc("standing_stone", 0.01, priority=2),
        sc("shallows", 0.03, "patch", scale=11, edgeTerrain="reeds", edgeWidth=1, priority=3),
    ]),
    ("desert", "The Glasslands", "sand", "rock", None, "rock", [
        sc("dune", 0.24, "patch", scale=13, priority=0),
        sc("glass_crust", 0.08, "patch", scale=7, priority=1),
        sc("saltflat", 0.10, "patch", scale=12, priority=2),
        sc("rock", 0.04, priority=3),
    ]),
    ("isles", "The Sundered Isles", "shingle", "cliff", None, "deep_water", [
        sc("deep_water", 0.26, "patch", scale=15, edgeTerrain="shallows", edgeWidth=2, priority=0),
        sc("grass", 0.14, "patch", scale=8, priority=1),
        sc("rock", 0.07, priority=2),
        sc("rubble", 0.03, priority=3),
    ]),
    ("underdeep", "The Deeproads", "cave_floor", "cave_wall", None, "cave_wall", [
        sc("mushroom", 0.12, "patch", scale=7, priority=0),
        sc("rubble", 0.10, "patch", scale=9, priority=1),
        sc("shallows", 0.06, "patch", scale=11, priority=2),
        sc("chasm", 0.03, priority=3),
    ]),

    # -- settlements --------------------------------------------------------
    ("town_stone", "Stone-Built", "cobble", "wall_stone", "door", "wall_stone", [
        sc("flagstone", 0.16, "patch", scale=8, priority=0),
        sc("wall_stone", 0.10, "patch", scale=5, priority=1),
        sc("stall", 0.02, priority=2),
        sc("cart", 0.012, priority=3),
        sc("well", 0.006, priority=4),
    ]),
    ("town_timber", "Timber-Built", "dirt_road", "wall_timber", "door", "wall_timber", [
        sc("grass", 0.16, "patch", scale=7, priority=0),
        sc("wall_timber", 0.10, "patch", scale=5, priority=1),
        sc("fence", 0.04, priority=2),
        sc("cart", 0.012, priority=3),
        sc("well", 0.006, priority=4),
    ]),
    ("hold_delved", "Delved", "flagstone", "cave_wall", "door", "cave_wall", [
        sc("pillar", 0.05, priority=0),
        sc("stair", 0.03, priority=1),
        sc("brazier", 0.02, priority=2),
        sc("rubble", 0.04, "patch", scale=6, priority=3),
    ]),
    ("town_desert", "Sun-Built", "sand", "wall_mudbrick", "door", "wall_mudbrick", [
        sc("flagstone", 0.14, "patch", scale=7, priority=0),
        sc("wall_mudbrick", 0.10, "patch", scale=5, priority=1),
        sc("urn", 0.02, priority=2),
        sc("well", 0.008, priority=3),
    ]),
    ("town_isle", "Wreck-Built", "boardwalk", "wall_hull", "door", "deep_water", [
        sc("shallows", 0.14, "patch", scale=9, priority=0),
        sc("wall_hull", 0.09, "patch", scale=5, priority=1),
        sc("barrel", 0.03, priority=2),
        sc("crate", 0.03, priority=3),
    ]),

    # -- interiors ----------------------------------------------------------
    # The nine `place.TRADE_PALETTE` names. Every id below — the floors, the
    # walls, the scatter — is out of this file's own terrain vocabulary, which
    # is why they live here and not in the kit.

    ("int_timber", "Timber Interior", "timber_floor", "wall_timber", "door", "wall_timber", [
        sc("table", 0.05, priority=0),
        sc("barrel", 0.03, priority=1),
        sc("hearth", 0.02, priority=2),
        sc("bed", 0.03, priority=3),
    ]),
    ("int_stone", "Stone Interior", "flagstone", "wall_stone", "door", "wall_stone", [
        sc("pillar", 0.04, priority=0),
        sc("brazier", 0.025, priority=1),
        sc("table", 0.03, priority=2),
        sc("shelf", 0.03, priority=3),
    ]),
    ("int_delved", "Delved Interior", "flagstone", "cave_wall", "door", "cave_wall", [
        sc("pillar", 0.05, priority=0),
        sc("anvil", 0.02, priority=1),
        sc("brazier", 0.03, priority=2),
        sc("crate", 0.03, priority=3),
    ]),
    ("int_mudbrick", "Sun-Built Interior", "flagstone", "wall_mudbrick", "door", "wall_mudbrick", [
        sc("rug", 0.10, "patch", scale=4, priority=0),
        sc("urn", 0.04, priority=1),
        sc("shelf", 0.03, priority=2),
    ]),
    ("int_hull", "Hull Interior", "timber_floor", "wall_hull", "door", "wall_hull", [
        sc("crate", 0.06, priority=0),
        sc("barrel", 0.05, priority=1),
        sc("table", 0.03, priority=2),
    ]),
    ("int_cave", "Cave Interior", "cave_floor", "cave_wall", None, "cave_wall", [
        sc("rubble", 0.08, priority=0),
        sc("mushroom", 0.05, priority=1),
        sc("crate", 0.02, priority=2),
    ]),
    ("int_shop", "Shop Interior", "timber_floor", "wall_timber", "door", "wall_timber", [
        sc("counter", 0.05, priority=0),
        sc("shelf", 0.06, priority=1),
        sc("crate", 0.04, priority=2),
        sc("barrel", 0.03, priority=3),
    ]),
    ("int_forge", "Forge Interior", "flagstone", "wall_stone", "door", "wall_stone", [
        sc("anvil", 0.04, priority=0),
        sc("hearth", 0.03, priority=1),
        sc("barrel", 0.03, priority=2),
        sc("crate", 0.03, priority=3),
    ]),
    ("int_temple", "Temple Interior", "flagstone", "wall_stone", "door", "wall_stone", [
        sc("pillar", 0.06, priority=0),
        sc("altar", 0.02, priority=1),
        sc("brazier", 0.03, priority=2),
    ]),

    # -- dungeons -----------------------------------------------------------
    # A dungeon's whole look comes from its biome's palette, so these are the
    # difference between a barrow and a sewer.
    ("dun_barrow", "Barrow", "cave_floor", "wall_stone", "door", "wall_stone", [
        sc("rubble", 0.07, priority=0),
        sc("standing_stone", 0.02, priority=1),
        sc("urn", 0.02, priority=2),
    ]),
    ("dun_delved", "Delved Hall", "flagstone", "wall_stone", "door", "wall_stone", [
        sc("pillar", 0.05, priority=0),
        sc("rubble", 0.06, priority=1),
        sc("brazier", 0.015, priority=2),
        sc("stair", 0.02, priority=3),
    ]),
    ("dun_cave", "Cave", "cave_floor", "cave_wall", None, "cave_wall", [
        sc("rubble", 0.10, priority=0),
        sc("shallows", 0.07, "patch", scale=6, priority=1),
        sc("mushroom", 0.04, priority=2),
        sc("chasm", 0.015, priority=3),
    ]),
    ("dun_ruin", "Ruin", "moss", "wall_stone", "door", "tree", [
        sc("rubble", 0.12, priority=0),
        sc("leaf_litter", 0.10, "patch", scale=6, priority=1),
        sc("bramble", 0.04, priority=2),
        sc("stump", 0.02, priority=3),
    ]),
    ("dun_ember", "Burnt Deep", "ash", "rock", "door", "rock", [
        sc("cinder", 0.12, "patch", scale=6, priority=0),
        sc("obsidian", 0.07, priority=1),
        sc("vent", 0.02, priority=2),
        sc("lava", 0.02, "patch", scale=4, edgeTerrain="cinder", edgeWidth=1, priority=3),
    ]),
    ("dun_drowned", "Drowned Works", "shallows", "wall_stone", "door", "wall_stone", [
        sc("bog_pool", 0.10, "patch", scale=5, priority=0),
        sc("reeds", 0.07, priority=1),
        sc("rubble", 0.06, priority=2),
    ]),
    ("dun_sewer", "Undercity", "flagstone", "wall_stone", "door", "wall_stone", [
        sc("shallows", 0.16, "patch", scale=7, priority=0),
        sc("rubble", 0.07, priority=1),
        sc("crate", 0.02, priority=2),
    ]),
    ("dun_ice", "Ice Cave", "ice", "wall_ice", None, "wall_ice", [
        sc("snow", 0.12, "patch", scale=6, priority=0),
        sc("rubble", 0.05, priority=1),
        sc("crevasse", 0.03, priority=2),
    ]),
]


# --- biomes -----------------------------------------------------------------
# (id, name, layer, palette, description)
BIOMES = [
    ("vale", "The Kingsvale", "overworld", "vale",
     "River-country: hedged fields, mill-leats, and a road somebody keeps up."),
    ("coast", "The Silver Coast", "overworld", "coast",
     "Chalk over grey water. Wind off the sea and salt in everything."),
    ("deepwood", "Duskwood", "overworld", "deepwood",
     "Trees older than the kingdom, standing over what the kingdom replaced."),
    ("alpine", "The Skarnspine", "overworld", "alpine",
     "Cut passes, thin air, and stone that was worked long before anyone asked."),
    ("glacier", "The Frostmere Waste", "overworld", "glacier",
     "Ice with a grain to it, and a shoreline that the sea gave up on."),
    ("moor", "The Weeping Moor", "overworld", "moor",
     "Heather to the skyline, and under it more graves than living people."),
    ("volcanic", "The Ember Reach", "overworld", "volcanic",
     "Ash-fall country. The ground is warm and the weather comes from below."),
    ("swamp", "Thornmere", "overworld", "swamp",
     "Cypress standing in black water, and paths that are only paths this week."),
    ("steppe", "The Sunward Steppe", "overworld", "steppe",
     "Grass without end, broken by burial mounds and the smoke of somebody's camp."),
    ("desert", "The Glasslands", "overworld", "desert",
     "Dunes over fused sand, and a city that the sand mostly won."),
    ("isles", "The Sundered Isles", "overworld", "isles",
     "Rock, reef, and wreck. Everything here arrived by water or was left by it."),
    ("underdeep", "The Deeproads", "underworld", "underdeep",
     "Halls cut by hands and caverns cut by water, and no clean line between them."),

    ("urban_stone", "Stone Town", "overworld", "town_stone",
     "Cut stone, tiled roofs, and streets that were planned by somebody."),
    ("urban_timber", "Timber Town", "overworld", "town_timber",
     "Frame and thatch, a green, and lanes that were cow-paths first."),
    ("urban_delved", "Delved Hold", "underworld", "hold_delved",
     "Streets under a ceiling, lit by what the holds are willing to burn."),
    ("urban_desert", "Sun Town", "overworld", "town_desert",
     "Whitewashed brick, shaded lanes, and every doorway facing away from the glare."),
    ("urban_isle", "Wreck Town", "overworld", "town_isle",
     "Built out of what the sea returned, and standing on piles above it."),

    # Dungeon biomes. A dungeon's look and its room vocabulary both come from
    # its biome, so a barrow and a sewer have to be different biomes even when
    # they sit under the same fields.
    ("dungeon_barrow", "Barrow", "underworld", "dun_barrow",
     "Dry-stone chambers under a mound, built to be shut and not to be entered."),
    ("dungeon_delved", "Delved Hall", "underworld", "dun_delved",
     "Squared, dressed, and laid out by somebody with a plan and a workforce."),
    ("dungeon_cave", "Cave", "underworld", "dun_cave",
     "Cut by water over a very long time, and never intended for anyone."),
    ("dungeon_ruin", "Ruin", "overworld", "dun_ruin",
     "Roofless rooms with trees in them, and the plan still legible underfoot."),
    ("dungeon_ember", "Burnt Deep", "underworld", "dun_ember",
     "Worked ground that the mountain took back while it was still in use."),
    ("dungeon_drowned", "Drowned Works", "underworld", "dun_drowned",
     "Built dry, and standing in water now, and the water is winning."),
    ("dungeon_sewer", "Undercity", "underworld", "dun_sewer",
     "Drains, culverts, and the older streets they were cut through."),
    ("dungeon_ice", "Ice Cave", "underworld", "dun_ice",
     "Melt channels in a glacier, which move, and are therefore never twice "
     "the same shape."),
]


# --- calendar ---------------------------------------------------------------

TIME = {
    "minutesPerDay": 1440,
    "minutesPerHour": 60,
    "daysPerMonth": 30,
    "monthNames": [
        "Thawmoon", "Seedfall", "Greening", "Longlight", "Hayward", "Highsun",
        "Reaping", "Winnow", "Emberfall", "Rimewatch", "Deepdark", "Turning",
    ],
    "dayPhases": [
        {"id": "night", "name": "Night", "startMinute": 0},
        {"id": "dawn", "name": "Dawn", "startMinute": 330},
        {"id": "morning", "name": "Morning", "startMinute": 420},
        {"id": "afternoon", "name": "Afternoon", "startMinute": 750},
        {"id": "dusk", "name": "Dusk", "startMinute": 1140},
        {"id": "dark", "name": "After Dark", "startMinute": 1260},
    ],
    "startMinute": 480,
    "minutesPerTile": 1,
    "actionMinutes": {"search": 10, "disarm": 10, "sense": 1, "wait": 10},
}


# --- the three the build asks for -------------------------------------------
# Thin, because the shaping is `dmkit.materials`; what is here is the vocabulary.

def terrains():
    return _kit.terrains(T, extras=TERRAIN_EXTRAS, tags=TAGS, marks=GROUND)


def palettes():
    return _kit.palettes(PALETTES)


def biomes():
    return _kit.biomes(BIOMES)
