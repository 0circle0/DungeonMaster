"""The Frostmere's hidden threads — three, in the five areas nothing else uses.

Whalebone Landing, the Rimewatch, the Bone Strand, the Glass Ice and the Wind-Scoured Flats were all
built and never mentioned by anything: four dungeons, a boneyard, a stone circle and a bearing
marker.

  * The Blue Voice — the ice under the calving face makes a note, and the whales stopped coming
    inside it. Findable cold; you will not get in without the tally.
  * The Count of the Strand — the boneyard has more skulls than the Landing has ever had ships, and
    the bone carver has known it for eleven years.
  * What the Marker Points At — the over-tuned one. A bearing marker on the Glass Ice points at
    nothing, and the Moulin at the end of the bearing is level 9 in a level 8 region. It is sealed,
    and the seal says why.

Nobody offers any of it.
"""
from dmkit.quests import npc, shop, quest, reach, kill, flagged, arc
from lore import (
    clue, thread, rumour, favour, talk, coldshoulder, finding, rumoured,
    trophy, keepsake, carried, relic, sealed, blocked,
)

REGION = "frostmere"


# --- what there is to know ------------------------------------------------

BLUE = [
    clue("frost_blue_calving",
         "Whales used to calve inside the face. They have not come inside it "
         "in eleven years, and they still come to the shore either side.",
         "a flenser, Whalebone Landing"),
    clue("frost_blue_note",
         "It is not a noise. It is a note — one note, the way a struck bowl "
         "goes on after you have stopped touching it.",
         "the bone carver"),
    clue("frost_blue_making",
         "It only sounds while the ice is making. In a thaw there is nothing "
         "down there at all, and men have gone in during a thaw and found out "
         "why that is no comfort.",
         "the watch hut's log"),
    clue("frost_blue_moved",
         "The Landing stood a mile further in, once. They moved the whole of "
         "it in a single winter and wrote down nothing about why.",
         "the factor's ledger"),
]

STRAND = [
    clue("frost_strand_count",
         "There are more skulls on the Strand than the Landing has ever had "
         "ships. Somebody has been counting for eleven years and the number "
         "keeps going the wrong way.",
         "the bone carver"),
    clue("frost_strand_cut",
         "Half of them are cut. Not flensed — cut, with something that went "
         "through bone in one stroke and left no chatter at the edge.",
         "a flenser, Whalebone Landing"),
    clue("frost_strand_inland",
         "They are facing inland. Every one of them. A whale that dies at sea "
         "does not arrive facing inland.",
         "the chapel's keeper"),
    clue("frost_strand_ribs",
         "The bones standing up out of the Strand are not one animal. They are "
         "the right shape from the water and the wrong shape from inside, and "
         "the difference is somebody's work.",
         "cut into the strand camp's door"),
]

MARKER = [
    clue("frost_marker_bearing",
         "The marker on the Glass Ice is a bearing, and the bearing has no "
         "cairn at the end of it. Every other marker on the Reach points at a "
         "cairn.",
         "a stone-setter's apprentice"),
    clue("frost_marker_older",
         "It was cut before the moot kept records, which is a way of saying "
         "nobody alive knows who set it or what they were pointing at.",
         "the Ice Chapel"),
    clue("frost_marker_down",
         "It does not point across. Stand where the cutter stood and it points "
         "*down*, and there is only one hole in the Glass Ice.",
         "the Rimewatch keeper"),
    clue("frost_marker_shut",
         "Whatever is at the bottom was shut in, not shut out. The stonework "
         "faces the wrong way to be keeping anything from getting down.",
         "the stone rows on the Flats"),
]

LORE = BLUE + STRAND + MARKER

THREADS = [
    thread("frost_blue", "The Blue Voice",
           "Something under the calving face has been sounding one note for "
           "eleven years, and the whales understood it before anybody else "
           "started listening.", BLUE),
    thread("frost_strand", "The Count of the Strand",
           "The boneyard has been growing faster than the fleet can explain, "
           "and one man has the tally.", STRAND),
    thread("frost_marker", "What the Marker Points At",
           "A bearing cut before the moot kept records, aimed at no cairn, "
           "and not aimed across.", MARKER),
]


# --- things ---------------------------------------------------------------

ITEMS = [
    keepsake("makers_tally", "The Maker's Tally",
             "A bone stick notched on both edges: one side the nights the ice "
             "made, the other the nights it sounded. The two edges agree.",
             holder="ice_reader_saeun"),
    keepsake("carvers_count", "The Carver's Count",
             "Eleven years of skulls, in a hand that got smaller each year as "
             "the columns got wider.",
             holder="bone_carver_thrand"),
    keepsake("cutters_stone", "The Cutter's Stone",
             "A palm of worked granite with a slot down it. Sighted through, "
             "the marker on the Glass Ice stops being a bearing across and "
             "becomes a bearing down.",
             holder="rimewatch_keeper_hallr"),

    trophy("blue_bell_shard", "A Shard of the Blue Bell",
           "Cold that does not warm in the hand, and it will not stop ringing "
           "if you set it down.", "frost_blue_note"),

    relic("rime_singers_torc", "The Rime-Singer's Torc", "ring",
          "Bronze gone green under nine hundred years of ice. Worn, the note "
          "under the calving face resolves into something with edges — and so "
          "does every other thing that has been trying not to be heard.",
          value=900, rarity="very_rare",
          skills={"perception": 3, "insight": 2}, initiative=2),
    relic("strandwardens_coat", "The Strand-Warden's Coat", "cloak",
          "Sealskin with the fur turned in and a lining of something else. "
          "Whatever cut the skulls on the Strand cut this too, once, and did "
          "not get through.",
          value=750, rarity="rare", guard=2,
          resist=(("cold", 0.5), ("slashing", 0.75))),
    relic("moulin_lamp", "The Lamp from the Moulin", "belt",
          "It was lit when they shut the door on it, and it was still lit when "
          "the door came open. Nobody has been able to put it out.",
          value=1100, rarity="very_rare",
          skills={"survival": 2, "resolve": 2}, carry=2),
]

LOOT_TABLES = [
    carried("frost_tally_carried", "What Saeun Kept", "makers_tally"),
    carried("frost_count_carried", "What Thrand Kept", "carvers_count"),
    carried("frost_stone_carried", "What Hallr Kept", "cutters_stone"),
]


# --- doors ----------------------------------------------------------------

GATES = [
    sealed("frost_blue_inner", "The Making Gallery",
           "The passage past the first chamber is open on the nights the ice "
           "makes and shut on every other night, and it is not the ice that "
           "shuts it.",
           blocked("frost_blue_blocked",
                   "The passage is closed. Not frozen — closed, and the seam "
                   "is dry. You would have to know which nights it opens, and "
                   "somebody spent forty years finding that out.",
                   "It is shut, and the cold coming off the seam has nothing "
                   "to do with the weather. Whoever kept the making-nights "
                   "kept them for a reason.",
                   "No handhold, no hinge, and no frost on it. Whatever opens "
                   "this opens on a schedule, and the schedule is written "
                   "down somewhere in the Landing.",
                   "The seam runs floor to roof and does not admit a blade. "
                   "You are not going to force a thing that has been opening "
                   "and shutting on its own for nine hundred years."),
           items=["makers_tally"], opens_flag="frost_blue_open"),

    sealed("frost_ribcage_inner", "Inside the Wrong Shape",
           "From the shore it is a ribcage. From in here it is a room, and the "
           "room has a door in it.",
           blocked("frost_ribcage_blocked",
                   "The door in the ribcage has a count cut into it — years, "
                   "and a number under each. You would need the other half of "
                   "that tally to know what it is asking for.",
                   "Eleven columns, and the last four in a smaller hand. "
                   "Somebody out there has been keeping the same book.",
                   "It is a tally, and it is only half of one. The door is "
                   "waiting to be told a number it already knows."),
           items=["carvers_count"], opens_flag="frost_strand_open"),

    # The over-tuned one. Level 9 in a level 8 region, and the seal is why a party that stumbled on
    # it does not walk in and die.
    sealed("frost_moulin_seal", "The Seal on the Moulin",
           "Stonework at the lip of the hole, facing inward. Whatever this was "
           "built for, it was not built to keep anybody out.",
           blocked("frost_moulin_blocked",
                   "The seal reads from the inside, and reading it from out "
                   "here is the wrong way round. You would need the cutter's "
                   "sighting stone — and, going by the burn on the rim, "
                   "whatever it was on the Strand that took an edge like that "
                   "and did not let it through.",
                   "The stone is cut to be understood by whatever is below it. "
                   "Sighted properly it might make sense; unsighted, and "
                   "unprepared for the cold coming up, it is a hole.",
                   "Air comes up out of it that is colder than the air on the "
                   "ice, which is not a thing air does. Going down dressed "
                   "for the Reach would be going down dressed for the wrong "
                   "place entirely.",
                   "Nine hundred years of stonework, every face of it turned "
                   "in. You would want to be very sure of your reading before "
                   "you took the word of a door that was built to be read by "
                   "the thing behind it."),
           items=["cutters_stone", "strandwardens_coat"],
           opens_flag="frost_moulin_open"),
]


# --- the places themselves ------------------------------------------------

POI_PATCHES = {
    # Findable knowing nothing, at 22 — a party that searches the shore turns it up eventually.
    # Knowing the thread, 10. The clues never say where it is.
    "rimewatch_blue_caves": rumoured("frost_blue", base=22, step=3, entries=4),
    "bone_strand_ribcage": rumoured("frost_strand", base=20, step=3, entries=4),
    "glass_ice_the_moulin": rumoured("frost_marker", base=24, step=4, entries=4,
                                     skill="survival"),
    # Sealed, once found.
    "rimewatch_blue_caves_gate": {},
}

# The gates hang off the mouths, applied by `story.attach_patches`.
POI_PATCHES["rimewatch_blue_caves"]["gate"] = "frost_blue_inner"
POI_PATCHES["bone_strand_ribcage"]["gate"] = "frost_ribcage_inner"
POI_PATCHES["glass_ice_the_moulin"]["gate"] = "frost_moulin_seal"
del POI_PATCHES["rimewatch_blue_caves_gate"]

POI_TRIGGERS = {
    "rimewatch_calving_face": [finding(
        "frost_found_calving",
        "Water that should have whales in it, and does not.",
        "frost_blue_calving")],
    "bone_strand_the_boneyard": [finding(
        "frost_found_boneyard",
        "Which way they are all facing.",
        "frost_strand_inland")],
    "glass_ice_marker": [finding(
        "frost_found_marker",
        "A bearing with no cairn at the end of it.",
        "frost_marker_bearing")],
    "wind_flats_stone_rows": [finding(
        "frost_found_rows",
        "Stonework that faces the wrong way to be keeping anything out.",
        "frost_marker_shut")],
    "bone_strand_camp": [finding(
        "frost_found_camp_door",
        "What somebody cut into the camp door, and then left.",
        "frost_strand_ribs")],

    # Reaching an anchor with the thread in hand is the commitment: the quest starts here and only
    # here. Nobody offers it and nothing announces it.
    "rimewatch_blue_caves": [{
        "id": "frost_blue_committed", "mode": "once", "on": "enter",
        "description": "Standing at the mouth of it, knowing what it is.",
        "requires": {"custom": {"gte": [{"ref": "threads.frost_blue.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "frost_the_blue_voice"}}}],
    }],
    "bone_strand_ribcage": [{
        "id": "frost_strand_committed", "mode": "once", "on": "enter",
        "description": "The wrong shape, from close enough to see it.",
        "requires": {"custom": {"gte": [{"ref": "threads.frost_strand.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "frost_the_count"}}}],
    }],
    "glass_ice_the_moulin": [{
        "id": "frost_marker_committed", "mode": "once", "on": "enter",
        "description": "The hole the bearing was pointing at.",
        "requires": {"custom": {"gte": [{"ref": "threads.frost_marker.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "frost_what_it_points_at"}}}],
    }],
}

BOSSES = {
    "frostmere_blue_caves": "frost_blue_boss",
    "frostmere_ribcage": "frost_ribcage_boss",
    "frostmere_moulin": "frost_moulin_boss",
    # Not a thread's anchor, but its boss room ships `alwaysEncounter` with nothing to draw from.
    "frostmere_under_pavement": "frost_pavement_boss",
    "frostmere_first_cairn": "frost_cairn_boss",
}


# --- the quests, which nobody gives you -----------------------------------

def _hidden(qid, name, description, objectives, *, xp, items=(), thread_key=None,
            stages=None):
    """A quest with no giver, started by arriving somewhere with a thread in hand.

    `hidden` objectives throughout: the journal shows the quest and that something is expected, and
    does not lay out the steps. The engine reveals each one as it completes.
    """
    return quest(qid, name, description, objectives, xp=xp, items=items,
                 stages=stages or [],
                 tags=["hidden", REGION] + ([thread_key] if thread_key else []))


QUESTS = [
    _hidden("frost_the_blue_voice", "The Blue Voice",
            "Something under the calving face has been sounding one note for "
            "eleven years. You are close enough now to hear it without the ice "
            "in the way.",
            [reach("at_the_caves", "Get inside the Blue Caves.",
                   "rimewatch_blue_caves", hidden=True),
             flagged("past_the_seam", "Get past the seam that is not frozen.",
                     "frost_blue_open", hidden=True),
             kill("silence_it", "Find the thing that will not stop ringing.",
                  "blue_bell", hidden=True)],
            xp=180, items=[("rime_singers_torc", 1)], thread_key="frost_blue"),

    _hidden("frost_the_count", "The Count of the Strand",
            "Eleven years of skulls arriving facing the wrong way, and a "
            "ribcage on the shore that is the right shape only from a "
            "distance.",
            [reach("at_the_ribs", "Get inside the Ribcage.",
                   "bone_strand_ribcage", hidden=True),
             flagged("past_the_count", "Answer what the door is asking for.",
                     "frost_strand_open", hidden=True),
             kill("the_cutter", "Find what has been doing the cutting.",
                  "strand_cutter", hidden=True)],
            xp=170, items=[("strandwardens_coat", 1)], thread_key="frost_strand"),

    _hidden("frost_what_it_points_at", "What the Marker Points At",
            "A bearing cut before the moot kept records, pointing down, at a "
            "hole with stonework around it that faces inward.",
            [reach("at_the_moulin", "Get down the Moulin.",
                   "glass_ice_the_moulin", hidden=True),
             flagged("past_the_seal", "Read the seal from the side it was cut "
                     "for.", "frost_moulin_open", hidden=True),
             kill("what_was_shut_in", "Meet what the seal was written for.",
                  "moulin_keeper", hidden=True)],
            xp=240, items=[("moulin_lamp", 1)], thread_key="frost_marker"),
]

ARCS = [
    arc("frost_hidden", "The Frostmere, Unaccounted",
        "Three things the Landing has known about for years and never once "
        "written down.",
        [q["id"] for q in QUESTS]),
]


# --- the people who know ---------------------------------------------------

NPCS = [
    npc("ice_reader_saeun", "Saeun, who Reads the Making",
        "Sits at the end of the Landing with a bone stick and marks it when "
        "the ice makes. Forty years of that. Nobody has ever asked her why.",
        faction="the_ice_moot", dialogue_id="frost_saeun_talk",
        home="whalebone_the_landing", disposition=4, gullibility=0.2,
        memory_span=365, statblock="frost_reader",
        cares=["cairn_set", "ice_broken"]),

    npc("bone_carver_thrand", "Thrand, Bone Carver",
        "Cuts scrimshaw for the ships and has been counting the Strand for "
        "eleven years in a book he does not show people.",
        faction="the_ice_moot", dialogue_id="frost_thrand_talk",
        home="whalebone_bone_carver", disposition=0, gullibility=0.3,
        memory_span=200, statblock="frost_carver",
        shop=shop("keeper_stock", buys=("treasure", "material"), multiplier=1.25)),

    npc("rimewatch_keeper_hallr", "Hallr of the Rimewatch",
        "Keeps a hut, a log and a sighting stone at the calving face, and is "
        "extremely clear that he keeps them for the moot and not for you.",
        faction="the_ice_moot", dialogue_id="frost_hallr_talk",
        home="rimewatch_watch_hut", disposition=-4, gullibility=0.15,
        memory_span=365, statblock="frost_keeper",
        cares=["ice_broken", "cairn_set"]),

    npc("flenser_gudny", "Gudny, at the Flensing Yard",
        "Twenty-two seasons on the yard and the only one left who worked the "
        "old landing before they moved it.",
        faction="the_ice_moot", dialogue_id="frost_gudny_talk",
        home="whalebone_flensing_yard", disposition=6, gullibility=0.4,
        memory_span=150),

    npc("chapel_keeper_orma", "Orma, at the Ice Chapel",
        "Keeps a chapel nobody attends in a town that buries at sea, and has "
        "opinions about which way a thing is facing when it arrives.",
        faction="the_keepers", dialogue_id="frost_orma_talk",
        home="whalebone_chapel", disposition=8, gullibility=0.35,
        memory_span=200, cares=["ward_restored", "ward_broken"]),

    npc("strand_picker_vigdis", "Vigdis, at the Strand Camp",
        "Works the boneyard for what the Landing will buy and sleeps out "
        "there, which nobody else in the Frostmere will do.",
        faction="the_ice_moot", dialogue_id="frost_vigdis_talk",
        home="bone_strand_camp", disposition=2, gullibility=0.45,
        memory_span=120),

    npc("factor_ingimund", "Ingimund, the Factor",
        "Holds the Landing's ledgers back to the move and would very much "
        "rather discuss this season's oil price.",
        faction="the_countinghouse", dialogue_id="frost_ingimund_talk",
        home="whalebone_house_b", disposition=0, gullibility=0.2,
        memory_span=300,
        shop=shop("countinghouse_stock", buys=("treasure",), multiplier=1.4)),
]


# --- conversation ----------------------------------------------------------
#
# Every clue here is behind a roll whose difficulty moves with what the Ice Moot thinks of you, and
# no clue is behind a standing floor. A party that has spent the game breaking wards finds Saeun
# hard work and Hallr nearly impossible, and can still, at -40, take the sighting stone off him.

MOOT = "the_ice_moot"

_saeun = [
    rumour("frost_saeun_note",
           "What is it you are actually listening for out there?",
           "“A note.” She does not look up from the stick. “Not a noise. A "
           "note — one, the way a struck bowl goes on after you have taken "
           "your hand off it.” She marks the edge. “Forty years. It has not "
           "changed pitch once.”",
           "frost_blue_note", faction=MOOT, base=13, skill="insight"),
    rumour("frost_saeun_making",
           "Does it sound every night?",
           "“Only while the ice is making.” She turns the stick over so you "
           "can see the other edge, and the two rows of notches line up the "
           "whole way down. “In a thaw there is nothing there. Two men went in "
           "during a thaw to find out why that was such a comfort.” A pause. "
           "“It was not a comfort.”",
           "frost_blue_making", faction=MOOT, base=15),
]
_saeun.append(favour(
    "frost_saeun_tally",
    "I need the tally itself. Not what it says — the stick.",
    "She is quiet for long enough that you think she has refused. Then she "
    "holds it out flat on both palms, the way you hand somebody a tool rather "
    "than a keepsake. “Forty years. Bring it back or do not, but do not lose "
    "it out there thinking it is a stick.”",
    "makers_tally", faction=MOOT, base=17, skill="persuasion", cost=3,
    refused="Her hand closes over it. “No. You want to know which nights it "
            "opens. I want to still be here when it does.”"))

DIALOGUES = [
    talk("frost_saeun_talk", "greet",
         ["She is sitting on a hauled-up boat at the end of the Landing with a "
          "bone stick across her knees, marking it. She does not stop.",
          "“Making tonight,” she says, before you have said anything. “You can "
          "hear it if you stop walking.”"],
         _saeun,
         redirects=[coldshoulder(
             "frost_saeun", MOOT, -35,
             "She looks at you once, the way you look at weather, and turns "
             "the stick face down on her knee.",
             back="greet")[0]],
         extra_nodes=[coldshoulder(
             "frost_saeun", MOOT, -35,
             "She looks at you once, the way you look at weather, and turns "
             "the stick face down on her knee.",
             back="greet")[1]]),
]

_thrand = [
    rumour("frost_thrand_count",
           "How many skulls are on the Strand?",
           "The chisel stops. “More than this Landing has ever had ships,” he "
           "says, to the scrimshaw rather than to you. “I started counting to "
           "prove to myself I was wrong about that. Eleven years. I am not "
           "wrong about that.”",
           "frost_strand_count", faction=MOOT, base=14, skill="insight"),
    rumour("frost_thrand_note",
           "You work bone all day. What is the sound off the face?",
           "“A note,” he says at once, as though he has been waiting years for "
           "somebody to use the right word. “Everyone here calls it a noise. "
           "It is a note. I have matched it on the saw and it does not shift.”",
           "frost_blue_note", faction=MOOT, base=12, skill="insight"),
    rumour("frost_thrand_ribs",
           "Those bones standing out of the Strand — is that one animal?",
           "He laughs without any pleasure in it. “It is the right shape from "
           "the shore. Go and stand inside it.” He goes back to the chisel. "
           "“Whoever set those out knew exactly what it would look like from "
           "the water, which is a strange thing to care about if you are dead.”",
           "frost_strand_ribs", faction=MOOT, base=15),
]
_thrand.append(favour(
    "frost_thrand_book",
    "Let me take the count. The whole book.",
    "He does not hand it over so much as put it down between you and step "
    "back from it. “Eleven years. The last four are in a smaller hand because "
    "the columns got wider.” He will not look at it. “Somebody else can be "
    "right about this for a while.”",
    "carvers_count", faction=MOOT, base=15, cost=2,
    refused="“No.” He puts his hand flat on the book. “It is the only thing I "
            "have that says I have not been imagining it.”"))

DIALOGUES.append(
    talk("frost_thrand_talk", "greet",
         ["A shed that smells of hot bone. He is cutting a whaling scene into "
          "a jaw plate and does not stop for you.",
          "“Scrimshaw's a season out. Oil's at the store. Whatever else you "
          "want, ask it while I'm working.”"],
         _thrand,
         redirects=[coldshoulder(
             "frost_thrand", MOOT, -30,
             "He puts the chisel down, which is worse than if he had not. "
             "“I know what you have been doing. Get out of my shed.”")[0]],
         extra_nodes=[coldshoulder(
             "frost_thrand", MOOT, -30,
             "He puts the chisel down, which is worse than if he had not. "
             "“I know what you have been doing. Get out of my shed.”")[1]]))

_hallr = [
    rumour("frost_hallr_down",
           "The marker on the Glass Ice. What is it pointing at?",
           "“Nothing. That is the trouble with it.” He shifts, and decides to "
           "say the rest. “Every marker on the Reach points at a cairn. That "
           "one points at open ice. Stand where the cutter stood, though — "
           "properly, with your eye where his was — and it is not pointing "
           "across at all.”",
           "frost_marker_down", faction=MOOT, base=16, skill="persuasion"),
    rumour("frost_hallr_making",
           "Your log. Does the sound keep to a season?",
           "He turns the log round rather than reading it to you. The column "
           "is forty years deep and there are gaps in it, and the gaps are "
           "every thaw. “It does not keep to a season. It keeps to the ice.”",
           "frost_blue_making", faction=MOOT, base=15, skill="insight"),
]
_hallr.append(favour(
    "frost_hallr_stone",
    "The sighting stone. I need to stand where he stood.",
    "He weighs it, and you can see him decide that a stone which has told "
    "nobody anything in nine hundred years is not doing the moot much good in "
    "his pocket. “Sight it at the marker. Not at the hole — at the marker. The "
    "hole is what happens after.”",
    "cutters_stone", faction=MOOT, base=18, cost=3,
    refused="“It is the moot's,” he says, and does not elaborate, and does not "
            "move his hand."))

DIALOGUES.append(
    talk("frost_hallr_talk", "greet",
         ["A hut with one window facing the calving face and a log open on the "
          "sill. He puts his body between you and it without appearing to.",
          "“Rimewatch. I keep it for the moot.” A pause exactly long enough to "
          "be rude. “Not for the Landing, and not for you.”"],
         _hallr,
         redirects=[coldshoulder(
             "frost_hallr", MOOT, -25,
             "He shuts the log, and then the shutter, and you are looking at a "
             "hut.")[0]],
         extra_nodes=[coldshoulder(
             "frost_hallr", MOOT, -25,
             "He shuts the log, and then the shutter, and you are looking at a "
             "hut.")[1]]))

DIALOGUES.append(
    talk("frost_gudny_talk", "greet",
         ["Elbow-deep in a flensing trough, and cheerful about it in a way "
          "that suggests she has been doing it long enough to have stopped "
          "noticing.",
          "“Mind the deck, it's slick the whole length. Twenty-two seasons and "
          "I still go over on it.”"],
         [rumour("frost_gudny_calving",
                 "Do the whales still calve inside the face?",
                 "“No.” She straightens up. “And they used to — I worked it. "
                 "Eleven years since one came inside. They still come to the "
                 "shore either side of it, mind, which is the part that keeps "
                 "me up. It is not the shore they are avoiding.”",
                 "frost_blue_calving", faction=MOOT, base=10),
          rumour("frost_gudny_cut",
                 "Half the skulls on the Strand are cut. What cuts like that?",
                 "“Not a flensing iron.” She holds hers up. “This chatters. "
                 "Every blade chatters, that is what bone does to a blade. "
                 "Those went through in one and the edge is clean.” She looks "
                 "at it a moment. “Nothing I have ever been sold does that.”",
                 "frost_strand_cut", faction=MOOT, base=12),
          rumour("frost_gudny_moved",
                 "Somebody said the Landing used to stand further in.",
                 "“A mile in, and they shifted the whole of it in one winter. "
                 "My grandmother's winter.” She goes back to the trough. “Ask "
                 "the factor for the why. There is no why in the ledger, I "
                 "have looked, and a thing with no why in a ledger is a thing "
                 "somebody decided not to write down.”",
                 "frost_blue_moved", faction=MOOT, base=13)]))

DIALOGUES.append(
    talk("frost_orma_talk", "greet",
         ["A chapel with room for forty and nobody in it, in a town that "
          "buries at sea.",
          "“You will be the first this month,” she says, without reproach. "
          "“Sit if you like. Nobody will mind.”"],
         [rumour("frost_orma_inland",
                 "The skulls on the Strand. Have you looked at how they lie?",
                 "“Every one of them facing inland.” She says it the way you "
                 "say a thing you have said before and been thanked for "
                 "leaving alone. “A whale that dies at sea arrives however the "
                 "water leaves it. These have been *arranged*, or they came "
                 "ashore under their own arrangement, and I do not know which "
                 "of those I would rather.”",
                 "frost_strand_inland", faction="the_keepers", base=11),
          rumour("frost_orma_older",
                 "There is a marker out on the Glass Ice with no cairn at the "
                 "end of it.",
                 "“Cut before the moot kept records.” She nods slowly. “Which "
                 "is a polite way of saying nobody alive knows who set it, or "
                 "what they were pointing at, or whether they were pointing at "
                 "it to find it again or to warn somebody off it.”",
                 "frost_marker_older", faction="the_keepers", base=13,
                 skill="insight")]))

DIALOGUES.append(
    talk("frost_ingimund_talk", "greet",
         ["Ledgers to the ceiling and a very small stove. He has the look of a "
          "man who has priced you already.",
          "“Oil is up. Bone is down. If it is neither of those, be brief.”"],
         [rumour("frost_ingimund_moved",
                 "Why was the Landing moved?",
                 "He does not go and fetch the book; he knows the page. “One "
                 "winter, the whole station, a mile out to here. Eleven "
                 "buildings.” He taps the desk once. “There is a cost for the "
                 "move and a cost for the timber and a cost for the men. There "
                 "is no *reason*. I have kept these ledgers for thirty years "
                 "and it is the only entry in them with no reason.”",
                 "frost_blue_moved", faction="the_countinghouse", base=14,
                 skill="persuasion"),
          rumour("frost_ingimund_count",
                 "How many ships has this Landing ever had?",
                 "“Since the move? Forty-one keels, of which nine were lost.” "
                 "He says it instantly. “Why — has somebody been counting "
                 "skulls at you?” He returns to the column. “Thrand has been "
                 "counting skulls at people for eleven years. The trouble is "
                 "that his arithmetic is sound.”",
                 "frost_strand_count", faction="the_countinghouse", base=12,
                 skill="insight")]))


# --- what is down there ----------------------------------------------------
#
# Three anchors, three ends, and five boss tables — the last two for `frostmere_under_pavement` and
# `frostmere_first_cairn`, which no thread uses but which ship a boss room carrying
# `alwaysEncounter` and nothing to draw from.
#
# The three clue-holders get statblocks of their own rather than a shared one: `dropDeathLoot`
# resolves what a corpse leaves through `corpse.statblock`, so a shared statblock would have every
# reader in the Frostmere dropping the tally.

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402
from dmkit.loot import group, encounters  # noqa: E402

_HUMAN = dict(creature_type="humanoid", faction="the_ice_moot")

MONSTERS = [
    creature("frost_reader", "Saeun, who Reads the Making", 5, 0,
             A(9, 11, 12, 13, 16, 12), ["strike"],
             "Forty years of sitting still in the cold, which is its own kind "
             "of hardiness.",
             descriptors=["a weathered"], loot="frost_tally_carried",
             hp=26, **_HUMAN),
    creature("frost_carver", "Thrand, Bone Carver", 5, 0,
             A(13, 13, 13, 12, 12, 10), ["strike", "cut_and_run"],
             "Cuts bone all day and has the shoulders for it.",
             descriptors=["a thickset"], loot="frost_count_carried",
             hp=32, **_HUMAN),
    creature("frost_keeper", "Hallr of the Rimewatch", 6, 0,
             A(14, 12, 14, 11, 14, 11), ["strike", "guarded_stance"],
             "Keeps a hut on a calving face alone, which selects for a "
             "particular sort of person.",
             descriptors=["a hard-faced"], loot="frost_stone_carried",
             hp=40, **_HUMAN),

    creature("blue_bell", "The Blue Bell", 9, 900,
             A(10, 8, 20, 14, 18, 16), ["rime_touch", "calving", "wither"],
             "It is not shaped like anything. It has been sounding one note "
             "since before the Landing was moved, and the note is what is "
             "wrong with the water.",
             behaviour=[{"priority": 20, "use": "calving",
                         "when": {"chance": 0.35}},
                        {"priority": 10, "use": "wither"},
                        {"priority": 0, "use": "rime_touch"}],
             descriptors=["a ringing", "a sounding"],
             loot="frost_blue_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned", "prone"], hp=110),

    creature("strand_cutter", "The Cutter", 8, 750,
             A(18, 15, 15, 9, 15, 8), ["rend", "cut_and_run", "gore"],
             "Whatever went through those skulls in one stroke, and it has not "
             "put the edge down since.",
             behaviour=[{"priority": 15, "use": "cut_and_run",
                         "when": {"chance": 0.4}},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a long-armed", "a patient"],
             loot="frost_strand_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened"], hp=88),

    creature("moulin_keeper", "What the Seal Was Written For", 10, 1400,
             A(19, 13, 19, 16, 17, 17),
             ["unmaking_word", "rime_touch", "grave_chill", "call_the_shut"],
             "The stonework at the lip faces inward. Nine hundred years of "
             "somebody being extremely clear about which side of it they meant "
             "to be on.",
             behaviour=[{"priority": 30, "use": "unmaking_word",
                         "when": {"chance": 0.25}},
                        {"priority": 20, "use": "call_the_shut",
                         "when": {"chance": 0.3}},
                        {"priority": 10, "use": "grave_chill"},
                        {"priority": 0, "use": "rime_touch"}],
             descriptors=["a lamplit", "a still"],
             loot="frost_moulin_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned", "prone", "silenced"], hp=150),

    creature("pavement_walker", "Something Under the Pavement", 9, 800,
             A(17, 12, 18, 8, 14, 9), ["stone_fist", "rime_touch"],
             "The Flats are flagged for two miles and nobody laid them.",
             descriptors=["a grinding", "a slab-backed"],
             loot="frost_strand_hoard", immunities=["frightened", "prone"],
             hp=95),
    creature("first_cairn_shade", "What Was Set Under the First", 8, 700,
             A(14, 16, 14, 13, 16, 15), ["grave_chill", "wither"],
             "The moot counts from the Last Cairn and buries under the first, "
             "and does not discuss the difference.",
             descriptors=["a thin", "a counting"],
             loot="frost_blue_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned"], hp=80),
]

ENCOUNTER_TABLES = [
    encounters("frost_blue_boss",
               [group("bell", [("blue_bell", "1", False)])],
               chance=1, empty=0),
    encounters("frost_ribcage_boss",
               [group("cutter", [("strand_cutter", "1", False)])],
               chance=1, empty=0),
    encounters("frost_moulin_boss",
               [group("keeper", [("moulin_keeper", "1", False)])],
               chance=1, empty=0),
    encounters("frost_pavement_boss",
               [group("walker", [("pavement_walker", "1", False)])],
               chance=1, empty=0),
    encounters("frost_cairn_boss",
               [group("shade", [("first_cairn_shade", "1d2", True)])],
               chance=1, empty=0),
]

LOOT_TABLES += [
    {"id": "frost_blue_hoard", "name": "Under the Calving Face", "rolls": "2",
     "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [
         {"weight": 3, "value": {"item": "old_coin", "quantity": "3d6"}},
         {"weight": 2, "value": {"item": "wight_ash", "quantity": "1d3"}},
         {"weight": 1, "value": {"item": "blue_bell_shard", "quantity": "1",
                                 "unique": True}},
     ]},
    {"id": "frost_strand_hoard", "name": "Inside the Wrong Shape", "rolls": "2",
     "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [
         {"weight": 4, "value": {"item": "old_coin", "quantity": "2d6"}},
         {"weight": 2, "value": {"item": "amber_lump", "quantity": "1"}},
         {"weight": 1, "value": {"item": "silvered_blade", "quantity": "1"}},
     ]},
    {"id": "frost_moulin_hoard", "name": "What the Lamp Lit", "rolls": "3",
     "emptyChance": 0, "bonusRollSkill": "lore",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [
         {"weight": 3, "value": {"item": "old_coin", "quantity": "4d6"}},
         {"weight": 2, "value": {"item": "barrow_torc", "quantity": "1"}},
         {"weight": 2, "value": {"item": "warded_coat", "quantity": "1"}},
     ]},
]


# Vigdis lives on the Strand rather than in the Landing: a thread every one of whose tellers is in
# the same room dies with one missed conversation, and `check_quests.py` counts the areas.
DIALOGUES.append(
    talk("frost_vigdis_talk", "greet",
         ["A tarpaulin, a fire that is mostly smoke, and a woman sorting bone "
          "into three piles by some system of her own.",
          "“Buying or looking? Looking's free. Standing where I'm sorting "
          "isn't.”"],
         [rumour("frost_vigdis_cut",
                 "These have been cut. What does that out here?",
                 "She holds one up without being asked twice — she has clearly "
                 "wanted somebody to look at it. “One stroke. No chatter, no "
                 "saw marks, no wedge. I have taken bone apart for nine years "
                 "and I could not do that with anything I own.” She puts it "
                 "back on the pile. “The Landing says ice. Ice does not do "
                 "that either.”",
                 "frost_strand_cut", faction=MOOT, base=11),
          rumour("frost_vigdis_inland",
                 "They are all lying the same way round.",
                 "“Facing in. Every one, and I have moved a lot of them.” She "
                 "is quiet a moment. “I stopped turning them back after the "
                 "first winter. They were facing in again by the spring and I "
                 "would rather not know how.”",
                 "frost_strand_inland", faction=MOOT, base=12),
          rumour("frost_vigdis_ribs",
                 "Those bones standing out of the Strand. You sleep next to them.",
                 "“I sleep with my back to it.” She says it flatly, without "
                 "any appetite for the joke. “From out here it is a whale. Go "
                 "and stand inside and count the uprights, and then tell me "
                 "what whale that is.”",
                 "frost_strand_ribs", faction=MOOT, base=13)]))
