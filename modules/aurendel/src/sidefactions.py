"""Aurendel — the nine powers the questline never had to name.

The main six are the story of the Unsealing: a Crown that wants it quiet, a
Library that wants it written down, Keepers who want the doors shut, a hold that
charges for the privilege of not opening one, forty guides, and the thing on the
other side. They are continental. They have nothing to say about who is allowed
to cut peat.

These nine are local, and that is the point of them. Each holds one region, each
has a rank ladder worth climbing, and each declares `relations` that spill one
hop into the main six — so salvaging a wreck off the Strand is eventually a fact
the Crown has an opinion about, without the Crown having to declare a coastline.

Two rules, both learned the hard way elsewhere in this module:

  * **A faction with no deed kind is a number.** Standing moved only by
    `adjustReputation` is silent: nobody witnesses it, nobody spreads it, nobody
    is cold to you a fortnight later in a different town. Every faction below
    names at least one deed so the memory model carries it.
  * **`decayPerDay` is mercy, and not everybody gets it.** Standing drifts back
    toward neutral without crossing it. A guild forgets. A drowned bell does
    not, and neither do people who count wrecks.
"""
from sidekit import regional, deed_kind

FACTIONS = [
    regional(
        "the_ratcatchers", "The Ratcatchers' Guild",
        "Forty-one people with a charter, a livery, and the only complete map "
        "of what is under Aurenhal. They did not make the map for the Crown "
        "and they are not showing it to the Crown.",
        standing=0, decay=0.07,
        relations={"the_crown": -0.3},
        ranks=[("marked", "Marked", -35), ("hired", "Casual Hire", 0),
               ("liveried", "Liveried", 25), ("warden_of_the_under", "Warden of the Under", 55)]),

    regional(
        "the_countinghouse", "The Countinghouse",
        "Sarnport's exchange, its harbour court, and the insurers who between "
        "them decide what a drowned ship was worth and who has to say so out "
        "loud.",
        standing=0, decay=0.05,
        relations={"the_crown": 0.25, "the_salvors": -0.4},
        ranks=[("defaulted", "Defaulted", -30), ("named", "A Name on the Book", 0),
               ("underwriter", "Underwriter", 25), ("of_the_court", "Of the Harbour Court", 55)]),

    regional(
        "the_salvors", "The Salvors",
        "The Isles and the Strand, and a very old argument about the "
        "difference between a wreck and a cargo. They have never once lost it "
        "in front of a magistrate, because no magistrate has ever come.",
        # They start suspicious of everybody who arrives by road.
        standing=-5, decay=0.06,
        relations={"the_countinghouse": -0.4, "the_crown": -0.2},
        ranks=[("beached", "Beached", -35), ("crewed", "Crewed", 0),
               ("shareholder", "Holding a Share", 25), ("wreckmaster", "Wreckmaster", 50)]),

    regional(
        "the_horse_lords", "The Ilkhet Lines",
        "Nine families, eleven thousand horses, and a grazing right that is "
        "older than the Crown and has never been written down anywhere the "
        "Crown could read it.",
        standing=0, decay=0.05,
        relations={"the_keepers": 0.2},
        ranks=[("footed", "Footed", -30), ("guested", "Guested", 0),
               ("of_the_lines", "Of the Lines", 25), ("wind_brother", "Wind-Brother", 55)]),

    regional(
        "the_vent_readers", "The Vent-Readers",
        "Cinderhold's oldest office: eleven people who watch what the ground "
        "is doing and are believed, because the two times they were not, "
        "there is a village under the ash.",
        standing=0, decay=0.04,
        relations={"karn_dolur": 0.25, "the_keepers": 0.15},
        ranks=[("deaf", "Deaf to It", -30), ("listener", "Listener", 0),
               ("reader", "Reader", 25), ("of_the_eleven", "Of the Eleven", 55)]),

    regional(
        "the_ferrymen", "The Pole-Ferrymen",
        "Thornmere has no roads, one bell, and a hundred and six people who "
        "know which channels are where this week. Everything that crosses the "
        "marsh crosses because they said so.",
        standing=0, decay=0.06,
        relations={"the_countinghouse": 0.2},
        ranks=[("walking", "Let Them Walk", -30), ("poled", "Poled Across", 0),
               ("of_the_channels", "Of the Channels", 25), ("bell_kin", "Bell-Kin", 50)]),

    regional(
        "the_ice_moot", "The Ice Moot",
        "Cairnhold's half of the Keepers' habit, kept eleven hundred miles "
        "from anybody who would call it that. They tend the northern cairns "
        "and have opinions about the southern ones.",
        standing=5, decay=0.03,
        relations={"the_keepers": 0.4},
        ranks=[("cairn_breaker", "Cairn-Breaker", -50), ("thawed", "Thawed", -15),
               ("of_the_moot", "Of the Moot", 15), ("stone_setter", "Stone-Setter", 45)]),

    regional(
        "the_pickers", "The Pickers",
        "Mycelt grows the food the Deeproads eat, and the Rot eats Mycelt. "
        "The pickers stand between those two facts with knives.",
        standing=0, decay=0.05,
        relations={"the_wayfinders": 0.3, "karn_dolur": 0.15},
        ranks=[("blighted", "Blighted", -30), ("hand", "A Hand at the Beds", 0),
               ("cutter", "Cutter", 25), ("of_the_deep_beds", "Of the Deep Beds", 50)]),

    regional(
        "the_water_wardens", "The Water Wardens of Vashta Qal",
        "One spring, four thousand people, and an office that decides how much "
        "of it you are, personally, allowed to drink.",
        standing=0, decay=0.04,
        relations={"the_library": 0.2},
        ranks=[("dry", "Dry", -30), ("measured", "Measured", 0),
               ("allotted", "Allotted", 25), ("of_the_spring", "Of the Spring", 55)]),
]


# --- deeds ----------------------------------------------------------------
# `severity` is what a witness who identifies you costs. The asymmetry is
# deliberate throughout: it is easier to be remembered for the bad one.

DEED_KINDS = [
    deed_kind("under_kept", "Kept the Under", "the_ratcatchers", 12),
    deed_kind("under_sold", "Sold the Under to the Crown", "the_ratcatchers", -20,
              memorability=2.5, distortion=0.3),

    deed_kind("ledger_squared", "Squared the Ledger", "the_countinghouse", 12),
    deed_kind("ledger_cooked", "Cooked a Ledger", "the_countinghouse", -18,
              memorability=2.0, distortion=0.35),

    deed_kind("share_honoured", "Honoured a Share", "the_salvors", 14),
    deed_kind("wreck_informed", "Informed on a Wreck", "the_salvors", -22,
              memorability=3.0, distortion=0.2),

    deed_kind("line_ridden", "Rode the Line", "the_horse_lords", 12),
    deed_kind("horse_taken", "Took a Horse", "the_horse_lords", -20,
              memorability=2.5, distortion=0.25),

    deed_kind("vent_heeded", "Heeded the Vent", "the_vent_readers", 14),
    deed_kind("warning_ignored", "Went Down Anyway", "the_vent_readers", -12,
              memorability=1.5, distortion=0.3),

    deed_kind("channel_kept", "Kept a Channel", "the_ferrymen", 12),
    deed_kind("bell_rung", "Rang the Drowned Bell", "the_ferrymen", -16,
              memorability=3.0, distortion=0.1),

    deed_kind("cairn_set", "Set a Cairn", "the_ice_moot", 14, memorability=2.0),
    deed_kind("ice_broken", "Broke the Ice Moot's Word", "the_ice_moot", -20,
              memorability=2.5, distortion=0.15),

    deed_kind("beds_saved", "Saved the Beds", "the_pickers", 15, memorability=2.5),
    deed_kind("rot_spread", "Carried the Rot", "the_pickers", -22,
              memorability=3.0, distortion=0.2),

    deed_kind("spring_served", "Served the Spring", "the_water_wardens", 12),
    deed_kind("water_stolen", "Stole Water", "the_water_wardens", -18,
              memorability=2.0, distortion=0.25),
]
