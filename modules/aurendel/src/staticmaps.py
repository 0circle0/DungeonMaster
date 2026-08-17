#!/usr/bin/env python3
"""Aurendel — the hand-drawn interiors.

A `maps/<id>/` folder is one CSV per layer plus a manifest, and the loader
inlines it into `world.maps` (packages/module/src/load.ts). Writing those CSVs
by hand is miserable, so each map is drawn here as ASCII art and expanded.

Rules the linter enforces, all of them worth knowing before you draw:

  * every layer is the same rectangle, and the first terrain layer has no empty
    cells — so the art is always a solid block, never ragged;
  * there must be an `entry` marker, it must be standable, and everything else
    must be reachable from it;
  * a gate cell has to sit on door-like terrain.

Run directly to write every folder:  python3 staticmaps.py
"""
import _bootstrap  # noqa: F401  sys.path; must come first
import os  # noqa: E402

from dmkit.maps import Map as _Map, write_all  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MAPS = os.path.join(ROOT, "modules/aurendel/maps")

# Art character -> terrain id. Anything not here is an error, deliberately:
# a typo in the art should not silently become floor.
TERRAIN = {
    "#": "wall_stone", "H": "wall_timber", "B": "wall_mudbrick",
    "h": "wall_hull", "I": "wall_ice", "^": "rock", "C": "cliff",
    ".": "flagstone", "-": "timber_floor", ",": "boardwalk", "s": "sand",
    "r": "rug", "v": "cave_floor", "*": "snow", "i": "ice",
    "+": "door", "A": "gate_arch", ">": "stair", "b": "bridge", "j": "jetty",
    "T": "table", "=": "counter", "E": "shelf", "O": "barrel", "K": "crate",
    "q": "bed", "d": "anvil", "F": "hearth", "V": "brazier", "P": "pillar",
    "2": "altar", "3": "urn", "l": "loom", "5": "stall", "6": "cart",
    "~": "shallows", "W": "deep_water", "m": "marsh", "R": "reeds",
    "u": "rubble", "M": "mushroom", "t": "thicket", "Y": "tree",
    "a": "ash", "x": "obsidian", "z": "glass_crust",
    # Markers draw as ordinary floor and carry a name on the marker layer.
    "@": "flagstone", "1": "timber_floor", "0": "boardwalk", "9": "cave_floor",
    "8": "sand", "7": "ice",
}

# Art character -> marker name, for the cells that carry one.
MARKER = {"@": "entry", "1": "entry", "0": "entry",
          "9": "entry", "8": "entry", "7": "entry"}

# Terrain ids you cannot stand on. Kept in step with materials.py by hand,
# which is fine because it is only used to catch drawing mistakes.
IMPASSABLE = {
    "wall_stone", "wall_timber", "wall_mudbrick", "wall_hull", "wall_ice",
    "rock", "cliff", "tree", "portcullis", "fence", "hedgerow", "palisade",
    "stump", "lava", "crevasse", "chasm", "standing_stone",
    "hearth", "brazier", "table", "counter", "shelf", "barrel", "crate",
    "anvil", "loom", "pillar", "altar", "urn", "well", "stall", "cart",
}


class Map(_Map):
    """`dmkit.maps.Map`, drawn in Aurendel's terrain vocabulary."""

    TERRAIN = TERRAIN
    MARKER = MARKER
    IMPASSABLE = IMPASSABLE


MAPS_TO_WRITE = [
    Map("kingshold_hall", "The Kingshold",
        "The great hall of Aurenhal's castle, its two withdrawing rooms, and "
        "the lodgings along the south front.", """
#############################
#.......#.........#.........#
#..PP...#....F....#...EE....#
#..PP...+....r....+...EE....#
#.......#....r....#.........#
#####+###....r....###+#######
#...........................#
#.P.....................P...#
#...........................#
#.P.....................P...#
#...........................#
####+#########+#########+####
#......#.............#......#
#..qq..#.....TT......#..qq..#
#..qq..#.....TT......#..qq..#
#......#.............#......#
########.....@.......########
#############+###############
#############################
"""),

    Map("grand_library", "The Grand Library",
        "Four galleries round an open well, the reading floor beneath it, and "
        "the copyists' rooms at the back.", """
#########################
#EEEEE#.........#EEEEE..#
#.....+.........+.......#
#EEEEE#....T....#EEEEE..#
#.....#....T....#.......#
###+#####.....#####+#####
#.......................#
#.EEE...P.......P...EEE.#
#.......................#
#.EEE...........V...EEE.#
#.......................#
#.EEE...P.......P...EEE.#
#...........@...........#
##+##+#############+#####
#...#.............#.....#
#.>.#....TTT......#.qq..#
#...#.............#.....#
#########################
"""),
    Map("countinghouse", "The Countinghouse",
        "Clerks' floor, principals' gallery, and the strongroom at the back.", """
#####################
#EEEEEEE#...........#
#.......+...TTTTT...#
#.......#...TTTTT...#
#EEEEEEE#...........#
####+#######.....####
#..................##
#.TT.TT.TT.TT.TT...##
#.TT.TT.TT.TT.TT...##
#..................##
#.TT.TT.TT.TT.TT...##
#.TT.TT.TT.TT.TT...##
#........@.........##
#########+###########
#.......#...........#
#..KKK..+....EEE....#
#..KKK..#....EEE....#
#.......#...........#
#####################
"""),

    Map("saltcliff_light", "The Saltcliff Light",
        "The keeper's room at the foot of the tower, the coal store beside it, "
        "and the stair going up.", """
###############
#.....#.......#
#.KKK.#..TT...#
#.KKK.+..TT...#
#.KKK.#.......#
#.....#..F....#
###+#####.....#
#.............#
#..P.......P..#
#......@......#
#..P.......P..#
#......>......#
#.............#
###############
"""),
    Map("moot_oak", "Inside the Moot Oak",
        "The hollow of the Elderhollow oak, floored and benched, with the "
        "town's records let into the wood at the back.", """
YYYYYYYYYYY
YYY.....YYY
YY.......YY
Y....T....Y
Y..T...T..Y
Y....V....Y
Y..T...T..Y
Y....T....Y
YY.......YY
YYY..@..YYY
YYYY.+.YYYY
YYYYYYYYYYY
"""),

    Map("karn_dolur_forge", "The Great Forge of Karn Dolur",
        "The top tier of the forge shaft: six hearths, the bellows gallery, "
        "and the rail over the drop.", """
#####################
#..d..#.......#..d..#
#.....#...F...#.....#
#..d..+...F...+..d..#
#.....#.......#.....#
###+#####...#####+###
#...................#
#.P...P...P...P...P.#
#...................#
#..KKK.......KKK....#
#..KKK.......KKK....#
#...................#
#.P...P.@.P...P...P.#
#...................#
####+#########+######
#.....#.....#.......#
#..O..+..O..+...>...#
#.....#.....#.......#
#####################
"""),

    Map("whalebone_meadhall", "The Jawbone",
        "One fire down the middle, benches down both sides, no windows, and a "
        "roof of whale jaw eighty feet long.", """
HHHHHHHHHHHHHHHHHHHHHHH
H.....................H
H.TTTTTTTTTTTTTTTTTTT.H
H.....................H
H..F...F...F...F...F..H
H.....................H
H.TTTTTTTTTTTTTTTTTTT.H
H.....................H
HHH+HHHHHH.....HHH+HHHH
H.......H.......H.....H
H..OOO..H...@...H..qq.H
H..OOO..H.......H..qq.H
H.......H.......H.....H
HHHHHHHHHHH+HHHHHHHHHHH
HHHHHHHHHHHHHHHHHHHHHHH
"""),

    Map("barrowgate_moot", "The Barrowgate Moot Hall",
        "One raised floor, benches on three sides, and the record chest at the "
        "back on the fourth.", """
#################
#...............#
#.TTTTTTTTTTTTT.#
#.T...........T.#
#.T....EEE....T.#
#.T....EEE....T.#
#.T...........T.#
#.TTTTTT.TTTTTT.#
#...............#
####+#######+####
#.....#.........#
#..V..+....@....#
#.....#.........#
#################
"""),

    Map("slag_temple", "The Slag Cathedral",
        "Cast in one pour over eleven years: a nave with no joints, side "
        "chapels, and the door in the floor at the crossing.", """
#####################
#...................#
#..P.....P.....P....#
#...................#
#.....#######.......#
#.....#.....#.......#
#..P..+..2..+..P....#
#.....#.....#.......#
#.....#######.......#
#...................#
#..P.....@.....P....#
#...................#
####+###########+####
#......#####........#
#..V...#####....2...#
#......#####........#
#####################
"""),

    Map("boardwalk_inn", "The Long Boardwalk",
        "Four hundred feet of covered walk with the inn at one end, the market "
        "hall at the other, and open water underneath all of it.", """
hhhhhhhhhhhhhhhhhhhhhhhhhhhhh
h.O.O.h,,,,,,,,,,,,,h.......h
h.....+,,,,,,,,,,,,,+.5.5.5.h
h.TTT.h,,,,,,,,,,,,,h.5.5.5.h
h.....h,,,,,,,0,,,,,h.......h
hhh+hhh,,,,,,,,,,,,,hhh+hhhhh
h.....h,,,,,,,,,,,,,h.......h
h.q.q.+,,,,,,,,,,,,,+...KKK.h
h.....h,,,,,,,,,,,,,h...KKK.h
h..F..hhhhhh,,,hhhhhh.......h
hhhhhhhhhhhh,,,hhhhhhhhhhhhhh
"""),

    Map("khans_yurt", "The Khan's Yurt",
        "Sixty feet of felt over a lattice: the fire in the middle, the rugs, "
        "and the standing screens at the back.", """
HHHHHHHHHHHHHHHHH
HHHrrrrrrrrrrrHHH
Hrrrrrrrrrrrrrrrh
Hrrr.........rrrh
Hrr...TTTTT...rrh
Hrr...........rrh
Hrr.....F.....rrh
Hrr...........rrh
Hrr...TTTTT...rrh
Hrrr....@....rrrh
Hrrrrrrrrrrrrrrrh
HHHrrrrr+rrrrrHHH
HHHHHHHHHHHHHHHHH
"""),

    Map("sunken_bath", "The Sunken Bath",
        "Three storeys built when the water stood forty feet higher, entered "
        "now at what used to be the roof.", """
#####################
#...................#
#.P...P...P...P...P.#
#...................#
#..~~~~~~~~~~~~~~~..#
#..~~~~~~~~~~~~~~~..#
#..~~~~~~~~~~~~~~~..#
#..~~~~~~~~~~~~~~~..#
#...................#
#.P...P...@...P...P.#
#...................#
####+###########+####
#.....#.....#.......#
#..3..+..2..+...>...#
#.....#.....#.......#
#####################
"""),

    Map("wreck_tavern", "The Weatherly",
        "A merchantman ashore stern-first: the great cabin aft, the common "
        "room amidships, and the hold below the waterline.", """
hhhhhhhhhhhhhhhhhhh
hh...............hh
h..TT.......TT....h
h..TT.......TT....h
h.................h
h.....F.....F.....h
h.................h
h..TT.......TT....h
h..TT.......TT....h
hh.......0.......hh
hhh+hhhhhhhhh+hhhhh
h.....h.....h.....h
h..O..+..q..+..KK.h
h..O..h..q..h..KK.h
h.....h.....h.....h
hhhhhhhhhhhhhhhhhhh
"""),

    Map("fungus_market", "The Fungus Market",
        "Trestles under a living roof: the light comes off the stock, and the "
        "stock is the light.", """
#####################
#MM...............MM#
#M...5.5.5.5.5.5...M#
#...................#
#M...5.5.5.5.5.5...M#
#...................#
#M.......@.........M#
#...................#
#M...5.5.5.5.5.5...M#
#MM...............MM#
####+###########+####
#.....#.........#..M#
#..K..+....=....+..M#
#..K..#....=....#..M#
#.....#.........#..M#
#####################
"""),
]


def main():
    for line in write_all(MAPS_TO_WRITE, MAPS):
        print("wrote", line)


if __name__ == "__main__":
    main()
