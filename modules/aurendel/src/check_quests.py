#!/usr/bin/env python3
"""Check the references and the contracts `npm run validate` cannot.

    python3 check_quests.py

The module schema marks most cross-references with `ref(...)`, and `compile.ts`
turns an unresolved one into a hard `dangling_ref` error. Three things it does
not cover, and every one of them fails *silently* at play time rather than at
load time:

  * **`objective.target` is `idSchema`, not a ref.** A `kill` objective naming
    a monster that does not exist compiles perfectly clean and simply never
    completes — which, on the critical path, is an unwinnable game with no
    error anywhere.
  * **Flags are free strings.** A `setFlag` that writes `sisters_restord` and
    an objective that waits on `sisters_restored` both validate, and the quest
    hangs forever.
  * **Reachability.** Every quest can be individually fine while the chain from
    the starting quest to the ending arc has a break in it.

Since the side chains landed there are five more, and they exist because a side
chain is defined by a *contract* rather than by a field. The engine has no idea
what "optional content" means: `quest.tags` is inert, read by nothing, and a
side quest that quietly gates the ending would look exactly like one that does
not. So the contract is asserted here instead — skippability, act containment,
chain integrity, factions that actually do something, and an XP budget that is
reported rather than hoped for.

It reads the built `module.json`, so it checks what actually shipped rather than
what the generator meant.
"""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MODULE = os.path.join(ROOT, "modules/aurendel/module.json")

# Which collection an objective's `target` is an id in, per `kind`. Read off
# `matchesEvent` in packages/engine/src/sim/quests.ts.
TARGET_COLLECTION = {
    "kill": ("content", "monsters"),
    "collect": ("content", "items"),
    "talk": ("content", "npcs"),
    # `reach` is matched as a substring of a map id, or against a trigger
    # source, a gate, or a point of interest — so it may be any of four.
    "reach": None,
}

# The spine quests a side chain is allowed to name in `requires`: the act gates
# from `sidekit.ACT_GATES`. Anything else means a chain has grown a dependency
# on the story, which is the thing side content is not allowed to do.
ACT_GATE_QUESTS = {"the_open_door", "the_undercroft"}

# The XP thresholds, from `rules.progression.levels`. Loaded from the document
# rather than restated, so a change to the curve is picked up here.


def ids(doc, section, collection):
    return {entry["id"] for entry in doc.get(section, {}).get(collection, [])}


def walk(node, want, out):
    """Every value of a key called `want`, anywhere in the document."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k == want and isinstance(v, str):
                out.add(v)
            walk(v, want, out)
    elif isinstance(node, list):
        for item in node:
            walk(item, want, out)
    return out


def flag_refs(node, out):
    """Every flag *read* under this node, by either of the two spellings.

    `{"ref": "flags.x"}` is the DSL predicate form; `requires.flags[].flag` is
    the structured gate. Content uses both and they mean the same thing.
    """
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "ref" and isinstance(v, str) and v.startswith("flags."):
                out.add(v[len("flags."):])
            flag_refs(v, out)
    elif isinstance(node, list):
        for item in node:
            flag_refs(item, out)
    return out


def objectives_of(quest):
    yield from quest.get("objectives", [])
    for stage in quest.get("stages", []):
        yield from stage.get("objectives", [])


def level_for(levels, xp):
    """The level a party of that experience has reached."""
    reached = 1
    for entry in sorted(levels, key=lambda e: e["level"]):
        if xp >= entry["xpRequired"]:
            reached = entry["level"]
    return reached


def main():
    with open(MODULE) as f:
        doc = json.load(f)

    problems = []
    warnings = []
    notes = []
    quests = doc["narrative"]["quests"]
    by_id = {q["id"]: q for q in quests}

    known = {
        "monsters": ids(doc, "content", "monsters"),
        "items": ids(doc, "content", "items"),
        "npcs": ids(doc, "content", "npcs"),
        "pois": ids(doc, "world", "pointsOfInterest"),
        "areas": ids(doc, "world", "areas"),
        "dungeons": ids(doc, "world", "dungeons"),
        "gates": ids(doc, "world", "gates"),
        "triggers": walk(doc["world"], "id", set()),
    }

    # --- 1. objective targets --------------------------------------------
    for quest in quests:
        for objective in objectives_of(quest):
            target = objective.get("target")
            if not target:
                continue
            where = f"{quest['id']}/{objective['id']}"
            kind = objective.get("kind", "custom")
            collection = TARGET_COLLECTION.get(kind)
            if collection:
                pool = known[collection[1]]
                if target not in pool:
                    problems.append(
                        f"{where}: {kind} target {target!r} is not a "
                        f"{collection[1][:-1]}")
            elif kind == "reach":
                # Any of the four things `reach` can match.
                anywhere = (known["pois"] | known["areas"] | known["dungeons"]
                            | known["gates"] | known["triggers"])
                if target not in anywhere:
                    problems.append(
                        f"{where}: reach target {target!r} is not a point of "
                        f"interest, area, dungeon, gate, or trigger")

    # --- 2. flags: written somewhere, waited on somewhere ------------------
    written = walk(doc, "flag", set())
    refs = flag_refs(doc["narrative"], set())
    flag_refs(doc["world"], refs)

    for flag in sorted(refs - written):
        problems.append(
            f"flag {flag!r} is waited on but never set by anything — the "
            f"objective or gate reading it can never come true")

    # --- 3. the chain from the start to the ending -------------------------
    reachable, frontier = set(), []
    for quest in quests:
        if quest.get("autoStart") or quest.get("giver"):
            frontier.append(quest["id"])
    for quest in quests:
        for npc in doc["content"].get("npcs", []):
            if quest["id"] in npc.get("offersQuests", []):
                frontier.append(quest["id"])

    while frontier:
        current = frontier.pop()
        if current in reachable:
            continue
        reachable.add(current)
        frontier.extend(by_id.get(current, {}).get("unlocks", []))

    for quest in quests:
        if quest["id"] not in reachable:
            problems.append(
                f"{quest['id']}: nothing starts it — no giver, no autoStart, "
                f"and nothing unlocks it")

    ending = [a for a in doc["narrative"].get("arcs", []) if a.get("isEnding")]
    if not ending:
        problems.append("no arc is marked isEnding, so the game cannot be won")
    for arc in ending:
        for quest_id in arc["quests"]:
            if quest_id not in reachable:
                problems.append(
                    f"{arc['id']}: the ending needs {quest_id}, which nothing "
                    f"starts")

    # ======================================================================
    # The side-chain contract. Everything below is about content that is
    # allowed to be skipped, and therefore must be *provably* skippable.
    # ======================================================================

    side = [q for q in quests if "side" in q.get("tags", [])]
    spine = [q for q in quests if "side" not in q.get("tags", [])]
    side_ids = {q["id"] for q in side}

    # A chain is the set of quests sharing a key; the key is the third tag that
    # `sidekit.chain` writes, after "side" and the act.
    chains = {}
    for quest in side:
        tags = quest.get("tags", [])
        if len(tags) < 4:
            problems.append(
                f"{quest['id']}: tagged side but not by sidekit.chain — "
                f"expected [side, act, key, region], got {tags}")
            continue
        chains.setdefault(tags[2], []).append(quest)

    chain_keys = set(chains)

    # --- 4. skippable ------------------------------------------------------
    for arc in ending:
        for quest_id in arc["quests"]:
            if quest_id in side_ids:
                problems.append(
                    f"{arc['id']}: the ending arc contains {quest_id}, which is "
                    f"side content — the game cannot require optional work")

    for quest in spine:
        for unlocked in quest.get("unlocks", []):
            if unlocked in side_ids:
                problems.append(
                    f"{quest['id']}: a spine quest unlocks the side quest "
                    f"{unlocked} — side content must be offered, not woven in")

    # Every flag a chain writes carries its key as a prefix, which is what makes
    # the next check possible at all: with that convention, "does the spine wait
    # on side content?" is a string comparison instead of a dataflow analysis.
    for key, members in chains.items():
        for quest in members:
            for flag in sorted(walk(quest, "flag", set())):
                if not flag.startswith(f"{key}_"):
                    problems.append(
                        f"{quest['id']}: writes or reads the flag {flag!r}, "
                        f"which is not prefixed {key!r} — a side chain must not "
                        f"touch flags it does not own")

    for quest in spine:
        for flag in sorted(flag_refs(quest, set()) | walk(quest, "flag", set())):
            owner = next((k for k in chain_keys if flag.startswith(f"{k}_")), None)
            if owner:
                problems.append(
                    f"{quest['id']}: a spine quest reads {flag!r}, owned by the "
                    f"{owner} chain — the spine would then need side content")

    # --- 5. act containment -----------------------------------------------
    # Where everything is, so a `reach` can be resolved to a region. Areas carry
    # their region as the first tag; a point of interest inherits its area's;
    # a dungeon and a gate inherit from the point of interest that leads there.
    region_of = {}
    for area in doc["world"]["areas"]:
        tags = area.get("tags") or []
        if tags:
            region_of[area["id"]] = tags[0]
    for poi in doc["world"]["pointsOfInterest"]:
        region = region_of.get(poi.get("area"))
        if not region:
            continue
        region_of[poi["id"]] = region
        for field in ("dungeon", "gate"):
            if poi.get(field):
                region_of[poi[field]] = region
        for trigger in poi.get("triggers", []):
            region_of[trigger["id"]] = region

    for key, members in chains.items():
        acts = {q["tags"][1] for q in members}
        regions = {q["tags"][3] for q in members}
        if len(acts) > 1:
            problems.append(f"{key}: spans acts {sorted(acts)} — a chain is one act")
        if len(regions) > 1:
            problems.append(f"{key}: spans regions {sorted(regions)} — a chain is one region")
        region = sorted(regions)[0]

        for quest in members:
            for objective in objectives_of(quest):
                if objective.get("kind") != "reach":
                    continue
                target = objective.get("target")
                where = region_of.get(target)
                if where and where != region:
                    problems.append(
                        f"{quest['id']}/{objective['id']}: reaches {target!r} in "
                        f"{where}, but the {key} chain belongs to {region}")

            for gate in (quest.get("requires") or {}).get("quests", []):
                named = gate.get("quest")
                if named in ACT_GATE_QUESTS:
                    continue
                if named not in {q["id"] for q in members}:
                    problems.append(
                        f"{quest['id']}: requires {named!r}, which is neither an "
                        f"act gate nor part of the {key} chain")

            if quest.get("timeLimitDays"):
                # `expireQuests` in sim/agenda.ts never runs `onFail`, and a
                # chain that can expire is a chain that can be missed.
                problems.append(
                    f"{quest['id']}: side content must not expire "
                    f"(timeLimitDays is set, and onFail would not run anyway)")

    # --- 6. chain integrity ------------------------------------------------
    offers = {}
    for npc in doc["content"].get("npcs", []):
        for quest_id in npc.get("offersQuests", []):
            offers.setdefault(quest_id, []).append(npc["id"])

    for key, members in chains.items():
        # Declaration order survives the build, so the head is the one nothing
        # else in the chain unlocks.
        unlocked_within = {u for q in members for u in q.get("unlocks", [])
                           if u in {m["id"] for m in members}}
        heads = [q for q in members if q["id"] not in unlocked_within]
        if len(heads) != 1:
            problems.append(
                f"{key}: expected exactly one head, found "
                f"{sorted(q['id'] for q in heads)}")
            continue
        head = heads[0]
        giver = head.get("giver")
        if not giver:
            problems.append(f"{head['id']}: the head of {key} has no giver")
        elif head["id"] not in offers.get(head["id"], []) and giver not in offers.get(head["id"], []):
            problems.append(
                f"{head['id']}: {giver} is its giver but does not list it in "
                f"offersQuests, so nothing will offer it in play")

        for quest in members:
            if quest["id"] == head["id"]:
                continue
            if quest["id"] not in unlocked_within:
                problems.append(
                    f"{quest['id']}: nothing in the {key} chain unlocks it")

    # --- 7. no faction is decoration ---------------------------------------
    factions = doc["content"].get("factions", [])
    moved, deeded, gating = set(), set(), set()
    for entry in walk(doc, "faction", set()):
        moved.add(entry)
    for reward in quests:
        moved.update(reward.get("rewards", {}).get("reputation", {}).keys())
    for deed in doc["narrative"].get("deedKinds", []):
        deeded.add(deed.get("faction"))

    def find_faction_gates(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if key == "factions" and isinstance(value, list):
                    for clause in value:
                        if isinstance(clause, dict) and clause.get("faction"):
                            gating.add(clause["faction"])
                find_faction_gates(value)
        elif isinstance(node, list):
            for item in node:
                find_faction_gates(item)

    find_faction_gates(doc)

    # These are warnings rather than errors, and the distinction is the point: a
    # dangling objective target makes a game unwinnable, while a faction nobody
    # gates on is merely unfinished. One must stop a build; the other should read
    # as a to-do list and be driven to zero before shipping.
    for faction in factions:
        fid = faction["id"]
        # `the_unsealed` is what the wards were built against. It has no rank
        # ladder, gates nothing, and is never gained — it exists so creatures
        # have a side. Exempt on purpose.
        if fid == "the_unsealed":
            continue
        if fid not in moved:
            warnings.append(f"faction {fid}: nothing ever moves your standing with it")
        if fid not in deeded:
            warnings.append(
                f"faction {fid}: no deed kind names it, so nobody ever witnesses "
                f"or gossips about what you did for it")
        if fid not in gating:
            warnings.append(
                f"faction {fid}: no requirement anywhere reads it, so standing "
                f"with it buys nothing")

    # --- 8. the XP budget, reported rather than asserted -------------------
    levels = doc["rules"]["progression"]["levels"]

    def xp_of(quest):
        value = quest.get("rewards", {}).get("xp", 0)
        return value if isinstance(value, int) else 0

    acts = ["act1", "act2", "act3"]
    spine_xp = {a: sum(xp_of(q) for q in spine if a in q.get("tags", [])) for a in acts}
    side_xp = {a: sum(xp_of(q) for q in side if a in q.get("tags", [])) for a in acts}

    # Two places in the spine authorise more than any one run can collect, and
    # counting what is written rather than what is banked would overstate a
    # party's level by most of a tier. Act I forks into the Crown's commission
    # or the Library's errand and you take exactly one; Act II writes three ward
    # routes and asks for any two.
    branch_xp = sum(xp_of(q) for q in spine
                    if "act1" in q.get("tags", []) and "branch" in q.get("tags", []))
    spine_run = dict(spine_xp)
    spine_run["act1"] = spine_xp["act1"] - branch_xp // 2
    spine_run["act2"] = round(spine_xp["act2"] * 2 / 3)

    notes.append("XP budget — what a run banks by the end of each act:")
    running_spine = running_all = 0
    for act in acts:
        running_spine += spine_run[act]
        running_all += spine_run[act] + side_xp[act]
        notes.append(
            f"  {act}: spine {spine_run[act]:>5}  side {side_xp[act]:>5}   "
            f"→ level {level_for(levels, running_spine):>2} straight through, "
            f"level {level_for(levels, running_all):>2} doing everything")

    # --- report ------------------------------------------------------------
    if problems:
        print(f"✗ {len(problems)} problem(s) the schema cannot see\n")
        for problem in problems:
            print(f"  {problem}")
        return 1

    print(f"✓ {len(quests)} quests ({len(spine)} spine, {len(side)} side in "
          f"{len(chains)} chains): every objective target resolves, every flag "
          f"waited on is set, the ending is reachable, and no side chain "
          f"touches it")
    for note in notes:
        print(note)
    if warnings:
        print(f"\n! {len(warnings)} unfinished:")
        for warning in warnings:
            print(f"  {warning}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
