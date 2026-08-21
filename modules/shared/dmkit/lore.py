"""Hidden threads — content nobody hands you, and the rules it keeps."""
import collections

from dmkit.items import gear
from dmkit.prose import pool

# The player-facing English these constructors would otherwise have to invent.
Voice = collections.namedtuple("Voice", [
    "go_on",           # take the next clue and return to the greeting
    "leave_it",        # decline, or walk away from a cold shoulder
    "thanks",          # accept a handed-over item
    "then_no",         # decline a refused favour
    "leave",           # end the conversation
    "rumour_refused",  # what somebody who will not tell you says
    "favour_refused",  # what somebody who will not give it up says
])

# --- clues ----------------------------------------------------------------


def clue(cid, text, source=""):
    """One thing the party can come to know."""
    out = {"id": cid, "name": text}
    if source:
        out["source"] = source
    return out


def thread(tid, name, description, clues):
    """The heading several clues hang under, so a partial answer reads as one."""
    return {"id": tid, "name": name, "description": description,
            "entries": [c["id"] for c in clues]}


def learn(cid):
    return {"learnLore": {"entry": cid}}


# --- talking to people ----------------------------------------------------

def standing_dc(base, faction, *, span=6, per=5):
    """A difficulty that moves with what a faction thinks of you."""
    return {"sub": [base, {"clamp": [
        {"div": [{"ref": f"reputation.{faction}", "else": 0}, per]}, -span, span]}]}


def rumour(key, ask, told, cid, *, voice, skill="persuasion", base=12,
           faction=None, refused=None, cost=1, back="greet", requires=None,
           span=6):
    """A clue somebody has, behind a roll that their opinion of you moves."""
    gate = {"without": {"lore": [cid]}}
    for name, value in (requires or {}).items():
        if name == "without":
            for inner, entries in value.items():
                gate["without"][inner] = list(gate["without"].get(inner, [])) + list(entries)
        else:
            gate[name] = value

    yes, no = f"{key}_told", f"{key}_wont"
    option = {
        "id": key, "text": ask, "requires": gate, "effects": [],
        "onceOnly": False, "showWhenLocked": False, "lockedHint": "",
        "check": {
            "skill": skill,
            "difficulty": standing_dc(base, faction, span=span) if faction else base,
            "onSuccess": yes, "onFailure": no,
        },
    }

    nodes = [
        {"id": yes, "says": [{"text": told}], "onEnter": [learn(cid)],
         "options": [{"id": f"{key}_on", "text": voice.go_on, "goto": back,
                      "effects": [], "onceOnly": False,
                      "showWhenLocked": False, "lockedHint": ""}],
         "redirectWhen": []},
        {"id": no,
         "says": [{"text": refused or voice.rumour_refused}],
         "onEnter": ([{"adjustReputation": {"faction": faction, "amount": -cost}}]
                     if faction and cost else []),
         "options": [{"id": f"{key}_drop", "text": voice.leave_it, "goto": back,
                      "effects": [], "onceOnly": False,
                      "showWhenLocked": False, "lockedHint": ""}],
         "redirectWhen": []},
    ]
    return option, nodes


def favour(key, ask, given_says, iid, *, voice, skill="persuasion", base=14,
           faction=None, refused=None, cost=2, back="greet", requires=None,
           span=6, extra=()):
    """Asking somebody for the thing they are holding."""
    gate = {"without": {"items": [iid], "flags": [{"flag": given(iid)}]}}
    for name, value in (requires or {}).items():
        if name == "without":
            for inner, entries in value.items():
                gate["without"][inner] = list(gate["without"].get(inner, [])) + list(entries)
        else:
            gate[name] = value

    yes, no = f"{key}_gave", f"{key}_kept"
    option = {
        "id": key, "text": ask, "requires": gate, "effects": [],
        "onceOnly": False, "showWhenLocked": False, "lockedHint": "",
        "check": {
            "skill": skill,
            "difficulty": standing_dc(base, faction, span=span) if faction else base,
            "onSuccess": yes, "onFailure": no,
        },
    }
    nodes = [
        {"id": yes, "says": [{"text": given_says}],
         "onEnter": handover(iid) + list(extra),
         "options": [{"id": f"{key}_thanks", "text": voice.thanks, "goto": back,
                      "effects": [], "onceOnly": False,
                      "showWhenLocked": False, "lockedHint": ""}],
         "redirectWhen": []},
        {"id": no,
         "says": [{"text": refused or voice.favour_refused}],
         "onEnter": ([{"adjustReputation": {"faction": faction, "amount": -cost}}]
                     if faction and cost else []),
         "options": [{"id": f"{key}_leave", "text": voice.then_no, "goto": back,
                      "effects": [], "onceOnly": False,
                      "showWhenLocked": False, "lockedHint": ""}],
         "redirectWhen": []},
    ]
    return option, nodes


def talk(did, start, greet_says, pieces, *, voice, extra_nodes=(), redirects=(),
         extra_options=(), leave=None):
    """A conversation assembled from `rumour`/`favour` pieces."""
    options = [piece[0] for piece in pieces] + list(extra_options)
    options.append({"id": f"{start}_leave", "text": leave or voice.leave,
                    "effects": [],
                    "onceOnly": False, "showWhenLocked": False, "lockedHint": ""})

    nodes = [{
        "id": start,
        "says": [{"text": line} for line in
                 (greet_says if isinstance(greet_says, (list, tuple)) else [greet_says])],
        "onEnter": [], "options": options,
        "redirectWhen": [{"requires": r, "goto": g} for r, g in redirects],
    }]
    for piece in pieces:
        nodes.extend(piece[1])
    nodes.extend(extra_nodes)
    return {"id": did, "start": start, "nodes": nodes}


def coldshoulder(key, faction, at, says, *, voice, back=None):
    """Below `at` standing, this person will not discuss it at all."""
    nid = f"{key}_cold"
    redirect = ({"factions": [{"faction": faction, "maxStanding": at}]}, nid)
    node = {"id": nid, "says": [{"text": says}], "onEnter": [],
            "options": ([{"id": f"{key}_go", "text": voice.leave_it, "goto": back,
                          "effects": [], "onceOnly": False,
                          "showWhenLocked": False, "lockedHint": ""}]
                        if back else []),
            "redirectWhen": []}
    return redirect, node


# --- finding things -------------------------------------------------------

def finding(tid, description, cid, *, mode="once"):
    """A clue the place itself gives up, on arrival, for facts with nobody standing next to them."""
    return {"id": tid, "mode": mode, "on": "enter", "description": description,
            "effects": [learn(cid)]}


def rumoured(thread_key, *, base, step, skill="perception", entries):
    """A point of interest that is findable without the clues, and rarely."""
    return {
        "hidden": True,
        "discover": {
            "skill": skill,
            "difficulty": {"max": [
                base - step * entries,
                {"sub": [base, {"mul": [step, {"ref": f"threads.{thread_key}.known"}]}]},
            ]},
        },
    }


# --- things -----------------------------------------------------------------

def token(iid, name, description, *, value=0):
    """A clue you can carry: a scrap, a rubbing, a tally-stick."""
    return {"id": iid, "name": name, "description": description,
            "kind": "key", "value": value, "weight": 0, "tags": ["clue"],
            "consumedOnUse": True}


def reading(iid, cid):
    """Wire a `token` to the clue it carries."""
    return {"item": iid, "onUse": [learn(cid)]}


def trophy(iid, name, description, cid):
    """Proof you put something down, and what it taught you."""
    return {"id": iid, "name": name, "description": description,
            "kind": "treasure", "value": 0, "weight": 0,
            "tags": ["clue", "proof"], "onUse": [learn(cid)],
            "consumedOnUse": False}


def keepsake(iid, name, description, *, holder, value=0, tags=()):
    """A key item somebody has, obtainable by asking or off the body."""
    return {"id": iid, "name": name, "description": description,
            "kind": "key", "value": value, "weight": 0,
            "tags": ["keepsake", *tags], "extra": {"heldBy": holder}}


def given(iid):
    """The flag that says a key item was handed over rather than taken."""
    return f"given:{iid}"


def handover(iid, *, quantity=1):
    """The effects of a key item being given: the item, and the record of it."""
    return [
        {"grantItem": {"target": {"ref": "actor.id"}, "item": iid,
                       "quantity": quantity}},
        {"setFlag": {"flag": given(iid), "value": True}},
    ]


def carried(table_id, name, iid, *, weight=1):
    """The loot table that drops a key item off its holder."""
    return {
        "id": table_id, "name": name, "rolls": "1", "emptyChance": 0,
        "entries": [{"weight": weight, "value": {
            "item": iid, "quantity": "1", "unique": True,
            "requirementScope": "party",
            "requires": {"without": {"flags": [{"flag": given(iid)}]}},
        }}],
    }


def relic(gid, name, slot, description, *, value, rarity=None, skills=None,
          guard=None, initiative=None, carry=None, resist=(), damage=None,
          properties=(), weight=1, tags=()):
    """The payoff: gear no questline offers."""
    return gear(gid, name, slot, value, description, skills=skills, guard=guard,
                initiative=initiative, carry=carry, resist=resist, weight=weight,
                rarity=rarity, tags=["fabled", *tags], damage=damage,
                properties=properties)


# --- doors ------------------------------------------------------------------

def sealed(gid, name, description, blocked_key, *, items=(), lore=(), consume=False,
           kind="ward", faction_hint=None, opens_flag=None):
    """A door that says in words what it wants."""
    requires = {}
    if items:
        requires["items"] = [{"item": i, "quantity": 1, "consume": consume,
                              "equipped": False} for i in items]
    if lore:
        requires["lore"] = [{"entry": c, "known": True} for c in lore]

    # A door a quest waits on must also write its own flag.
    out = {"id": gid, "name": name, "description": description, "kind": kind,
           "blockedTextKey": blocked_key, "staysOpen": True,
           "onOpen": ([{"setFlag": {"flag": opens_flag, "value": True}}]
                      if opens_flag else []),
           "onBlocked": [], "opensWith": [], "tags": []}
    if requires:
        out["requires"] = requires
    if faction_hint:
        out["tags"] = [faction_hint]
    return out


def trial(gid, name, description, blocked_key, trophies):
    """The many-bosses door: it takes the proofs and keeps them."""
    return sealed(gid, name, description, blocked_key, items=trophies,
                  consume=True, kind="story")


def blocked(key, *lines):
    """The prose a sealed door refuses you with."""
    pool(key, *lines)
    return key
