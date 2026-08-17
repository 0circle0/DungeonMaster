"""Quests, dialogue, and the shapes branching actually takes.

The engine has no branch primitive. A quest has one linear stage cursor and one
completion test, and everything that forks is built out of flags and
predicates. These helpers are the four idioms that come up, written once:

  * **`resolved_either_way`** — the branch objectives are `optional`, and one
    required `custom` objective completes when *any* of the branch flags is
    set. Without it a quest with only optional objectives can never complete at
    all, because `checkQuestCompletion` insists on at least one required one.
  * **`either`** — an `if` effect, which is how one quest produces two
    different outcomes from the same `onComplete`.
  * **`take_job`** — the dialogue option that hands a quest over: gate on the
    quest being unstarted, `emit: startQuest`, hand over whatever comes with it.
  * **`remembered_as`** — put the deed on the *dialogue node* where the work is
    turned in, not on the quest.

That last one is worth a paragraph. `quest.remembersAs` now works — the
emission scan loops, so a quest's own events get read — but the deed is still
recorded with the party leader as actor and no NPC in particular watching. A
deed emitted from the node where you report in is witnessed by the person you
are reporting to, which is the entire point of a reputation system.

Traps this file exists to avoid:

  * `ordered` defaults to **True**, and quest-level objectives sort *before*
    stage objectives. Mixing the two under the default forces the loose ones
    first, which is almost never what was meant.
  * A stage whose objectives are all `optional` is skipped entirely — its
    `onStart` and `onComplete` never run.
  * **`objective.target` is not a ref.** A typo compiles perfectly clean and
    the objective simply never fires. `dmkit.lint.objective_targets` is the
    answer to that, and it is the reason a module wants a linter of its own on
    top of `npm run validate`.
"""


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
    """Arrive somewhere. `target` is a POI id, an area id, or a gate id."""
    return obj(oid, description, kind="reach", target=target, **kw)


def kill(oid, description, monster, count=1, **kw):
    """`target` is a **monster** id — it is matched against `entity.statblock`."""
    return obj(oid, description, kind="kill", target=monster, count=count, **kw)


def collect(oid, description, item, count=1, **kw):
    return obj(oid, description, kind="collect", target=item, count=count, **kw)


def talk(oid, description, npc, **kw):
    return obj(oid, description, kind="talk", target=npc, **kw)


def flagged(oid, description, flag, **kw):
    """Done when a flag is set — the workhorse for anything the engine has no
    event for."""
    return obj(oid, description, when={"test": {"ref": f"flags.{flag}"}}, **kw)


def resolved_either_way(oid, description, flags, **kw):
    """One required objective satisfied by any of several mutually exclusive
    outcomes. This is what makes a branch completable."""
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
    """One outcome or the other, on a flag. The engine's only branch."""
    out = {"when": {"test": {"ref": f"flags.{flag}"}}, "then": list(then)}
    if otherwise:
        out["else"] = list(otherwise)
    return {"if": out}


def turn_hostile(entity):
    """Somebody has had enough of you. Works now; did not before."""
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
            # The only source of experience in the engine: nothing is granted
            # for a kill, so every level the party gains is granted here.
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
    """A conversation node.

    **A node with no options ends the conversation.** That is the engine's rule
    and it is the single easiest way to strand a player, so every node below
    that is not meant to be a parting word carries a way out.
    """
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
    """The quest-giver pattern, entire.

    Gated on the quest being unstarted so it disappears once taken, and the
    acceptance is an emitted event the reducer picks up *before* quests advance
    — so the job can be progressed by the same batch of events that granted it.
    """
    # Merged key by key rather than `update`d. A caller passing its own
    # `quests` clause — an act gate, say — would otherwise *replace* the
    # unstarted check, and the offer would go on being made after it had been
    # taken. Lists concatenate; everything else the caller wins.
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


def npc(nid, name, description, *, faction=None, dialogue_id=None, home=None,
        offers=(), disposition=0, cares=(), shop=None, statblock=None,
        gullibility=0.5, memory_span=90, reactions=()):
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
    return out


def shop(loot_table, *, buys=("treasure", "material"), multiplier=1.2,
         requires=None):
    out = {"lootTable": loot_table, "buysTags": list(buys),
           "priceMultiplier": multiplier}
    if requires:
        out["requires"] = requires
    return out
