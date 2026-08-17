"""Aurendel — the hidden threads, and the five rules they keep.

A hidden thread is a thing nobody hands you. You hear a partial fact in one
village, another one four days away, and eventually you know where to go. There
is no quest-giver, no marker, and no point at which the game tells you a thread
exists — the first you know of it is somebody mentioning, in passing, that the
tide only falls that far at the turn of the year.

The contract, all asserted by `check_quests.py`:

  1. **Empty ground only.** A thread lives in an area no quest, dialogue, NPC
     home or trigger already touches. `hiddenspace.EMPTY` is that list, frozen
     from the built module — 61 of Aurendel's 108 areas, holding 307 points of
     interest and 32 dungeons that nothing has ever named.
  2. **Nothing new is built.** No areas, no points of interest, no dungeons. The
     geography is already there and unused; what it lacks is people and reasons.
  3. **A clue informs the search, it does not gate it.** The anchor is `hidden`
     with a `discover.difficulty` that *falls* as the thread fills, so a party
     that searches everything can find it cold and a party that listens finds it
     on purpose. Finding it is never enough on its own — entry wants a key item.
  4. **Standing is a price, not a wall.** Somebody you have wronged is harder to
     talk round. `requires` is for *what* they will discuss; the check's
     difficulty is for *how hard it is to get it out of them*. A clue behind a
     `minStanding` is a bug, and the linter says so.
  5. **Every key item has two routes.** Asked for, or taken off the body. A party
     that has burned a faction past speaking can still get in; what it pays is
     standing, witnesses, and a merchant it no longer has.

Two engine facts this file exists to encode, both of which bite silently:

  * **`option.effects` run before `option.check`**, unconditionally
    (`sim/dialogue.ts`). A `learnLore` in an option's effects is therefore taught
    on a *failed* persuasion too. Clues are taught from the success node's
    `onEnter`, which is what `rumour()` builds.
  * **`difficulty` is an `Expr`**, and evaluated against the *speaker's* scope,
    so `reputation.<faction>` in the formula is their faction's opinion of you.
"""
from prose import pool

# --- clues ----------------------------------------------------------------


def clue(cid, text, source=""):
    """One thing the party can come to know.

    `text` is the clue as the player reads it, and it is bound by the rule that
    makes this content worth having: **true, partial, and never a direction.**
    "The tide only falls that far at the turn of the year" is a clue. "Go to the
    Ribcage" is a waypoint marker with extra words.

    `check_quests.py` enforces the mechanical half of that — a clue may not
    contain the name or id of the place it points at.
    """
    out = {"id": cid, "name": text}
    if source:
        out["source"] = source
    return out


def thread(tid, name, description, clues):
    """The heading several clues hang under, so a partial answer reads as one.

    Declaring the whole set is what lets the journal say *three of five*. The
    count of what is still missing is the part that makes a thread worth
    pulling; a flat list of three unrelated facts is not.
    """
    return {"id": tid, "name": name, "description": description,
            "entries": [c["id"] for c in clues]}


def learn(cid):
    return {"learnLore": {"entry": cid}}


# --- talking to people ----------------------------------------------------

def standing_dc(base, faction, *, span=6, per=5):
    """A difficulty that moves with what a faction thinks of you.

    At standing 0 it is `base`. Every `per` points of standing moves it a point
    in your favour, to a maximum of `span` either way — so the whole range is
    `base ± span` and no amount of goodwill makes a hard thing automatic, nor
    any amount of hostility make it impossible.

    That last clause is the whole design. A gate is shut until you have the key;
    a person is *harder*, and there is always a roll.
    """
    return {"sub": [base, {"clamp": [
        {"div": [{"ref": f"reputation.{faction}", "else": 0}, per]}, -span, span]}]}


def rumour(key, ask, told, cid, *, skill="persuasion", base=12, faction=None,
           refused=None, cost=1, back="greet", requires=None, span=6):
    """A clue somebody has, behind a roll that their opinion of you moves.

    Returns `(option, nodes)` — three pieces, because the clue cannot live on
    the option. `option.effects` run before `option.check` and regardless of it,
    so a `learnLore` there is taught on a failure too. It goes on the success
    node's `onEnter` instead.

    The option is gated `without: {lore: [cid]}`, which is what makes it vanish
    once you know: an NPC who keeps offering to tell you a thing you already
    know is a menu, not a person.

    `cost` is standing lost on a failure. Small on purpose — the roll is
    retryable, and every thread has at least two sources in two areas, so a
    soured relationship narrows the route rather than closing it.
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
         "options": [{"id": f"{key}_on", "text": "Go on.", "goto": back,
                      "effects": [], "onceOnly": False,
                      "showWhenLocked": False, "lockedHint": ""}],
         "redirectWhen": []},
        {"id": no,
         "says": [{"text": refused or "“I've said all I mean to,” "
                              "they say, and go back to what they were doing."}],
         "onEnter": ([{"adjustReputation": {"faction": faction, "amount": -cost}}]
                     if faction and cost else []),
         "options": [{"id": f"{key}_drop", "text": "Leave it.", "goto": back,
                      "effects": [], "onceOnly": False,
                      "showWhenLocked": False, "lockedHint": ""}],
         "redirectWhen": []},
    ]
    return option, nodes


def favour(key, ask, given_says, iid, *, skill="persuasion", base=14, faction=None,
           refused=None, cost=2, back="greet", requires=None, span=6, extra=()):
    """Asking somebody for the thing they are holding.

    The same three pieces as {@link rumour} and for the same reason — the item
    is handed over from the success node's `onEnter`, because an option's
    effects run before its check and regardless of it.

    Gated on not already having it and on the gift not already having been made,
    never on standing. That is rule 4: the roll gets harder as they like you
    less, and there is no floor below which asking stops being possible. The
    other route is always open too, and costs more than a roll.
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
         "options": [{"id": f"{key}_thanks", "text": "Thank you.", "goto": back,
                      "effects": [], "onceOnly": False,
                      "showWhenLocked": False, "lockedHint": ""}],
         "redirectWhen": []},
        {"id": no,
         "says": [{"text": refused or "“No,” they say, and that is the whole "
                              "of the answer you are getting."}],
         "onEnter": ([{"adjustReputation": {"faction": faction, "amount": -cost}}]
                     if faction and cost else []),
         "options": [{"id": f"{key}_leave", "text": "Then no.", "goto": back,
                      "effects": [], "onceOnly": False,
                      "showWhenLocked": False, "lockedHint": ""}],
         "redirectWhen": []},
    ]
    return option, nodes


def talk(did, start, greet_says, pieces, *, extra_nodes=(), redirects=(),
         extra_options=(), leave="Nothing."):
    """A conversation assembled from `rumour`/`favour` pieces.

    Each piece is an `(option, nodes)` pair. The greeting collects the options
    and the dialogue collects every node, which is the whole of the bookkeeping
    and exactly the part that is easy to get wrong: a `goto` into a node nobody
    added is a load error, and a node with no options ends the conversation.
    """
    options = [piece[0] for piece in pieces] + list(extra_options)
    options.append({"id": f"{start}_leave", "text": leave, "effects": [],
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


def coldshoulder(key, faction, at, says, *, back=None):
    """Below `at` standing, this person will not discuss it at all.

    Returns `(redirect, node)`. The node has one way out rather than none: a
    node with no options ends the conversation outright, which is right for
    somebody who has turned their back and wrong for a shopkeeper who will still
    sell you rope.

    Reserved for people you have genuinely wronged. Everything above this floor
    is a roll, not a refusal.
    """
    nid = f"{key}_cold"
    redirect = ({"factions": [{"faction": faction, "maxStanding": at}]}, nid)
    node = {"id": nid, "says": [{"text": says}], "onEnter": [],
            "options": ([{"id": f"{key}_go", "text": "Leave it.", "goto": back,
                          "effects": [], "onceOnly": False,
                          "showWhenLocked": False, "lockedHint": ""}]
                        if back else []),
            "redirectWhen": []}
    return redirect, node


# --- finding things -------------------------------------------------------

def finding(tid, description, cid, *, mode="once"):
    """A clue the place itself gives up, on arrival.

    Some facts have nobody standing next to them. A ship in the middle of the
    ice does not talk, and which way it is pointed is the whole of what it has
    to say.
    """
    return {"id": tid, "mode": mode, "on": "enter", "description": description,
            "effects": [learn(cid)]}


def rumoured(thread_key, *, base, step, skill="perception", entries):
    """A point of interest that is findable without the clues, and rarely.

    Returns the patch that makes an existing place hidden with a discovery
    difficulty that falls as the thread fills: `base` knowing nothing, down to
    `base - step * entries` knowing all of it.

    This is the shape rule 3 asks for, and it needs `difficulty` to be a formula
    — which is why the engine change went in first. Knowing the clues does not
    unlock the place; it turns luck into method.
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
    """A clue you can carry: a scrap, a rubbing, a tally-stick.

    `weight: 0` and `consumedOnUse`, so reading it moves the words into the
    journal and leaves nothing in the pack. The knowledge is the point; the
    paper is not, and an inventory silting up with paper is the failure this
    avoids.
    """
    return {"id": iid, "name": name, "description": description,
            "kind": "key", "value": value, "weight": 0, "tags": ["clue"],
            "consumedOnUse": True}


def reading(iid, cid):
    """Wire a `token` to the clue it carries."""
    return {"item": iid, "onUse": [learn(cid)]}


def trophy(iid, name, description, cid):
    """Proof you put something down, and what it taught you.

    Not consumed: a trial gate takes these in payment, so the object has to
    outlive the reading of it. `weight: 0` for the same reason as `token` —
    eleven of these is a bookkeeping tax, not a decision.
    """
    return {"id": iid, "name": name, "description": description,
            "kind": "treasure", "value": 0, "weight": 0,
            "tags": ["clue", "proof"], "onUse": [learn(cid)],
            "consumedOnUse": False}


def keepsake(iid, name, description, *, holder, value=0, tags=()):
    """A key item somebody has, obtainable two ways and always obtainable.

    Asked for, behind the persuasion roll; or taken off the body. Both routes
    exist for every one of these, and `check_quests.py` treats a key item with
    only one as an error rather than a warning — one route is how a party locks
    itself out of content it cannot see.

    `holder` is recorded so the linter can find the statblock that must drop it.
    """
    return {"id": iid, "name": name, "description": description,
            "kind": "key", "value": value, "weight": 0,
            "tags": ["keepsake", *tags], "extra": {"heldBy": holder}}


def given(iid):
    """The flag that says a key item was handed over rather than taken.

    Read by the holder's loot entry, so a gift already made cannot be looted a
    second time off the corpse. Without it, asking politely and then killing
    them yields two.
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
    """The loot table that drops a key item off its holder.

    `unique` so it can never be found twice, and gated on the gift not having
    been made — the other half of `handover`. The holder needs a statblock of
    their own for this to mean anything: `dropDeathLoot` resolves loot through
    `corpse.statblock`, so a shared one would have every guard in the region
    dropping the seal.
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
    """The payoff: gear no questline offers.

    Same shape as `sidekit.gear`, and deliberately the same four slots — `head`,
    `cloak`, `ring`, `belt` hold nothing the main line was tuned against, so a
    thread can pay in real power without touching those numbers.
    """
    from sidekit import gear
    return gear(gid, name, slot, value, description, skills=skills, guard=guard,
                initiative=initiative, carry=carry, resist=resist, weight=weight,
                rarity=rarity, tags=["fabled", *tags], damage=damage,
                properties=properties)


# --- doors ------------------------------------------------------------------

def sealed(gid, name, description, blocked_key, *, items=(), lore=(), consume=False,
           kind="ward", faction_hint=None, opens_flag=None):
    """A door that says in words what it wants.

    `blockedTextKey` is not decoration: a hard gate with generic flavour reads
    as a bug, and a hard gate that states its price reads as the next clue. The
    engine renders `describeRequirement` into the ways-out list as well, so the
    reason is on screen before the player even tries it.
    """
    requires = {}
    if items:
        requires["items"] = [{"item": i, "quantity": 1, "consume": consume,
                              "equipped": False} for i in items]
    if lore:
        requires["lore"] = [{"entry": c, "known": True} for c in lore]

    # `gate:<id>:open` is the engine's own record and content cannot read it as
    # an objective, so a door that a quest waits on has to say so in its own
    # words. Without this the objective waits on a flag nobody writes, which
    # validates perfectly and hangs the quest forever.
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
    """The many-bosses door: it takes the proofs, and it keeps them.

    `consume: true` is implemented at gates and nowhere else, which is exactly
    where it belongs — you carry the trophies to the stone and the stone takes
    them.
    """
    return sealed(gid, name, description, blocked_key, items=trophies,
                  consume=True, kind="story")


def blocked(key, *lines):
    """The prose a sealed door refuses you with."""
    pool(key, *lines)
    return key
