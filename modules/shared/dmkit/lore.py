"""Hidden threads — content nobody hands you, and the rules it keeps.

A hidden thread has no quest-giver and no marker. You hear a partial fact in one village and another
four days away, and eventually you know where to go.

The contract, all asserted by `check_quests.py`:

  1. Empty ground only. A thread lives in an area no quest, dialogue, NPC home or trigger already
     touches. `hiddenspace.EMPTY` is that list, frozen from the built module.
  2. Nothing new is built: no areas, no points of interest, no dungeons.
  3. A clue informs the search, it does not gate it. The anchor is `hidden` with a
     `discover.difficulty` that falls as the thread fills. Entry still wants a key item.
  4. Standing is a price, not a wall. `requires` is for what a person will discuss; the check's
     difficulty is for how hard it is to get it out of them. A clue behind a `minStanding` is a bug.
  5. Every key item has two routes: asked for, or taken off the body.

Two engine facts this file encodes, both of which fail silently:

  * `option.effects` run before `option.check`, unconditionally (`sim/dialogue.ts`), so a
    `learnLore` in an option's effects is taught on a failed persuasion too. Clues are taught from
    the success node's `onEnter`, which is what `rumour()` builds.
  * `difficulty` is an `Expr` evaluated against the speaker's scope, so `reputation.<faction>` in
    the formula is their faction's opinion of you.
"""
import collections

from dmkit.items import gear
from dmkit.prose import pool

# The player-facing English these constructors would otherwise have to invent. A module supplies it
# once; there is no default, because a refusal line is authored narration. See
# `modules/aurendel/src/lore.py` for a worked set.
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
    """One thing the party can come to know.

    `text` is the clue as the player reads it, and must be true, partial, and never a direction.
    `check_quests.py` enforces the mechanical half: a clue may not contain the name or id of the
    place it points at.
    """
    out = {"id": cid, "name": text}
    if source:
        out["source"] = source
    return out


def thread(tid, name, description, clues):
    """The heading several clues hang under, so a partial answer reads as one. Declaring the whole
    set is what lets the journal say three of five.
    """
    return {"id": tid, "name": name, "description": description,
            "entries": [c["id"] for c in clues]}


def learn(cid):
    return {"learnLore": {"entry": cid}}


# --- talking to people ----------------------------------------------------

def standing_dc(base, faction, *, span=6, per=5):
    """A difficulty that moves with what a faction thinks of you.

    At standing 0 it is `base`. Every `per` points of standing moves it one point in your favour, to
    a maximum of `span` either way, so the range is `base ± span`: no amount of goodwill makes a
    hard thing automatic, and no amount of hostility makes it impossible.
    """
    return {"sub": [base, {"clamp": [
        {"div": [{"ref": f"reputation.{faction}", "else": 0}, per]}, -span, span]}]}


def rumour(key, ask, told, cid, *, voice, skill="persuasion", base=12,
           faction=None, refused=None, cost=1, back="greet", requires=None,
           span=6):
    """A clue somebody has, behind a roll that their opinion of you moves.

    Returns `(option, nodes)`. The clue cannot live on the option: `option.effects` run before
    `option.check` and regardless of it, so a `learnLore` there is taught on a failure too. It goes
    on the success node's `onEnter`.

    The option is gated `without: {lore: [cid]}`, so it vanishes once you know.

    `cost` is standing lost on a failure. Small, because the roll is retryable and every thread has
    at least two sources in two areas.
    """
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
    """Asking somebody for the thing they are holding.

    The same three pieces as {@link rumour} and for the same reason: the item is handed over from
    the success node's `onEnter`.

    Gated on not already having it and on the gift not already having been made, never on standing —
    rule 4. The other route is always open too.
    """
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
    """A conversation assembled from `rumour`/`favour` pieces.

    Each piece is an `(option, nodes)` pair. The greeting collects the options and the dialogue
    collects every node: a `goto` into a node nobody added is a load error, and a node with no
    options ends the conversation.
    """
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
    """Below `at` standing, this person will not discuss it at all.

    Returns `(redirect, node)`. The node has one way out rather than none, since a node with no
    options ends the conversation outright.

    Reserved for people you have genuinely wronged; everything above this floor is a roll, not a
    refusal.
    """
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
    """A point of interest that is findable without the clues, and rarely.

    Returns the patch that makes an existing place hidden with a discovery difficulty that falls as
    the thread fills: `base` knowing nothing, down to `base - step * entries` knowing all of it.
    Knowing the clues does not unlock the place; it turns luck into method.
    """
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
    """A clue you can carry: a scrap, a rubbing, a tally-stick. `weight: 0` and `consumedOnUse`, so
    reading it moves the words into the journal and leaves nothing in the pack.
    """
    return {"id": iid, "name": name, "description": description,
            "kind": "key", "value": value, "weight": 0, "tags": ["clue"],
            "consumedOnUse": True}


def reading(iid, cid):
    """Wire a `token` to the clue it carries."""
    return {"item": iid, "onUse": [learn(cid)]}


def trophy(iid, name, description, cid):
    """Proof you put something down, and what it taught you. Not consumed, because a trial gate
    takes these in payment. `weight: 0` for the same reason as `token`.
    """
    return {"id": iid, "name": name, "description": description,
            "kind": "treasure", "value": 0, "weight": 0,
            "tags": ["clue", "proof"], "onUse": [learn(cid)],
            "consumedOnUse": False}


def keepsake(iid, name, description, *, holder, value=0, tags=()):
    """A key item somebody has, obtainable two ways and always obtainable: asked for behind the
    persuasion roll, or taken off the body. `check_quests.py` treats a key item with only one
    route as an error.

    `holder` is recorded so the linter can find the statblock that must drop it.
    """
    return {"id": iid, "name": name, "description": description,
            "kind": "key", "value": value, "weight": 0,
            "tags": ["keepsake", *tags], "extra": {"heldBy": holder}}


def given(iid):
    """The flag that says a key item was handed over rather than taken. Read by the holder's loot
    entry, so a gift already made cannot be looted a second time off the corpse.
    """
    return f"given:{iid}"


def handover(iid, *, quantity=1):
    """The effects of a key item being given: the item, and the record of it."""
    return [
        {"grantItem": {"target": {"ref": "actor.id"}, "item": iid,
                       "quantity": quantity}},
        {"setFlag": {"flag": given(iid), "value": True}},
    ]


def carried(table_id, name, iid, *, weight=1):
    """The loot table that drops a key item off its holder. `unique` so it can never be found twice,
    and gated on the gift not having been made. The holder needs a statblock of their own:
    `dropDeathLoot` resolves loot through `corpse.statblock`, so a shared one would have every
    guard dropping the seal.
    """
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
    """The payoff: gear no questline offers. Same shape as `dmkit.items.gear`, and the same four
    slots — `head`, `cloak`, `ring`, `belt` — which hold nothing the main line was tuned against.
    """
    return gear(gid, name, slot, value, description, skills=skills, guard=guard,
                initiative=initiative, carry=carry, resist=resist, weight=weight,
                rarity=rarity, tags=["fabled", *tags], damage=damage,
                properties=properties)


# --- doors ------------------------------------------------------------------

def sealed(gid, name, description, blocked_key, *, items=(), lore=(), consume=False,
           kind="ward", faction_hint=None, opens_flag=None):
    """A door that says in words what it wants. `blockedTextKey` is rendered by
    `describeRequirement` into the ways-out list, so the reason is on screen before the player
    tries it.
    """
    requires = {}
    if items:
        requires["items"] = [{"item": i, "quantity": 1, "consume": consume,
                              "equipped": False} for i in items]
    if lore:
        requires["lore"] = [{"entry": c, "known": True} for c in lore]

    # `gate:<id>:open` is the engine's own record and content cannot read it as an objective, so a
    # door a quest waits on must also write its own flag. Without it the objective waits on a flag
    # nobody writes.
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
    """The many-bosses door: it takes the proofs and keeps them. `consume: true` is implemented at
    gates and nowhere else.
    """
    return sealed(gid, name, description, blocked_key, items=trophies,
                  consume=True, kind="story")


def blocked(key, *lines):
    """The prose a sealed door refuses you with."""
    pool(key, *lines)
    return key
