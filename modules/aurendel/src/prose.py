"""Aurendel — the prose a place falls back on.

Every point of interest that has not earned its own pool narrates from one of
these: the nine interiors, for being *inside* an ordinary building anywhere on
the continent, and the ten `generic_*` pools `place.KIND_POOL` names for the
places that only have a kind.

They have to work in a fishing village and in a dwarf hold both, so they
describe the *situation* and leave the local colour to the place's name and to
the biome ambience in `ambience.py`.
"""
from dmkit.prose import pool

# --- interiors --------------------------------------------------------------
# A POI interior is one undivided map with one description (sim/enter.ts sets
# `rooms: []` for them), so these are what being *inside* an ordinary building
# reads like anywhere on the continent.

pool("int_house",
     "One room and a loft, a banked fire, and a smell of last night's supper.",
     "Swept boards, a bed against the far wall, and somebody's boots by the door.",
     "Low beams, a shuttered window, and everything the household owns within "
     "arm's reach of the hearth.",
     "Dark, warm, and lived in hard. A chair has been mended twice.")

pool("int_smithy",
     "Heat, and the particular ringing quiet of a forge between strikes.",
     "Anvil, slack-tub, and a wall of tongs hung in an order only the smith "
     "understands.",
     "Charcoal, scale, and iron. Your eyes take a moment.",
     "The fire is banked but not out, which means somebody is coming back.")

pool("int_store",
     "Shelves to the roof and a counter worn pale where hands go.",
     "Barrels, sacks, and the smell of a dozen things that keep.",
     "Everything the place cannot make for itself, in small quantities and at "
     "a mark-up.",
     "Well stocked, badly lit, and arranged by a system of some antiquity.")

pool("int_inn",
     "Low room, long tables, and a fire kept going out of habit rather than "
     "need.",
     "Ale, smoke, and a dog under a bench that has heard it all before.",
     "The common room, with the stairs going up at the back and somebody's "
     "cloak steaming by the hearth.",
     "Benches, trestles, and the particular stickiness of a floor that gets "
     "washed weekly.")

pool("int_temple",
     "Stone, cold air, and a light left burning on the altar.",
     "Pillars, and between them the quiet that gets built into a place on "
     "purpose.",
     "Whitewash, an offering shelf, and the smell of old smoke.",
     "Empty, tended, and expecting somebody at some point.")

pool("int_stable",
     "Straw, leather, and the warm patience of animals in the dark.",
     "Stalls down both sides, and a tack wall somebody keeps properly.",
     "Hay to the rafters, and a cat that has decided you are not interesting.")

pool("int_warehouse",
     "Crates to the ceiling in aisles, stencilled with marks and dates.",
     "Cold, dry, and stacked. Somebody's whole year is in here.",
     "Bales and barrels, and a ledger nailed to a post by the door.")

pool("int_workshop",
     "A bench under the window, tools on the wall, and shavings underfoot.",
     "Half-finished work on trestles, laid out in a system only the owner "
     "can follow.",
     "Glue, sawdust, and something clamped and waiting.")

pool("int_mill",
     "The whole building shakes gently, which is how you know the wheel is "
     "turning.",
     "Flour on every surface, in the air, and shortly on you.",
     "Gears the size of a cart, all of them wooden, all of them working.")


# --- the generic pools ------------------------------------------------------
# Every point of interest that has not earned its own prose falls back to the
# pool for its `kind`. These have to work in a fishing village and in a dwarf
# hold both, so they describe the *situation* and let the place's name and the
# biome ambience supply the local colour.

pool("generic_settlement",
     "Somewhere people actually live, going about it without reference to you.",
     "A door, a roof, and whoever is inside deciding whether to look up.",
     "The ordinary business of a place that was here before you and expects to "
     "be here after.",
     "Lived in, worked in, and swept this morning.")

pool("generic_market",
     "Stock, a counter, and somebody's whole living arranged along one wall.",
     "The trade is open, in the sense that the door is not shut.",
     "Goods stacked with the sort of care that means the owner knows where "
     "every one of them is.",
     "A place of business. It would like some.")

pool("generic_shrine",
     "A shelf, an offering, and a light somebody keeps going.",
     "Small, tended, and older than whatever is standing next to it.",
     "Stone worn smooth in the one place where hands go.",
     "Somebody was here recently and left something. It is still fresh.")

pool("generic_ruin",
     "Walls to about waist height, and grass in what used to be a floor.",
     "Roofless, and the roof has been gone long enough that trees have "
     "opinions about the space.",
     "Enough of it stands to show the shape. Not enough to show the purpose.",
     "Fallen stone, and the particular silence of a place that used to be "
     "noisy.")

pool("generic_camp",
     "Fire-scar, tent-pegs, and the ground trodden flat in a ring.",
     "Somebody stops here often. The wood pile has been restocked.",
     "Shelter of a temporary kind, put up by people who expect to move.",
     "Cold ashes, and boot prints going out in three directions.")

pool("generic_dungeon_mouth",
     "The way in. Cold air comes out of it, steadily, whatever the weather is "
     "doing up here.",
     "A hole with edges — cut, or worn, or both, and going down further than "
     "the light does.",
     "Dark, and the dark has a draught behind it, which means there is more of "
     "it than you can see.",
     "The opening, and the strong impression that it was not made for you.")

pool("generic_landmark",
     "The thing everyone gives directions by.",
     "Distinctive enough that it has a name, and old enough that nobody "
     "remembers who gave it one.",
     "It stands out. That is the whole of its job and it does it.",
     "You can see it from a long way off, which is presumably why it is here.")

pool("generic_crossing",
     "The way over. Whatever is underneath is deeper than it looks.",
     "Two roads and a decision, and a fair amount of traffic making it.",
     "Worn hard in the middle where everything goes.",
     "A crossing point, and the usual small settlement of people who charge "
     "for it.")

pool("generic_lair",
     "Something dens here. The ground says so, and so does the smell.",
     "Bones at the entrance, arranged by nothing with hands.",
     "A den. Occupied recently enough that the bedding is still flattened.",
     "The approach is trodden bare, all of it towards the opening.")

pool("generic_wilds",
     "Open ground, and nothing on it that anybody put there.",
     "The country, doing what it does when unobserved.",
     "No road, no wall, no roof. Just the place, in some quantity.",
     "Rough going, and a long view of more of the same.")
