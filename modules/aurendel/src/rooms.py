"""Aurendel — what a generated room can be, and what it says."""
from dmkit.dungeons import family as _family, trap as _trap

# roles -> (weight, minExits, maxExits, extras)
ROLES = {
    "entrance": (1, 1, 3, {"role": "entrance"}),
    "corridor": (4, 2, 4, {"role": "corridor"}),
    "chamber":  (5, 1, 4, {"role": "chamber"}),
    "vault":    (2, 1, 2, {"role": "vault", "lootChance": 0.6, "trapChance": 0.3}),
    "shrine":   (1, 1, 2, {"role": "shrine", "lootChance": 0.35}),
    "lair":     (2, 1, 3, {"role": "lair", "trapChance": 0.05}),
    "boss":     (1, 1, 2, {"role": "boss", "lootChance": 0.8, "neverTrap": True}),
}

ROLE_NAMES = {
    "entrance": "Entry", "corridor": "Passage", "chamber": "Chamber",
    "vault": "Vault", "shrine": "Shrine", "lair": "Den", "boss": "Deep Chamber",
}


def family(biome, label, texts, **kw):
    """`dmkit.dungeons.family`, with Aurendel's room roles."""
    return _family(biome, label, texts, roles=ROLES, role_names=ROLE_NAMES, **kw)


BARROW, BARROW_IDS = family("dungeon_barrow", "Barrow", {
    "entrance": (
        "Dry-stone walls close in either side and the daylight stops about six "
        "feet in, all at once.",
        "The passage in is lined with slabs set on edge, and every one of them "
        "was carried here.",
        "Low enough that you go in bent, which is presumably the point."),
    "corridor": (
        "A creep-passage, shoulder-wide, with the ceiling slabs resting on "
        "nothing you would care to test.",
        "The walls are dry-laid and there is no mortar anywhere in them.",
        "Something has been along here since it was sealed. The dust says so."),
    "chamber": (
        "A round chamber with a corbelled roof going up into dark, and stone "
        "benches round the wall.",
        "Grave goods were taken out of here a long time ago, and the marks of "
        "taking them are still in the floor.",
        "Cold, dry, and absolutely still. The air has not moved in a very long "
        "time and resents you for it."),
    "vault": (
        "A cist in the floor, capped, and the cap has been shifted before.",
        "Niches cut in all four walls, most of them empty, and no dust in the "
        "empty ones.",
        "The chamber was sealed twice: once with stone, and once with "
        "something that has left a mark on the lintel."),
    "shrine": (
        "A slab set upright at the far end, carved, and worn pale in one spot.",
        "Offerings on a ledge, and the newest of them is not very old at all.",
        "Somebody knelt here often enough to wear the floor."),
    "lair": (
        "Bedding of a sort — dried heather dragged in and flattened.",
        "Bones drawn into a corner and sorted by nothing that had hands.",
        "The smell arrives before the room does."),
    "boss": (
        "The end chamber, and the whole barrow was built to have this at the "
        "bottom of it.",
        "A single slab bench down the centre and everything else arranged "
        "around what was on it.",
        "The roof here is proper corbelled work and it has held for a thousand "
        "years without a crack."),
}, trap=0.18, loot=0.3)

DELVED, DELVED_IDS = family("dungeon_delved", "Delved", {
    "entrance": (
        "A squared doorway with a proper lintel and a threshold worn into a dip.",
        "The stair down is cut, not built, and every riser is the same height.",
        "Somebody wanted this found: the approach is dressed on both sides."),
    "corridor": (
        "A hall four paces wide with a barrel ceiling and lamp niches at "
        "intervals, all of them empty.",
        "The passage runs dead straight and the far end of it is out of sight.",
        "Tool marks on the walls, all going the same way, all the same width."),
    "chamber": (
        "A room laid out square, with pillars at the quarter points and a "
        "floor that still drains.",
        "Benches, shelving, and the fittings gone from every one of them.",
        "Whatever this room was for, it was for it in an organised way."),
    "vault": (
        "A strongroom: no windows, one door, walls a yard thick.",
        "Shelves cut into the stone itself, which is expensive and says "
        "something about what stood on them.",
        "The door frame is rebated for a door that is no longer here."),
    "shrine": (
        "A niche with a basin under it, and the basin has a channel cut to a "
        "drain.",
        "Carved work on all four walls, and the carving stops mid-figure on "
        "the fourth.",
        "Somebody kept a lamp here for a long time. The ceiling says how long."),
    "lair": (
        "The room has been rearranged by something that does not use "
        "furniture.",
        "Rubble heaped into a bank across one corner, deliberately.",
        "Fittings torn out and dragged into a pile. It took strength."),
    "boss": (
        "The hall the rest of it was cut to reach: pillared, high, and dressed "
        "to the ceiling.",
        "A dais at the far end with three steps up to it and nothing on top.",
        "The finest work in the whole delving, and it is at the deepest point, "
        "which is how you know what it was for."),
}, trap=0.15, loot=0.25)

CAVE, CAVE_IDS = family("dungeon_cave", "Cave", {
    "entrance": (
        "The opening is wider inside than out, and the floor slopes away from "
        "the light immediately.",
        "Water has cut this and water is still cutting it, somewhere below.",
        "Cold air on your face, steady, from a long way in."),
    "corridor": (
        "A rift you go along sideways, with the walls closer at head height "
        "than at the floor.",
        "The passage follows a bedding plane and turns wherever the rock does.",
        "Wet underfoot, and the sound of your boots comes back wrong."),
    "chamber": (
        "The roof lifts away out of the light and you can hear how big the "
        "room is before you can see it.",
        "Flowstone down one wall in sheets, and a pool at the bottom of it.",
        "Fallen blocks the size of carts, and paths worn between them."),
    "vault": (
        "A chamber off the main passage that nothing washes through, and "
        "things left here have stayed dry.",
        "A shelf of rock above the flood line, and it has been used as one.",
        "Dry, high, and out of the draught. Somebody has known about this."),
    "shrine": (
        "Somebody has stacked stones here in a way water does not.",
        "Marks on the wall in ochre, hand-height, and a hand among them.",
        "A natural alcove with everything in it arranged."),
    "lair": (
        "Trodden bare from the passage to the back wall and nowhere else.",
        "Bones, hair, and a smell that fills the whole chamber.",
        "Something comes here to sleep and is not tidy about it."),
    "boss": (
        "The great chamber. The roof is out of sight and there is water "
        "running somewhere under the floor.",
        "Columns of flowstone from floor to roof, and the space between them "
        "is enormous.",
        "You can shout in here and wait a genuinely uncomfortable time for the "
        "answer."),
}, trap=0.08, loot=0.18)

RUIN, RUIN_IDS = family("dungeon_ruin", "Ruin", {
    "entrance": (
        "A doorway with no door and a lintel holding up nothing in particular.",
        "The threshold is still there under the moss, worn in the middle.",
        "You step through a wall that stops at shoulder height."),
    "corridor": (
        "A passage with sky over it and saplings coming up through the floor.",
        "Two walls, no roof, and the paving still laid true underneath the "
        "leaf-fall.",
        "Ivy has taken the left wall entirely and is starting on the right."),
    "chamber": (
        "A room you can see the shape of from the footings, and a tree growing "
        "where the hearth was.",
        "Rubble to knee height and the plan of the place perfectly legible "
        "above it.",
        "Somebody's floor, still flat, still draining, four centuries after "
        "the roof went."),
    "vault": (
        "A cellar that kept its ceiling when the building lost its roof.",
        "Steps down into the one part of this place that is still dark.",
        "The vaulting held. That is why there is anything left in here."),
    "shrine": (
        "A carved stone still upright among the fallen ones, and somebody has "
        "cut back the bramble around it.",
        "The figure on the slab has weathered to a suggestion.",
        "Offerings, recent, in a place that has been abandoned for centuries."),
    "lair": (
        "The bramble is broken down in a run, all one way, and it is not a "
        "path.",
        "Something has taken the driest corner and made it worse.",
        "Feathers, and a great many of them."),
    "boss": (
        "The great hall: walls to full height on three sides, and the fourth "
        "gone entirely so you can see the sky and the trees past it.",
        "Column bases down both sides, evenly spaced, holding up nothing.",
        "This was the room the whole place was built round, and it is still "
        "the room you would build it round."),
}, trap=0.10, loot=0.22)

EMBER, EMBER_IDS = family("dungeon_ember", "Burnt", {
    "entrance": (
        "The opening breathes out warm air, steadily, and the ground either "
        "side of it is bare.",
        "Ash has drifted against the doorway and something has walked through "
        "the drift.",
        "It is warmer three paces in than it is outside, and the difference "
        "grows."),
    "corridor": (
        "A gallery driven through rock that has been cooked since it was cut.",
        "The walls are glazed in patches, which happens at a temperature you "
        "would not survive.",
        "Cinder underfoot, and the crunch of it carries a long way."),
    "chamber": (
        "A worked room with a crack across the floor that was not part of the "
        "design.",
        "Everything here is grey and everything here was once another colour.",
        "The ceiling has spalled and come down in sheets, and more of it will."),
    "vault": (
        "A strongroom with a door frame warped out of square by heat.",
        "Whatever was stored here is still here, and it is all one colour now.",
        "The seal held long enough to bake the contents rather than burn them."),
    "shrine": (
        "A basin cut for something molten, and it has been used.",
        "Figures carved facing the heat, which is an unusual choice.",
        "The offering shelf is glazed over and there is a shape under the "
        "glaze."),
    "lair": (
        "Something dens where it is warmest and has scoured the floor doing "
        "it.",
        "Slag drawn into a heap, and the heap is a nest.",
        "The heat here is genuinely uncomfortable and something prefers it."),
    "boss": (
        "The deep chamber, and the floor of it is a crust over something that "
        "is still moving.",
        "Light from below rather than above, which your eyes never quite "
        "accept.",
        "It is hot enough here that the air shakes and the far wall will not "
        "hold still."),
}, trap=0.16, loot=0.24)

DROWNED, DROWNED_IDS = family("dungeon_drowned", "Drowned", {
    "entrance": (
        "The way in is half under, and you go through it in water to the "
        "knee.",
        "The lintel is a foot above the surface and the surface is not "
        "constant.",
        "Water goes in here faster than it comes out, which means somewhere "
        "below is filling."),
    "corridor": (
        "A flooded passage, waist-deep, with the walls sound and the floor "
        "unreadable.",
        "Something has silted the whole length of this to an even depth.",
        "Your wake goes ahead of you down the passage and comes back."),
    "chamber": (
        "A room standing in its own reflection, with the waterline marked on "
        "every wall at three different heights.",
        "The floor is under two feet of black water and there is no telling "
        "what is on it.",
        "Reeds have got in and are doing well, which means light gets in "
        "somewhere too."),
    "vault": (
        "A strongroom above the waterline by about a hand's breadth, and dry "
        "inside because of it.",
        "Steps up rather than down, which in a drowned place is the whole "
        "point.",
        "Everything in here is intact, and everything below it is not."),
    "shrine": (
        "A figure standing in the water to the waist, carved, and facing the "
        "door.",
        "Offerings on a ledge, swollen and softened and still recognisable.",
        "The water is stiller here than it has any reason to be."),
    "lair": (
        "The water is churned up and stays churned up.",
        "Something has dragged its food up onto the one dry shelf.",
        "Ripples, from the far side, and nothing visible making them."),
    "boss": (
        "The great chamber, flooded to the springing of the vault, and the "
        "vault still holding.",
        "Deep water, black, with the tops of columns coming up out of it in "
        "two rows.",
        "There is a current in here, in a room with no outlet you can see."),
}, trap=0.12, loot=0.22)

SEWER, SEWER_IDS = family("dungeon_sewer", "Undercity", {
    "entrance": (
        "A culvert mouth with a grate that is standing open and has been for "
        "some time.",
        "Steps down beside the outfall, slick, with a rope-rail long since "
        "rotted off its rings.",
        "The smell announces the place before the dark does."),
    "corridor": (
        "A brick barrel with a channel down the middle and a ledge either "
        "side, and the ledge is narrow.",
        "Water going the same way you are, and rather faster.",
        "Side-inlets every thirty feet, all of them too small and all of them "
        "dripping."),
    "chamber": (
        "A junction chamber where four drains meet and argue about it.",
        "A vaulted room with steps down into the flow, for men who used to "
        "have to get down there.",
        "Above the vault, faintly, the sound of a street."),
    "vault": (
        "A dry chamber off the main run, bricked up once and unbricked since.",
        "Somebody's cache, on a ledge, above every flood mark on the wall.",
        "A room that was a cellar before the drain was cut through the side "
        "of it."),
    "shrine": (
        "A niche in the brickwork with a light in it, and somebody fills the "
        "light.",
        "Chalk marks around an alcove, redrawn often.",
        "An offering shelf down here, of all places, and it is not neglected."),
    "lair": (
        "The ledge is worn smooth and there is a great deal of hair on it.",
        "Something nests in the inlet where the flow is slowest.",
        "Bones washed into a corner and then arranged out of it."),
    "boss": (
        "The great cistern: a vaulted tank the size of a market square, with "
        "the water black and dead flat.",
        "Older stonework than the drains — this was down here before the "
        "sewers were cut to meet it.",
        "The echo in here comes back four times and each one is quieter and "
        "further away."),
}, trap=0.14, loot=0.24)

ICE, ICE_IDS = family("dungeon_ice", "Ice", {
    "entrance": (
        "A slot in the ice face, blue at the edges, with meltwater running out "
        "of it over the lip.",
        "The way in is a melt channel and it will not be this shape next "
        "season.",
        "Cold comes out of it that is worse than the cold outside, which you "
        "did not think possible."),
    "corridor": (
        "A tube of blue ice, scoured smooth, going down at an angle you have "
        "to brace against.",
        "Light comes through the walls rather than along the passage, from "
        "everywhere and from nowhere.",
        "The ice creaks continuously. It is not going to stop."),
    "chamber": (
        "A melt chamber with a floor of clear ice and things visible in it, "
        "further down than you want to look.",
        "The walls are blue going to black, and the black is depth.",
        "Icicles from the roof in a forest, some of them floor to ceiling."),
    "vault": (
        "A pocket in the ice, dry, with everything in it frozen exactly as it "
        "was put down.",
        "Whatever came in here is still here and is in remarkably good "
        "condition.",
        "Nothing has decayed. Nothing here can."),
    "shrine": (
        "Stones brought in from outside and stacked, which took somebody real "
        "effort.",
        "A shape cut into the ice wall, and the ice has moved since, and the "
        "shape has moved with it.",
        "Offerings, frozen in, at three different depths."),
    "lair": (
        "The ice is stained and trodden and there is a hollow melted into the "
        "floor the size of something large.",
        "Bones frozen into the wall at knee height, going back some way.",
        "Warm, comparatively, which means something has been lying here."),
    "boss": (
        "A cavern in the glacier with a roof of clear ice and grey daylight "
        "coming through forty feet of it.",
        "The floor is a frozen lake and there is a great deal underneath it.",
        "The whole chamber groans and shifts a fraction and settles, on some "
        "schedule of its own."),
}, trap=0.10, loot=0.2)

ROOM_TEMPLATES = (BARROW + DELVED + CAVE + RUIN + EMBER + DROWNED + SEWER + ICE)

BIOME_ROOMS = {
    "dungeon_barrow": BARROW_IDS,
    "dungeon_delved": DELVED_IDS,
    "dungeon_cave": CAVE_IDS,
    "dungeon_ruin": RUIN_IDS,
    "dungeon_ember": EMBER_IDS,
    "dungeon_drowned": DROWNED_IDS,
    "dungeon_sewer": SEWER_IDS,
    "dungeon_ice": ICE_IDS,
}


# --- traps: the one piece of `content` this world authors ---


TRAPS = [
    _trap("snare", "Snare",
          "A noose in a run, set by somebody who knew which run.",
          ("survival", 12), ("survival", 11), "1d6", "piercing"),
    _trap("pit", "Covered Pit",
          "Hurdles and turf over a hole somebody took real trouble digging.",
          ("perception", 13), ("craft", 12), "2d6", "bludgeoning",
          condition=("prone", 1)),
    _trap("dart_slab", "Dart Slab",
          "A floor slab on a pivot, and a row of holes in the wall opposite.",
          ("perception", 14), ("lockpicking", 14), "2d4", "piercing",
          condition=("poisoned", 3), reusable=True),
    _trap("falling_block", "Falling Block",
          "A ceiling stone held by a pin, and the pin is on a trip.",
          ("perception", 15), ("craft", 14), "3d6", "bludgeoning"),
    _trap("scything_blade", "Scything Blade",
          "Set in a slot cut across the passage, and the slot has been swept.",
          ("perception", 14), ("lockpicking", 13), "2d8", "slashing",
          condition=("bleeding", 3), reusable=True),
    _trap("gas_seal", "Broken Seal",
          "A jar bedded in the floor with a thread across the passage above it.",
          ("perception", 13), ("medicine", 13), "1d6", "poison",
          condition=("poisoned", 4)),
    _trap("flame_jet", "Flame Jet",
          "A nozzle low in the wall, sooted in a fan across the floor.",
          ("perception", 14), ("craft", 15), "3d6", "fire",
          condition=("burning", 2), reusable=True),
    _trap("ice_shelf", "False Floor",
          "Snow-bridge over a melt hole, and it has held so far.",
          ("survival", 14), ("survival", 15), "2d6", "cold",
          condition=("slowed", 2)),
    _trap("collapsing_stair", "Collapsing Stair",
          "Three treads rotted through and dressed to look like the rest.",
          ("perception", 12), ("craft", 12), "2d6", "bludgeoning",
          condition=("prone", 1)),
    _trap("alarm_bell", "Alarm Wire",
          "A wire at ankle height with something noisy on the far end of it.",
          ("perception", 13), ("lockpicking", 12), "1d4", "bludgeoning",
          reusable=True),
]

BIOME_TRAPS = {
    "dungeon_barrow": ["dart_slab", "falling_block", "gas_seal", "collapsing_stair"],
    "dungeon_delved": ["dart_slab", "scything_blade", "falling_block", "alarm_bell"],
    "dungeon_cave": ["pit", "collapsing_stair", "snare"],
    "dungeon_ruin": ["snare", "pit", "collapsing_stair", "alarm_bell"],
    "dungeon_ember": ["flame_jet", "falling_block", "gas_seal"],
    "dungeon_drowned": ["pit", "gas_seal", "collapsing_stair"],
    "dungeon_sewer": ["pit", "gas_seal", "alarm_bell", "snare"],
    "dungeon_ice": ["ice_shelf", "pit", "falling_block"],
}
