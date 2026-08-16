"""Aurendel — the text pools.

Every place the party can stand narrates from a `narrative.textGrammar` pool
named by its `descriptionKey`; the plain `description` field is only ever shown
by `look <name>` (narrate.ts:709). Pools need three or more variants or the
linter calls them thin.

`pool()` is the only constructor. Region files hand their prose to
`register()`; this module holds the shared pools that belong to nobody in
particular.
"""

_POOLS = {}


def pool(pid, *texts, **kw):
    """Register a text pool. Later calls with the same id replace earlier ones."""
    variants = []
    for t in texts:
        variants.append({"text": t} if isinstance(t, str) else t)
    entry = {"id": pid, "variants": variants}
    entry.update(kw)
    _POOLS[pid] = entry
    return pid


def registered():
    return [_POOLS[k] for k in sorted(_POOLS)]


def has(pid):
    return pid in _POOLS


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


# --- biome ambience ---------------------------------------------------------
# Fired on entering any area of the biome (sim/enter.ts, biome.ambienceKey).

pool("vale_ambience",
     "A mill-race runs somewhere out of sight, steady as breathing.",
     "Rooks go up off a hedge, complain, and settle again.",
     "Somebody's dog barks twice across the fields and thinks better of it.",
     "The wind comes over the barley in one long push and lets it stand back up.",
     "Cart-ruts in the lane have filled with yesterday's rain.")

pool("coast_ambience",
     "Gulls quarrel over something the tide left.",
     "The sea works away at the chalk below, patient about it.",
     "Salt has got into the grass and left it stiff and pale.",
     "Wind off the water takes the words out of your mouth.",
     "Far out, a sail leans over and is gone behind the headland.")

pool("deepwood_ambience",
     "The canopy closes over and takes most of the daylight with it.",
     "Something moves in the leaf litter and stops when you do.",
     "Moss has gone up the trunks on the north side, thick as felt.",
     "A woodpecker works at something, three trees off, and will not be found.",
     "The air under the trees is older and colder than the air outside them.")

pool("alpine_ambience",
     "Scree shifts somewhere above you and takes a while to stop.",
     "The air is thin enough that the climb costs more than it looks like it should.",
     "Wind comes down the pass in one direction only, and hard.",
     "Someone cut steps into this rock, and then nobody used them for a century.",
     "Cloud comes over the ridge and the temperature goes with it.")

pool("glacier_ambience",
     "The ice groans, somewhere deep, and settles.",
     "Your breath freezes in your beard before it has finished leaving you.",
     "Blue light comes up out of the crevasses, which is not a comfort.",
     "Nothing has walked here since the last snow, which was this morning.",
     "The cold is not weather here. It is simply the condition of things.")

pool("moor_ambience",
     "Heather to the skyline, and a wind that has not stopped in living memory.",
     "A curlew calls, and the sound goes a very long way.",
     "There is a mound on the rise ahead. There is always a mound on the rise ahead.",
     "The ground gives underfoot and then does not, without warning either way.",
     "Rain moves across the moor in a visible grey wall, taking its time.")

pool("volcanic_ambience",
     "The ground is warm through your boots and gets warmer where the cinder is black.",
     "Ash falls the way snow would, if snow were grey and tasted of iron.",
     "Something below shifts its weight and the whole reach shudders once.",
     "A vent lets go with a hiss forty paces off and then thinks better of it.",
     "Everything here has an edge, including the light.")

pool("swamp_ambience",
     "Black water, cypress knees, and a path that will not be here next season.",
     "Something goes into the water off to your left, unhurried.",
     "Frogs stop all at once, which is worse than the noise was.",
     "Spanish moss hangs low enough to take your hat and keep it.",
     "The air is warm, wet, and has been breathed before.")

pool("steppe_ambience",
     "Grass to every horizon, all of it leaning the same way.",
     "A kurgan stands on the skyline, and then another behind it.",
     "The wind has come a very long way and is not finished.",
     "Hoofprints in the dust, a day old, going somewhere with purpose.",
     "Smoke from somebody's fire, too far off to reach before dark.")

pool("desert_ambience",
     "Heat comes up off the sand as much as down from the sky.",
     "The dunes have moved since anybody last drew this.",
     "Glass crust breaks underfoot with a sound like a small bell.",
     "There is a wind, and it is carrying the desert somewhere else, grain by grain.",
     "Something buried shows a corner, and the sand is already taking it back.")

pool("isles_ambience",
     "Swell breaks white on a reef that is not on any chart worth having.",
     "Gulls, wind, and the particular smell of a wreck at low tide.",
     "Everything here was built out of something that used to float.",
     "The sea between the islands runs faster than it looks.",
     "A rope slaps a mast somewhere, over and over.")

pool("underdeep_ambience",
     "Fungus light, blue and insufficient, from the walls and the floor both.",
     "Water goes past below, and there is no telling how far below.",
     "Someone cut these walls square, a long time ago, and then stopped.",
     "Your own footsteps come back to you late and from the wrong direction.",
     "The dark here has weight. It gives ground and then takes it back.")

pool("urban_stone_ambience",
     "Cart wheels on cobbles, and a bell somewhere doing its office.",
     "Shutters go up. Somebody empties something into the gutter without looking.",
     "Smoke from a hundred chimneys leans all one way over the roofs.",
     "Two people argue about a price with no real heat in it.",
     "Watchmen go by in step, which they only do where they are being watched.")

pool("urban_timber_ambience",
     "Woodsmoke, a dog, and somebody splitting kindling behind a house.",
     "Hens have got out again and nobody has noticed.",
     "The lane is mud from the gate to the green and will be until Highsun.",
     "Somebody is singing at their work, badly and without embarrassment.",
     "Thatch, whitewash, and a smell of bread from the far end.")

pool("urban_delved_ambience",
     "The ceiling is a hundred feet up and lit by lamps somebody has to fill.",
     "Hammer-fall from below, in a rhythm too regular to be one man.",
     "Voices carry oddly here — near ones sound far, far ones sound near.",
     "The air moves, so the shafts are working, so the hold is alive.",
     "Stone underfoot, stone overhead, and none of it doubtful.")

pool("urban_desert_ambience",
     "Whitewash so bright it hurts, and every doorway turned away from the sun.",
     "Water runs somewhere under the street, which is why the street is here.",
     "Awnings crack overhead in a wind that is not cooling anything.",
     "The shade is a resource and everyone is standing in it.",
     "Somebody is calling the hour, and adding an opinion about the heat.")

pool("urban_isle_ambience",
     "The whole street moves a little when the swell comes in.",
     "Gull, tar, rope, and fish that has been out too long.",
     "Somebody is shouting a price from a boat to a window.",
     "Boards underfoot, water between them, and the water is doing well.",
     "Everything is tied to something else, which is the only thing keeping it here.")
