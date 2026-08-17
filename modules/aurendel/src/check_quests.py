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
import re
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
    #
    # Five ways in, not four. `emit: {event: "startQuest"}` is how a dialogue
    # option hands a job over and how a trigger starts one the moment the party
    # walks up to a place — which is the *only* way a hidden thread's quest
    # begins, since the whole point of one is that nobody offers it.
    emitted = set()

    def _emits(node):
        if isinstance(node, dict):
            if node.get("event") == "startQuest":
                target = (node.get("data") or {}).get("quest")
                if isinstance(target, str):
                    emitted.add(target)
            for value in node.values():
                _emits(value)
        elif isinstance(node, list):
            for item in node:
                _emits(item)

    _emits(doc)

    reachable, frontier = set(), []
    for quest in quests:
        if quest.get("autoStart") or quest.get("giver") or quest["id"] in emitted:
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
    hidden = [q for q in quests if "hidden" in q.get("tags", [])]
    trials = [q for q in quests if "trial" in q.get("tags", [])]
    # The spine is what is left when every kind of optional content is taken
    # out. Each new kind has to be subtracted here as well as checked below —
    # a trial counted as spine would be a trial the XP budget attributed to the
    # main line and the skippability rules never looked at.
    spine = [q for q in quests
             if not {"side", "hidden", "trial"} & set(q.get("tags", []))]
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

    # --- 9. the hidden threads ---------------------------------------------
    #
    # A hidden thread has no giver and no arc you can see coming, so every
    # guarantee a side chain gets from being *offered* has to be asserted here
    # instead. All nine of these describe a failure that validates perfectly and
    # is invisible until somebody plays for four hours and finds nothing.
    import hiddenspace

    lore = {c["id"]: c for c in doc["narrative"].get("lore", [])}
    threads = doc["narrative"].get("loreThreads", [])
    npcs = {n["id"]: n for n in doc["content"]["npcs"]}
    pois = {p["id"]: p for p in doc["world"]["pointsOfInterest"]}
    areas = {a["id"]: a for a in doc["world"]["areas"]}
    items_by_id = {i["id"]: i for i in doc["content"]["items"]}
    empty = set(hiddenspace.areas())

    def area_of(poi_id):
        return pois.get(poi_id, {}).get("area")

    # 9a. Every clue is taught by something.
    taught = set()
    def _taught(node):
        if isinstance(node, dict):
            if "learnLore" in node and isinstance(node["learnLore"], dict):
                entry = node["learnLore"].get("entry")
                if isinstance(entry, str):
                    taught.add(entry)
            for value in node.values():
                _taught(value)
        elif isinstance(node, list):
            for item in node:
                _taught(item)
    _taught(doc)
    for cid in sorted(set(lore) - taught):
        problems.append(f"clue {cid!r} is taught by nothing, so it can never be learned")

    # 9b. No clue names the place it points at. This is the mechanical half of
    #     "a clue is true and partial": if the text contains the name or the id
    #     of a point of interest, it has stopped being a clue and become a
    #     waypoint marker with extra words.
    #     Two tests, and the second is narrow on purpose. Any raw point-of-
    #     interest id in a clue is always wrong. Display names are only checked
    #     against the anchors of the clue's *own* thread: half the continent's
    #     landmarks are called "The Landing" or "The Marker" or "The Edge", and
    #     forbidding those everywhere forbids ordinary English.
    anchor_names = {}
    for thread in threads:
        key = f'threads.{thread["id"]}.known'
        named = [p["name"] for p in pois.values()
                 if key in json.dumps(p.get("discover", {}))]
        for entry_id in thread["entries"]:
            anchor_names[entry_id] = named

    for cid, entry in sorted(lore.items()):
        text = f"{entry.get('name', '')} {entry.get('description', '')}".lower()
        hit = next((p for p in pois if p in text), None)
        if hit:
            problems.append(
                f"clue {cid!r} contains the id {hit!r} — a clue is prose, not "
                f"a reference")
            continue
        for name in anchor_names.get(cid, []):
            bare = re.sub(r"^the\s+", "", name.strip(), flags=re.I).lower()
            if len(bare) >= 5 and re.search(rf"\b{re.escape(bare)}\b", text):
                problems.append(
                    f"clue {cid!r} names its own anchor ({name!r}) — a clue "
                    f"points, it does not direct")
                break

    # 9c. Two tellers, in two areas. A thread that dies with one missed
    #     conversation is a thread nobody finishes.
    for thread in threads:
        entries = set(thread["entries"])
        tellers = []
        for npc_id, npc in npcs.items():
            did = npc.get("dialogue")
            if not did:
                continue
            spoken = json.dumps(next((d for d in doc["narrative"]["dialogues"]
                                      if d["id"] == did), {}))
            if any(f'"{e}"' in spoken for e in entries):
                tellers.append(npc_id)
        if len(tellers) < 2:
            problems.append(
                f"thread {thread['id']!r}: only {len(tellers)} teller(s); a "
                f"thread needs two so one missed conversation cannot end it")
        where = {area_of(npcs[t].get("home", "")) for t in tellers}
        if len(where) < 2:
            problems.append(
                f"thread {thread['id']!r}: every teller is in {where} — "
                f"spread them over two areas")

    # 9d. Nothing hidden stands on ground a questline already uses.
    for quest in hidden:
        for objective in objectives_of(quest):
            target = objective.get("target")
            if objective.get("kind") != "reach" or not target:
                continue
            where = area_of(target) or (target if target in areas else None)
            if where and where not in empty:
                problems.append(
                    f"{quest['id']}/{objective['id']}: {target!r} is in "
                    f"{where!r}, which a questline already uses — hidden "
                    f"threads go in the empty half of the map")
    for npc_id, npc in npcs.items():
        did = npc.get("dialogue", "")
        if not did.startswith("frost_") and not did.startswith("hidden_"):
            continue
        where = area_of(npc.get("home", ""))
        if where and where not in empty:
            problems.append(
                f"{npc_id}: lives in {where!r}, which a questline already uses")

    # 9e. Every key item has both routes: asked for, and taken off the body.
    for item in items_by_id.values():
        holder = (item.get("extra") or {}).get("heldBy")
        if not holder:
            continue
        if holder not in npcs:
            problems.append(f"{item['id']}: holder {holder!r} is not an NPC")
            continue
        statblock = npcs[holder].get("statblock")
        if not statblock:
            problems.append(
                f"{item['id']}: {holder} has no statblock, so killing them "
                f"drops nothing and asking is the only route")
            continue
        table = next((m for m in doc["content"]["monsters"]
                      if m["id"] == statblock), {}).get("loot")
        drops = json.dumps(next((t for t in doc["content"]["lootTables"]
                                 if t["id"] == table), {}))
        if f'"{item["id"]}"' not in drops:
            problems.append(
                f"{item['id']}: {holder}'s statblock does not drop it")
        granted = json.dumps(doc["narrative"]["dialogues"])
        if f'"{item["id"]}"' not in granted:
            problems.append(
                f"{item['id']}: nobody can be asked for it, so killing is the "
                f"only route")

    # 9f. Standing is a price, never a wall. A `minStanding` in front of a clue
    #     or a key item is the one thing rule 4 forbids: hostility belongs in
    #     the check's difficulty, where it makes a roll harder rather than
    #     making a thing impossible.
    keepsakes = {i["id"] for i in items_by_id.values()
                 if (i.get("extra") or {}).get("heldBy")}
    for dialogue in doc["narrative"]["dialogues"]:
        for node in dialogue["nodes"]:
            for opt in node.get("options", []):
                payload = json.dumps(opt) + json.dumps(
                    [n for n in dialogue["nodes"]
                     if n["id"] in (opt.get("check", {}).get("onSuccess"),)])
                touches = ("learnLore" in payload
                           or any(f'"{k}"' in payload for k in keepsakes))
                floors = [f for f in (opt.get("requires") or {}).get("factions", [])
                          if f.get("minStanding") is not None]
                if touches and floors:
                    problems.append(
                        f"{dialogue['id']}/{opt['id']}: a clue or key item "
                        f"behind minStanding — put the standing in the check's "
                        f"difficulty instead")

    # 9g. Nothing on the spine or in a chain may read a hidden flag.
    hidden_flags = set()
    for quest in hidden:
        hidden_flags |= walk(quest, "flag", set())
    for gate in doc["world"]["gates"]:
        if gate["id"].startswith("frost_"):
            hidden_flags |= walk(gate, "flag", set())
    for quest in spine + side:
        read = flag_refs(quest, set())
        for flag in sorted(read & hidden_flags):
            problems.append(
                f"{quest['id']}: reads {flag!r}, which a hidden thread owns — "
                f"the main line would then wait on content nobody offers")

    # 9h. A boss room with nothing to draw from is a room that generates empty.
    for dungeon in doc["world"]["dungeons"]:
        if not dungeon.get("bossTable"):
            warnings.append(
                f"{dungeon['id']}: boss room with no bossTable")

    # 9j. A kill objective needs something that actually spawns.
    #
    #     Rule 1 proves the monster exists. It does not prove anything ever puts
    #     it on a map, and an encounter table nothing references is invisible to
    #     every other check here: it validates, it compiles, and the objective
    #     waits forever. Three shipped threads were in exactly that state — a
    #     boss whose anchor was a point of interest rather than a dungeon mouth,
    #     so `BOSSES` could not reach it and its table was declared and orphaned.
    #
    #     `playlore.ts` cannot see this either, because it fakes kills on
    #     purpose: what it tests is the wiring, not the fight.
    reachable_tables = set()

    def _tables(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if k in ("encounterTables", "bossTable"):
                    if isinstance(v, str):
                        reachable_tables.add(v)
                    elif isinstance(v, list):
                        reachable_tables.update(x for x in v if isinstance(x, str))
                _tables(v)
        elif isinstance(node, list):
            for item in node:
                _tables(item)

    _tables(doc)

    spawnable = set()
    for table in doc["world"]["encounterTables"]:
        if table["id"] not in reachable_tables:
            continue
        for group in table.get("groups", []):
            for entry in group.get("entries", []):
                spawnable.add(entry["monster"])

    for quest in hidden + side + trials:
        for objective in objectives_of(quest):
            if objective.get("kind") != "kill":
                continue
            target = objective.get("target")
            if target and target not in spawnable:
                problems.append(
                    f"{quest['id']}/{objective['id']}: nothing spawns {target!r} — "
                    f"no table any place, area, biome or dungeon draws from "
                    f"contains it, so the objective can never complete")

    # 9i. Each thread's anchor must actually come down as the thread fills.
    for thread in threads:
        key = f'threads.{thread["id"]}.known'
        anchors = [p for p in pois.values() if key in json.dumps(p.get("discover", {}))]
        if not anchors:
            problems.append(
                f"thread {thread['id']!r}: no place gets easier to find as it "
                f"fills, so the clues inform nothing")

    # --- 10. the trials ----------------------------------------------------
    #
    # Post-game content, and the contract is different again from the other
    # two kinds of optional work. A side chain must not be required; a hidden
    # thread must not be required and must stand on empty ground; a trial must
    # not be required, must be *unreachable* until the game is won, and must
    # form an ordered ladder. All of it is invisible to the schema.
    import trialkit

    trial_ids = {q["id"] for q in trials}
    tiers = {}
    for quest in trials:
        tags = quest.get("tags", [])
        if len(tags) < 2:
            problems.append(
                f"{quest['id']}: tagged trial but not by trialkit.tier — "
                f"expected [trial, key], got {tags}")
            continue
        tiers.setdefault(tags[1], []).append(quest)

    # 10a. Nothing about the ending may depend on a trial — the same rule the
    #      side chains keep, in the same direction. A game you had to finish
    #      twice would be the failure here.
    for arc in ending:
        for quest_id in arc["quests"]:
            if quest_id in trial_ids:
                problems.append(
                    f"{arc['id']}: the ending arc contains {quest_id}, which is "
                    f"post-game content the ending is the gate for")

    # 10b. Trials own the `trial_` prefix, and nothing that can be played
    #      before the ending may read one of their flags.
    #
    #      Written, not merely mentioned. `walk(…, "flag")` cannot tell a
    #      `setFlag` from a `requires.flags[].flag`, and every trial door reads
    #      `aurendel_finished` on purpose — that is the gate, not a trespass.
    def set_flags(node, out):
        if isinstance(node, dict):
            written = node.get("setFlag")
            if isinstance(written, dict) and isinstance(written.get("flag"), str):
                out.add(written["flag"])
            for value in node.values():
                set_flags(value, out)
        elif isinstance(node, list):
            for item in node:
                set_flags(item, out)
        return out

    trial_flags = set()
    for quest in trials:
        set_flags(quest, trial_flags)
    for gate in doc["world"]["gates"]:
        if "trial" in (gate.get("tags") or []):
            set_flags(gate, trial_flags)
    for flag in sorted(trial_flags):
        if not flag.startswith("trial_"):
            problems.append(
                f"trial content owns the flag {flag!r}, which is not prefixed "
                f"'trial_' — the prefix is what makes the next check a string "
                f"comparison instead of a dataflow analysis")
    for quest in spine + side + hidden:
        for flag in sorted(flag_refs(quest, set()) & trial_flags):
            problems.append(
                f"{quest['id']}: reads {flag!r}, which a trial owns — content "
                f"playable before the ending would then wait on content that "
                f"only exists after it")

    # 10c. The ladder is ordered and it starts behind the ending. Each tier's
    #      head states its own gate; `unlocks` marks a quest available and does
    #      not gate starting it, which is the trap `sidekit` documents.
    for key, members in sorted(tiers.items()):
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
        elif giver not in offers.get(head["id"], []):
            # `giver` is a label; `offersQuests` is what puts the job in front
            # of a player. Tiers two and three had the first and not the
            # second, and were therefore offered by nobody.
            problems.append(
                f"{head['id']}: {giver} is its giver but does not list it in "
                f"offersQuests, so nothing will offer it in play")

        wanted = trialkit.TIER_GATES.get(key, {})
        gate = head.get("requires") or {}
        for field, clauses in wanted.items():
            if json.dumps(clauses) not in json.dumps(gate.get(field, [])):
                problems.append(
                    f"{head['id']}: the head of {key} does not require "
                    f"{clauses} — the rung below it is not the gate")

        for quest in members:
            if quest["id"] != head["id"] and quest["id"] not in unlocked_within:
                problems.append(
                    f"{quest['id']}: nothing in the {key} tier unlocks it")

    # 10d. Every tier's door asks for the relic to be *worn*. Owning it proves
    #      you traded for it; wearing it proves you came dressed, which is the
    #      whole distinction `equipped` exists to make.
    def wants_equipped(node):
        if isinstance(node, dict):
            if node.get("equipped") is True:
                return True
            return any(wants_equipped(v) for v in node.values())
        if isinstance(node, list):
            return any(wants_equipped(i) for i in node)
        return False

    for key in sorted(tiers):
        doors = [g for g in doc["world"]["gates"]
                 if "trial" in (g.get("tags") or []) and key in json.dumps(g)]
        if not any(wants_equipped(g.get("requires", {})) for g in doors):
            gated = [g["id"] for g in doors]
            problems.append(
                f"{key}: no door asks for a relic equipped (gates: {gated or 'none'}) "
                f"— a tier tuned for fabled gear must check for it")

    # 10e. Post-game encounter groups must actually be gated on the ending.
    #      A group that gets left out is a level-nineteen monster the party
    #      meets in Act I.
    for module_name in ("trial_one", "trial_two", "trial_three"):
        module = __import__(module_name)
        for table_id in {t for tables in getattr(module, "AREA_ENCOUNTERS", {}).values()
                         for t in tables}:
            table = next((t for t in doc["world"]["encounterTables"]
                          if t["id"] == table_id), None)
            if not table:
                problems.append(f"{module_name}: no encounter table {table_id!r}")
                continue
            for group in table["groups"]:
                if "aurendel_finished" not in json.dumps(group.get("requires", {})):
                    problems.append(
                        f"{table_id}/{group['id']}: a post-game group that is "
                        f"not gated on the ending — this draws in Act I")

    # --- 11. content that exists and cannot be reached ---------------------
    #
    # §2 asks whether a flag is written *anywhere*. That is not the same
    # question as whether the writing can ever run, and the difference cost
    # this module a quarter of Act II: the Nine Sisters' conversation was
    # written, was the only writer of all four `sisters_*` flags, and belonged
    # to no NPC. Every check passed. `validate` passed, because flags are free
    # strings; §2 passed, because the flag *was* authored; and `playchain`
    # passed, because it sets the flags itself rather than going and asking
    # somebody. The route was dead at its own first objective and the game
    # quietly became "do both of the other two" instead of "choose two".

    # 11a. A dialogue nobody owns cannot be opened. `talk` is the only way in
    #      and it goes through an NPC, so an unowned dialogue is dead prose.
    dialogues = {d["id"]: d for d in doc["narrative"]["dialogues"]}
    owned = {npc["dialogue"] for npc in npcs.values() if npc.get("dialogue")}
    # Anything else in the document that names a dialogue counts as an owner
    # too, so a future way of opening one does not read as a fault here.
    owned |= walk(doc["world"], "dialogue", set())
    owned |= walk(doc["narrative"], "dialogue", set())

    for dialogue_id in sorted(set(dialogues) - owned):
        problems.append(
            f"dialogue {dialogue_id!r} belongs to no NPC — nothing can open "
            f"it, so everything it says and every flag it sets is unreachable")

    # 11b. And the consequence, stated separately because it is the one that
    #      makes a questline unfinishable rather than merely wasting prose: a
    #      flag an objective waits on needs a writer that can actually run.
    def flag_writes(node, out):
        """Every flag *written* under this node, as opposed to read."""
        if isinstance(node, dict):
            written = node.get("setFlag")
            if isinstance(written, dict) and isinstance(written.get("flag"), str):
                out.add(written["flag"])
            for v in node.values():
                flag_writes(v, out)
        elif isinstance(node, list):
            for item in node:
                flag_writes(item, out)
        return out

    stranded = set()
    for dialogue_id in set(dialogues) - owned:
        stranded |= flag_writes(dialogues[dialogue_id], set())
    # A flag is only stranded if *nothing else* writes it. Subtract every
    # writer that is not in an unowned dialogue.
    live = flag_writes({k: v for k, v in doc.items() if k != "narrative"}, set())
    live |= flag_writes([d for i, d in dialogues.items() if i in owned], set())
    live |= flag_writes(doc["narrative"]["quests"], set())
    live |= flag_writes(doc["narrative"].get("arcs", []), set())
    stranded -= live

    for quest in quests:
        for flag in sorted(flag_refs(quest, set()) & stranded):
            problems.append(
                f"{quest['id']}: waits on flag {flag!r}, which is only ever "
                f"set inside a dialogue no NPC owns — this objective can "
                f"never complete")

    # --- report ------------------------------------------------------------
    if problems:
        print(f"✗ {len(problems)} problem(s) the schema cannot see\n")
        for problem in problems:
            print(f"  {problem}")
        return 1

    print(f"✓ {len(quests)} quests ({len(spine)} spine, {len(side)} side in "
          f"{len(chains)} chains, {len(hidden)} hidden, {len(trials)} trial in "
          f"{len(tiers)} tiers): every objective target resolves, every flag "
          f"waited on is set, the ending is reachable, and none of the optional "
          f"content touches it")
    print(f"✓ {len(tiers)} tiers behind the ending: an ordered ladder, each rung "
          f"gated on the one below, every door asking for a fabled relic worn, "
          f"and nothing playable before the ending reading a trial flag")
    print(f"✓ {len(lore)} clues in {len(threads)} threads: every one teachable, "
          f"two tellers in two areas each, and none of them names the place it "
          f"points at")
    for note in notes:
        print(note)
    if warnings:
        print(f"\n! {len(warnings)} unfinished:")
        for warning in warnings:
            print(f"  {warning}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
