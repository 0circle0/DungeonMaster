"""Aurendel — who cares what you do."""
import sidefactions

MAIN_FACTIONS = [
    {
        "id": "the_crown",
        "name": "The Crown",
        "description": "Aurenhal, its wardens, and a very firm preference for "
                       "nothing alarming being written down.",
        "initialStanding": 0,
        "decayPerDay": 0.08,
        "relations": {"the_library": -0.4, "the_keepers": -0.25},
        "ranks": [
            {"id": "suspected", "name": "Suspected", "atLeast": -40},
            {"id": "tolerated", "name": "Tolerated", "atLeast": 0},
            {"id": "commissioned", "name": "Commissioned", "atLeast": 25},
            {"id": "kings_own", "name": "The King's Own", "atLeast": 60},
        ],
    },
    {
        "id": "the_library",
        "name": "The Grand Library",
        "description": "Scholars who hold that a thing unrecorded is a thing "
                       "lost, and who are not always careful about the cost.",
        "initialStanding": 0,
        "decayPerDay": 0.05,
        "relations": {"the_crown": -0.4},
        "ranks": [
            {"id": "unwelcome", "name": "Unwelcome", "atLeast": -40},
            {"id": "reader", "name": "Reader", "atLeast": 0},
            {"id": "fellow", "name": "Fellow", "atLeast": 25},
            {"id": "keyholder", "name": "Keyholder of the Fourth", "atLeast": 60},
        ],
    },
    {
        "id": "the_keepers",
        "name": "The Keepers",
        "description": "Cairn-tenders, the Elderhollow moot, the wardens of the "
                       "Sisters. Not an order and not a guild — a habit, kept "
                       "in eleven places by people who have never met.",
        "initialStanding": 5,
        "decayPerDay": 0.03,
        "relations": {"the_crown": -0.2, "karn_dolur": 0.3},
        "ranks": [
            {"id": "oathbreaker", "name": "Oathbreaker", "atLeast": -60},
            {"id": "watched", "name": "Watched", "atLeast": -20},
            {"id": "known", "name": "Known", "atLeast": 10},
            {"id": "trusted", "name": "Trusted with the Ways", "atLeast": 40},
        ],
    },
    {
        "id": "karn_dolur",
        "name": "The Hold of Karn Dolur",
        "description": "Nine hundred years of not opening the Deep Door, and a "
                       "ledger of every fee ever charged for the privilege of "
                       "not being let through it.",
        "initialStanding": 0,
        "decayPerDay": 0.04,
        "relations": {"the_keepers": 0.3, "the_wayfinders": 0.2},
        "ranks": [
            {"id": "barred", "name": "Barred", "atLeast": -50},
            {"id": "guest", "name": "Guest", "atLeast": 0},
            {"id": "hold_friend", "name": "Hold-Friend", "atLeast": 30},
            {"id": "deep_warrant", "name": "Bearer of a Deep Warrant", "atLeast": 55},
        ],
    },
    {
        "id": "the_wayfinders",
        "name": "The Wayfinders",
        "description": "Forty people at Lantern Deep who can get you from there "
                       "to Karn Dolur and back, and the number is not going up.",
        "initialStanding": 0,
        "decayPerDay": 0.06,
        "relations": {"karn_dolur": 0.2},
        "ranks": [
            {"id": "unguided", "name": "Unguided", "atLeast": -30},
            {"id": "hired", "name": "Hired", "atLeast": 10},
            {"id": "led", "name": "Led", "atLeast": 35},
        ],
    },
    {
        # No decay.
        "id": "the_unsealed",
        "name": "What Was Shut",
        "description": "Whatever the wards were built against. It has a side, "
                       "and the side is not yours.",
        "initialStanding": -40,
        "decayPerDay": 0,
        "relations": {},
        "ranks": [],
    },
]


# --- deeds: `severity` moves the named faction's standing ---

MAIN_DEED_KINDS = [
    {"id": "ward_restored", "name": "Restored a Ward", "faction": "the_keepers",
     "severity": 12, "memorability": 2.0, "distortion": 0.1},
    {"id": "ward_broken", "name": "Broke a Ward", "faction": "the_keepers",
     "severity": -18, "memorability": 2.5, "distortion": 0.15},
    {"id": "barrow_robbed", "name": "Robbed a Barrow", "faction": "the_keepers",
     "severity": -10, "memorability": 1.5, "distortion": 0.3},
    {"id": "crown_served", "name": "Served the Crown", "faction": "the_crown",
     "severity": 10, "memorability": 1.0, "distortion": 0.2},
    {"id": "crown_defied", "name": "Defied the Crown", "faction": "the_crown",
     "severity": -14, "memorability": 1.8, "distortion": 0.25},
    {"id": "library_served", "name": "Served the Library", "faction": "the_library",
     "severity": 10, "memorability": 1.0, "distortion": 0.2},
    {"id": "record_stolen", "name": "Stole from the Library", "faction": "the_library",
     "severity": -12, "memorability": 2.0, "distortion": 0.3},
    {"id": "deep_door_opened", "name": "Opened the Deep Door", "faction": "karn_dolur",
     "severity": -20, "memorability": 3.0, "distortion": 0.1},
    {"id": "hold_honoured", "name": "Honoured the Hold", "faction": "karn_dolur",
     "severity": 12, "memorability": 1.5, "distortion": 0.15},
    {"id": "lantern_lit", "name": "Lit the Great Lantern", "faction": "the_wayfinders",
     "severity": 25, "memorability": 4.0, "distortion": 0.05},
]


# --- and the nine the side chains brought with them ---

FACTIONS = MAIN_FACTIONS + sidefactions.FACTIONS
DEED_KINDS = MAIN_DEED_KINDS + sidefactions.DEED_KINDS


# --- how memory behaves in this world -----------------------------------

MEMORY = {
    "mode": "simulated",
    "forgetting": {
        "curve": "exponential",
        "halfLifeDays": 45,
        # Above zero on purpose: a broken ward is remembered, only unprovable.
        "floor": 0.04,
        "caresAboutMultiplier": 3,
        "memorabilityWeight": 1,
        "neverForget": ["ward_broken", "deep_door_opened"],
    },
    "gossip": {
        "enabled": True,
        "spreadPerDay": 0.2,
        "maxHops": 4,
        "hopRetention": 0.75,
        "distortionPerHop": 0.15,
        "requiresTravel": True,
        "crossFactionRate": 0.35,
        # A ward broken is severity 18 and travels; a barrow robbed is 10 and travels.
        "minimumSeverity": 8,
        "gullibilityScale": 2,
        "garbledRetention": 0.5,
    },
    "witness": {
        "radius": 0,
        "requiresLineOfSight": True,
        "deadMenTellNoTales": True,
        "identificationChance": 0.75,
        "disguiseReduction": 0.6,
        "factionAlwaysLearns": False,
    },
    "rules": [
        {
            "id": "keepers_never_forget_a_ward",
            "name": "The Keepers and the wards",
            "description": "Breaking a ward is the one thing the Keepers keep "
                           "properly. They will still know in ten years.",
            "deedKinds": ["ward_broken", "ward_restored"],
            "halfLifeDays": 3650,
            "alwaysKnownBy": ["moot_warden_hesk", "cairn_keeper_ulla"],
        },
        {
            "id": "the_crown_prefers_not_to_hear",
            "name": "Quietly, please",
            "description": "The under-steward's whole office exists to stop "
                           "this sort of thing spreading.",
            "deedKinds": ["ward_broken"],
            "spreadPerDay": 0.06,
        },
    ],
}
