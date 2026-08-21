"""Quests, dialogue, and the shapes branching actually takes."""


# --- objectives -----------------------------------------------------------

def obj(oid, description, *, kind="custom", target=None, count=1, when=None,
        requires=None, hidden=False, optional=False, on_complete=()):
    out = {"id": oid, "description": description, "kind": kind, "count": count,
           "hidden": hidden, "optional": optional}
    if target:
        out["target"] = target
    if when:
        out["when"] = when
    if requires:
        out["requires"] = requires
    if on_complete:
        out["onComplete"] = list(on_complete)
    return out


def reach(oid, description, target, **kw):
    """Arrive somewhere."""
    return obj(oid, description, kind="reach", target=target, **kw)


def kill(oid, description, monster, count=1, **kw):
    """`target` is a monster id — it is matched against `entity.statblock`."""
    return obj(oid, description, kind="kill", target=monster, count=count, **kw)


def collect(oid, description, item, count=1, **kw):
    return obj(oid, description, kind="collect", target=item, count=count, **kw)


def talk(oid, description, npc, **kw):
    return obj(oid, description, kind="talk", target=npc, **kw)


def flagged(oid, description, flag, **kw):
    """Done when a flag is set — the workhorse for anything the engine has no event for."""
    return obj(oid, description, when={"test": {"ref": f"flags.{flag}"}}, **kw)


def resolved_either_way(oid, description, flags, **kw):
    """One required objective satisfied by any of several mutually exclusive outcomes."""
    return obj(oid, description,
               when={"any": [{"test": {"ref": f"flags.{f}"}} for f in flags]},
               **kw)


# --- effects --------------------------------------------------------------

def set_flag(flag, value=True):
    return {"setFlag": {"flag": flag, "value": value}}


def rep(faction, amount):
    return {"adjustReputation": {"faction": faction, "amount": amount}}


def give(item, quantity=1):
    return {"grantItem": {"target": {"ref": "actor.id"}, "item": item,
                          "quantity": quantity}}


def deed(kind):
    return {"emit": {"event": "deed", "data": {"kind": kind}}}


def either(flag, then, otherwise=()):
    """One outcome or the other, on a flag."""
    out = {"when": {"test": {"ref": f"flags.{flag}"}}, "then": list(then)}
    if otherwise:
        out["else"] = list(otherwise)
    return {"if": out}


def turn_hostile(entity):
    """Somebody has had enough of you."""
    return {"setDisposition": {"target": entity, "to": "hostile"}}


# --- quests ---------------------------------------------------------------

def quest(qid, name, description, objectives, *, giver=None, requires=None,
          available=None, auto=False, ordered=True, stages=None, xp=0,
          items=(), reputation=None, unlocks=(), on_start=(), on_complete=(),
          on_fail=(), fail_when=None, remembers=None, tags=()):
    out = {
        "id": qid, "name": name, "description": description,
        "autoStart": auto, "ordered": ordered, "tags": list(tags),
        "objectives": list(objectives),
        "stages": list(stages or []),
        "unlocks": list(unlocks),
        "rewards": {
            # Quest rewards are one of two sources of experience, alongside kills.
            "xp": xp,
            "items": [{"item": i, "quantity": q} for i, q in items],
            "reputation": reputation or {},
        },
    }
    if giver:
        out["giver"] = giver
    if requires:
        out["requires"] = requires
    if available:
        out["available"] = available
    if on_start:
        out["onStart"] = list(on_start)
    if on_complete:
        out["onComplete"] = list(on_complete)
    if on_fail:
        out["onFail"] = list(on_fail)
    if fail_when:
        out["failWhen"] = fail_when
    if remembers:
        out["remembersAs"] = remembers
    return out


def stage(sid, name, description, objectives, *, on_start=(), on_complete=(),
          journal=None):
    out = {"id": sid, "name": name, "description": description,
           "objectives": list(objectives)}
    if on_start:
        out["onStart"] = list(on_start)
    if on_complete:
        out["onComplete"] = list(on_complete)
    if journal:
        out["journalKey"] = journal
    return out


def arc(aid, name, description, quests, *, ending=False):
    return {"id": aid, "name": name, "description": description,
            "quests": list(quests), "isEnding": ending}


# --- dialogue -------------------------------------------------------------

def node(nid, says, *, options=(), on_enter=(), remembers=None, redirects=()):
    """A conversation node."""
    out = {"id": nid, "says": [{"text": t} if isinstance(t, str) else t
                               for t in (says if isinstance(says, (list, tuple)) else [says])],
           "options": list(options), "onEnter": list(on_enter),
           "redirectWhen": [{"requires": r, "goto": g} for r, g in redirects]}
    if remembers:
        out["remembers"] = remembers
    return out


def option(oid, text, *, goto=None, requires=None, when=None, effects=(),
           once=False, locked_hint=None, check=None):
    out = {"id": oid, "text": text, "effects": list(effects), "onceOnly": once,
           "showWhenLocked": bool(locked_hint), "lockedHint": locked_hint or ""}
    if goto:
        out["goto"] = goto
    if requires:
        out["requires"] = requires
    if when:
        out["when"] = when
    if check:
        skill, difficulty, on_success, on_failure = check
        out["check"] = {"skill": skill, "difficulty": difficulty,
                        "onSuccess": on_success, "onFailure": on_failure}
    return out


def take_job(oid, text, quest_id, goto, *, gives=(), effects=(), requires=None):
    """The quest-giver pattern."""
    # Merged key by key: lists concatenate, and everything else the caller wins.
    gate = {"quests": [{"quest": quest_id, "status": "unstarted"}]}
    for key, value in (requires or {}).items():
        if isinstance(value, list) and isinstance(gate.get(key), list):
            gate[key] = gate[key] + value
        else:
            gate[key] = value
    return option(
        oid, text, goto=goto, requires=gate,
        effects=[{"emit": {"event": "startQuest", "data": {"quest": quest_id}}}]
                + [give(i, q) for i, q in gives] + list(effects),
    )


def dialogue(did, start, nodes):
    return {"id": did, "start": start, "nodes": list(nodes)}


# Somebody who stands where you left them: no wandering, no investigating.
MINDS_THE_SHOP = {
    "roamRadius": 0,
    "wanderChance": 0,
    "speeds": {"wander": 0},
    "investigates": [],
    "notices": ["hostile", "neutral", "ally"],
}

# Somebody with the run of the place: a guard on a round, a child in a lane.
WALKS_ABOUT = {
    "roamRadius": 24,
    "investigateRadius": 60,
    "leashRadius": 90,
    "wanderChance": 0.3,
    "speeds": {"wander": 0.5},
    "investigates": ["sight", "hearing"],
    "notices": ["hostile", "neutral", "ally"],
}


def npc(nid, name, description, *, faction=None, dialogue_id=None, home=None,
        offers=(), disposition=0, cares=(), shop=None, statblock=None,
        gullibility=0.5, memory_span=90, reactions=(), temperament=None):
    out = {"id": nid, "name": name, "description": description,
           "disposition": disposition, "gullibility": gullibility,
           "memorySpan": memory_span, "offersQuests": list(offers),
           "caresAbout": list(cares), "reactions": list(reactions)}
    if faction:
        out["faction"] = faction
    if dialogue_id:
        out["dialogue"] = dialogue_id
    if home:
        out["home"] = home
    if statblock:
        out["statblock"] = statblock
    if shop:
        out["shop"] = shop

    # Anyone with a counter to mind or a job to hand out stays put; everyone else has the run of the place.
    habits = temperament
    if habits is None:
        habits = MINDS_THE_SHOP if (shop or offers) else WALKS_ABOUT
    if habits:
        out["temperament"] = dict(habits)
    return out


def shop(loot_table, *, buys=("treasure", "material"), multiplier=1.2,
         requires=None):
    out = {"lootTable": loot_table, "buysTags": list(buys),
           "priceMultiplier": multiplier}
    if requires:
        out["requires"] = requires
    return out
