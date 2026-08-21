"""The Rot — a Deeproads side chain, Act III."""
from dmkit.quests import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way, set_flag,
    rep, deed, either, node, option, take_job, dialogue, npc, shop,
)
from acts import chain, link, ACT_GATES
from dmkit.prose import pool

KEY = "rot"


NPCS = [
    npc("picker_kesk", "Kesk of the Beds",
        "Two hundred years of pickers before her held the line at the fifth "
        "gallery. She has been driven back to the second in one season and "
        "does the arithmetic out loud.",
        faction="the_pickers", dialogue_id="rot_kesk_talk",
        home="mycelt_the_beds", disposition=8, gullibility=0.3,
        memory_span=250, cares=["beds_saved", "rot_spread", "lantern_lit"],
        offers=["rot_the_second_gallery"],
        shop=shop("deep_stock", buys=("treasure", "material"), multiplier=1.15,
                  requires={"factions": [{"faction": "the_pickers",
                                          "minStanding": 10}]})),
]


POI_TRIGGERS = {
    "echo_halls_the_listening_room": [{
        "id": "rot_in_the_listening_room", "mode": "once", "on": "enter",
        "description": "Cut to hear the Long Hall, and hearing something else.",
        "effects": [{"setFlag": {"flag": "rot_listened", "value": True}}],
    }],
}


QUESTS = chain(KEY, [
    link("rot_the_second_gallery", "The Second Gallery",
         "Two hundred years of holding the line at the fifth. Kesk has been "
         "driven back to the second in a season and the beds she has left "
         "will not feed Lantern Deep past Highsun.",
         xp=90,
         stages=[
             stage("to_the_beds", "Down to Mycelt",
                   "Four hundred people, and every one of them growing what "
                   "nine hundred more eat.",
                   [reach("at_the_beds", "Reach the beds at Mycelt.",
                          "mycelt_the_beds")],
                   journal="rot_journal_beds"),
             stage("cut_it_back", "Cut it back",
                   "The Rot walks when it is thick enough, which the pickers "
                   "have known for two hundred years and never had to say to "
                   "an outsider before.",
                   [kill("the_horrors", "Cut the gallery back.",
                         "fungal_horror", count=2)],
                   on_complete=[set_flag("rot_gallery_cut")],
                   journal="rot_journal_cut"),
             stage("tell_kesk", "Tell Kesk",
                   "She will want the count, and she will do the arithmetic "
                   "in front of you.",
                   [talk("report", "Report to Kesk.", "picker_kesk")],
                   journal="rot_journal_report"),
         ],
         reputation={"the_pickers": 12},
         on_complete=[set_flag("rot_beds_seen")]),

    link("rot_the_listening_room", "The Listening Room",
         "The Rot is coming from somewhere and it is coming faster than it "
         "grows. The Echo Halls have a room cut to hear the whole length of "
         "the Long Hall, and nobody has sat in it in living memory.",
         [reach("in_the_room", "Get into the listening room.",
                "echo_halls_the_listening_room"),
          flagged("what_you_hear", "Hear what the room is for.",
                  "rot_listened"),
          talk("tell_kesk_again", "Take what you heard back to Kesk.",
               "picker_kesk")],
         xp=110, reputation={"the_pickers": 10, "the_wayfinders": 8},
         on_complete=[set_flag("rot_direction_known")]),

    link("rot_what_grows_mycelt", "What Grows Mycelt",
         "Not spreading. Being fed. Something up the fungus gallery has been "
         "growing the beds for two hundred years and has stopped being "
         "careful about the distinction.",
         xp=170,
         stages=[
             stage("up_the_gallery", "Up the fungus gallery",
                   "Past the pickers' camp, past the canopy, and past the "
                   "point where anybody has cut in two hundred years.",
                   [reach("at_the_rot", "Reach the Rot.",
                          "fungus_gallery_the_rot")],
                   journal="rot_journal_gallery"),
             stage("the_mother", "What has been growing it",
                   "Mycelt grows what the Deeproads eat. This grows Mycelt.",
                   [kill("kill_rot", "Put down the Rot.", "rot_mother")],
                   on_complete=[set_flag("rot_mother_down")],
                   journal="rot_journal_mother"),
         ],
         reputation={"the_pickers": 15}),

    link("rot_burn_it_or_farm_it", "Burn It or Farm It",
         "What is left of it will regrow, and the pickers have spent two "
         "hundred years learning exactly how to make that happen on purpose.",
         [flagged("burn_it_out", "Burn the gallery out for good.",
                  "rot_burnt", optional=True),
          flagged("farm_it", "Keep a cutting and grow the beds from it.",
                  "rot_farmed", optional=True),
          resolved_either_way("settled", "Settle what happens to the beds.",
                              ["rot_burnt", "rot_farmed"])],
         ordered=False, xp=130,
         items=[("sporeward_mask", 1)],
         on_complete=[
             either("rot_farmed",
                    [deed("beds_saved"), rep("the_pickers", 30),
                     rep("the_wayfinders", 15), set_flag("rot_beds_kept")],
                    [rep("the_pickers", -10), rep("the_wayfinders", 8),
                     rep("karn_dolur", 10), set_flag("rot_gallery_burnt")]),
         ]),
], act="act3", region="deeproads", giver="picker_kesk", level=6)


ARCS = [
    arc("the_rot", "The Rot",
        "Two hundred years of pickers holding a line at the fifth gallery, "
        "and one season that put them back to the second.",
        [q["id"] for q in QUESTS]),
]


DIALOGUES = [
    dialogue("rot_kesk_talk", "greet", [
        node("greet", [
            "The beds go up the gallery in terraces with lamps strung over "
            "them, and the top four terraces are dark. Kesk is at the edge of "
            "the light with a knife she has not put down. \"Mind the second. "
            "It's not ours any more.\"",
        ], redirects=[
            ({"flags": [{"flag": "rot_gallery_cut", "equals": True}]},
             "after_the_cut"),
            ({"quests": [{"quest": "rot_the_listening_room", "status": "active"}],
              "flags": [{"flag": "rot_listened", "equals": True}]},
             "about_the_room"),
            ({"flags": [{"flag": "rot_mother_down", "equals": True}],
              "without": {"flags": [{"flag": "rot_burnt"},
                                    {"flag": "rot_farmed"}]}},
             "burn_or_farm"),
        ], options=[
            take_job("the_dark_terraces", "Four of your terraces are dark.",
                     "rot_the_second_gallery", "the_arithmetic",
                     requires=ACT_GATES["act3"]),
            option("the_beds", "What grows down here?", goto="the_beds"),
            option("leave", "Nothing."),
        ]),

        node("the_beds", [
            "\"Cap, mostly. Lantern cap for the light and grey cap for the "
            "eating, and eleven other things nobody up top has a word for.\" "
            "She nods up the gallery. \"Nine hundred at Lantern Deep, four "
            "hundred here, every waystation on the Market Road. All of it off "
            "these terraces.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("the_arithmetic", [
            "\"Two hundred years we held the fifth gallery,\" says Kesk. "
            "\"My grandmother held the fifth. I held the fifth in the "
            "spring.\" She does not look up the terraces. \"I'm at the "
            "second.\"",
            "\"Which is the arithmetic,\" she says. \"Second gallery feeds "
            "four hundred. Lantern Deep is nine hundred. You can do the rest "
            "of it as well as I can and I have done it out loud twice today "
            "already.\"",
        ], options=[
            option("cut_it", "We'll cut the second back.", goto="the_walking"),
        ]),

        node("the_walking", [
            "\"Then know the thing we don't say to outsiders,\" says Kesk. "
            "\"When it's thick enough, it walks. Two hundred years we've "
            "known that and two hundred years we've kept it in the "
            "family.\" She hands you a knife. \"Cut low and cut wet.\"",
        ], options=[option("done", "Low and wet.")]),

        node("after_the_cut", [
            "Kesk counts what you brought back without being asked and does "
            "not like the number. \"That's not spreading,\" she says. \"That's "
            "*arriving*.\"",
        ], remembers="beds_saved", options=[
            option("difference", "What's the difference?", goto="fed",
                   once=True),
        ]),

        node("fed", [
            "\"Spreading is even. It goes out at the same rate in every "
            "direction because it's growing.\" She lays four caps on the "
            "boards in a line. \"This is heavier up-gallery and lighter "
            "down. That's not growing. That's being *fed* from one end.\"",
            "\"There's a room in the Echo Halls,\" she says. \"Cut to hear "
            "the whole length of the Long Hall. Nobody's sat in it in living "
            "memory because there's nothing to hear.\" A pause. \"Sit in it.\"",
        ], options=[
            take_job("go_listen", "We'll sit in it.", "rot_the_listening_room",
                     "sit_still"),
        ]),

        node("sit_still", [
            "\"Sit still and give it a full turn of the lamp,\" says Kesk. "
            "\"Whatever you hear, it'll be quiet and it'll be regular, and "
            "you'll want to have stopped listening before it gets loud "
            "enough to be sure of.\"",
        ], options=[option("done", "A full turn.")]),

        node("about_the_room", [
            "\"You sat.\" Kesk has the knife down for the first time. "
            "\"Which direction?\"",
        ], options=[
            option("up_gallery", "Up the fungus gallery. Past the canopy.",
                   goto="two_hundred_years", once=True),
        ]),

        node("two_hundred_years", [
            "\"Then it's been up there the whole time,\" says Kesk, \"and "
            "we've been cutting the *edge* of it for two hundred years and "
            "calling that holding a line.\"",
            "She picks the knife back up. \"Nobody's cut past the canopy since "
            "my grandmother's grandmother. There's a reason and I have never "
            "once been told what it is.\"",
        ], remembers="beds_saved", options=[
            take_job("go_up", "Then we'll find out.",
                     "rot_what_grows_mycelt", "past_the_canopy",
                     effects=[rep("the_pickers", 8)]),
        ]),

        node("past_the_canopy", [
            "\"Past the canopy the lamps stop and the air gets warm,\" says "
            "Kesk. \"Warm. Down here. Take the masks and do not take them "
            "off, whatever it smells like, and it will smell like bread.\"",
        ], options=[option("done", "Masks on.")]),

        node("burn_or_farm", [
            "Kesk has come up past the canopy herself, which no picker has "
            "done in four generations, and is standing in the warm looking at "
            "what is left. \"It'll regrow,\" she says. \"That's not a "
            "problem. That's the whole trade.\"",
            "\"We can burn the gallery. Properly, all of it, and the Rot is "
            "finished and so are the beds — every terrace on that slope came "
            "off this, whatever we've told ourselves.\" She turns a cutting "
            "over. \"Or I take a cutting and I grow it where I can see it, on "
            "the second, in the light, and the pickers spend the next two "
            "hundred years farming the thing they've been fighting.\"",
        ], options=[
            option("farm", "Take the cutting.", goto="farmed", once=True,
                   effects=[set_flag("rot_farmed")]),
            option("burn", "Burn it. All of it.", goto="burnt", once=True,
                   effects=[set_flag("rot_burnt")]),
        ]),

        node("farmed", [
            "She cuts it herself, wraps it wet, and carries it down past four "
            "dark terraces without saying anything to anybody. By Highsun "
            "there are lamps on the third again.",
        ], remembers="beds_saved", options=[option("done", "Grow it well.")]),

        node("burnt", [
            "It burns for nine days and the smoke goes up the gallery and out "
            "somewhere nobody has ever mapped. Lantern Deep eats off Karn "
            "Dolur's stores that season, at Karn Dolur's price, and says so.",
        ], remembers="rot_spread", options=[option("done", "It's finished.")]),
    ]),
]


pool("rot_journal_beds",
     "Terraces up the gallery with lamps strung over them, and the top four "
     "are dark.",
     "Nine hundred at Lantern Deep, four hundred here, and every waystation "
     "on the Market Road.",
     "Two hundred years they held the fifth. She is at the second.")

pool("rot_journal_cut",
     "Cut low and cut wet. It is the only instruction anybody gives.",
     "When it is thick enough it walks, which the pickers have kept in the "
     "family for two hundred years.",
     "Heavier up-gallery and lighter down, which is not how a thing grows.")

pool("rot_journal_report",
     "Back down to the light. Kesk will count it and do the arithmetic out "
     "loud.",
     "Second gallery feeds four hundred. Lantern Deep is nine hundred.",
     "That is not spreading. That is arriving.")

pool("rot_journal_gallery",
     "Past the pickers' camp, past the canopy, and past where anybody has cut "
     "in two hundred years.",
     "The lamps stop and the air gets warm. Warm, down here.",
     "Do not take the masks off, whatever it smells like, and it will smell "
     "like bread.")

pool("rot_journal_mother",
     "Mycelt grows what the Deeproads eat. This grows Mycelt.",
     "Two hundred years of cutting the edge of it and calling that holding a "
     "line.",
     "It has been patient about which of those two facts came first.")
