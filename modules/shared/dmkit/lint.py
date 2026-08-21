"""Checks the contracts `npm run validate` cannot see.

The schema marks most cross-references with `ref(...)` and `compile.ts` turns an unresolved one into
a `dangling_ref` error. Three things it does not cover, each failing silently at play time:

  * `objective.target` is `idSchema`, not a ref. A `kill` objective naming a monster that does not
    exist compiles clean and never completes.
  * Flags are free strings, so `setFlag` writing `sisters_restord` and an objective waiting on
    `sisters_restored` both validate and the quest hangs.
  * Reachability. Every quest can be fine while the chain from the starting quest to the ending arc
    has a break in it.

Optional content is also defined by contract rather than by a field: `quest.tags` is read by
nothing, so the contract is asserted here.

A check is a function of one `Context`. It reports via `ctx.problem()` (a build stopper),
`ctx.warn()` (a to-do list) or `ctx.note()` (the report body). Both lists print in append order, so
the order of the check list is the report format — which is why this module ships no default list.
The caller owns it; see `modules/aurendel/src/check_quests.py`.

`Contract` holds the few module-specific facts a shared checker cannot know, passed in as data.
"""
import collections
import json
import re


# --- the walkers ----------------------------------------------------------
# Each takes a node and an accumulator, so they compose and can run over a single quest or the whole
# document.

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
    """Every flag read under this node, by either spelling.

    `{"ref": "flags.x"}` is the DSL predicate form; `requires.flags[].flag` is the structured gate.
    Content uses both and they mean the same thing.
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


def flag_writes(node, out):
    """Every flag written under this node, as opposed to read."""
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


def emits(node, out):
    """Every quest a `startQuest` event names.

    The fifth way into a quest, and the only way a hidden thread's begins: a dialogue option hands a
    job over, or a trigger starts one on arrival.
    """
    if isinstance(node, dict):
        if node.get("event") == "startQuest":
            target = (node.get("data") or {}).get("quest")
            if isinstance(target, str):
                out.add(target)
        for value in node.values():
            emits(value, out)
    elif isinstance(node, list):
        for item in node:
            emits(item, out)
    return out


def taught(node, out):
    """Every clue some `learnLore` teaches."""
    if isinstance(node, dict):
        if "learnLore" in node and isinstance(node["learnLore"], dict):
            entry = node["learnLore"].get("entry")
            if isinstance(entry, str):
                out.add(entry)
        for value in node.values():
            taught(value, out)
    elif isinstance(node, list):
        for item in node:
            taught(item, out)
    return out


def tables(node, out):
    """Every encounter or boss table id something actually draws from."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k in ("encounterTables", "bossTable"):
                if isinstance(v, str):
                    out.add(v)
                elif isinstance(v, list):
                    out.update(x for x in v if isinstance(x, str))
            tables(v, out)
    elif isinstance(node, list):
        for item in node:
            tables(item, out)
    return out


def faction_gates(node, out):
    """Every faction some `requires` reads."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "factions" and isinstance(value, list):
                for clause in value:
                    if isinstance(clause, dict) and clause.get("faction"):
                        out.add(clause["faction"])
            faction_gates(value, out)
    elif isinstance(node, list):
        for item in node:
            faction_gates(item, out)
    return out


def wants_equipped(node):
    """Is there an `equipped: True` anywhere under this node?"""
    if isinstance(node, dict):
        if node.get("equipped") is True:
            return True
        return any(wants_equipped(v) for v in node.values())
    if isinstance(node, list):
        return any(wants_equipped(i) for i in node)
    return False


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


def xp_of(quest):
    value = quest.get("rewards", {}).get("xp", 0)
    return value if isinstance(value, int) else 0


# Which collection an objective's `target` is an id in, per `kind`. Read off `matchesEvent` in
# packages/engine/src/sim/quests.ts.
TARGET_COLLECTION = {
    "kill": ("content", "monsters"),
    "collect": ("content", "items"),
    "talk": ("content", "npcs"),
    # `reach` is matched as a substring of a map id, or against a trigger source, a gate, or a point
    # of interest.
    "reach": None,
}


# --- what a module's contracts are, as data -------------------------------

Contract = collections.namedtuple("Contract", [
    # Spine quests a chain may name in `requires` — the act gates. Anything else is a chain with a
    # dependency on the story.
    "act_gate_quests",
    # Factions allowed to gate nothing and be gained never: the side a monster belongs to, with no
    # rank ladder.
    "exempt_factions",
    # Tier key -> the `requires` clause that tier's head must state.
    "tier_gates",
], defaults=(frozenset(), frozenset(), {}))


class Context:
    """A built module, indexed, plus the three report channels.

    Everything expensive is computed once here rather than in whichever check needs it first, since
    most of it is wanted by more than one.
    """

    def __init__(self, doc, contract=Contract()):
        self.doc = doc
        self.contract = contract
        self.problems, self.warnings, self.notes = [], [], []

        # -- the document, indexed ---------------------------------------
        self.quests = doc["narrative"]["quests"]
        self.by_id = {q["id"]: q for q in self.quests}
        self.npcs = {n["id"]: n for n in doc["content"]["npcs"]}
        self.pois = {p["id"]: p for p in doc["world"]["pointsOfInterest"]}
        self.areas = {a["id"]: a for a in doc["world"]["areas"]}
        self.items = {i["id"]: i for i in doc["content"]["items"]}
        self.dialogues = {d["id"]: d for d in doc["narrative"]["dialogues"]}
        self.lore = {c["id"]: c for c in doc["narrative"].get("lore", [])}
        self.threads = doc["narrative"].get("loreThreads", [])
        self.gates = doc["world"]["gates"]
        self.factions = doc["content"].get("factions", [])
        self.levels = doc["rules"]["progression"]["levels"]
        self.ending = [a for a in doc["narrative"].get("arcs", [])
                       if a.get("isEnding")]

        self.known = {
            "monsters": ids(doc, "content", "monsters"),
            "items": ids(doc, "content", "items"),
            "npcs": ids(doc, "content", "npcs"),
            "pois": ids(doc, "world", "pointsOfInterest"),
            "areas": ids(doc, "world", "areas"),
            "dungeons": ids(doc, "world", "dungeons"),
            "gates": ids(doc, "world", "gates"),
            "triggers": walk(doc["world"], "id", set()),
        }

        # -- the four kinds of content, by the tags the kits write ---------
        # The spine is what is left when every kind of optional content is taken out. Each new kind
        # must be subtracted here as well as checked below, or it counts as spine in the XP budget
        # and escapes the skippability rules.
        self.side = [q for q in self.quests if "side" in q.get("tags", [])]
        self.hidden = [q for q in self.quests if "hidden" in q.get("tags", [])]
        self.trials = [q for q in self.quests if "trial" in q.get("tags", [])]
        self.spine = [q for q in self.quests
                      if not {"side", "hidden", "trial"} & set(q.get("tags", []))]
        self.side_ids = {q["id"] for q in self.side}
        self.trial_ids = {q["id"] for q in self.trials}

        # A chain is the set of quests sharing a key; the key is the third tag `dmkit.chains.chain`
        # writes, after "side" and the act. A tier is the second tag `dmkit.trials.tier` writes,
        # after "trial".
        self.chains = {}
        for quest in self.side:
            tags = quest.get("tags", [])
            if len(tags) < 4:
                self.problem(
                    f"{quest['id']}: tagged side but not by dmkit.chains.chain — "
                    f"expected [side, act, key, region], got {tags}")
                continue
            self.chains.setdefault(tags[2], []).append(quest)
        self.chain_keys = set(self.chains)

        self.tiers = {}
        for quest in self.trials:
            tags = quest.get("tags", [])
            if len(tags) < 2:
                self.problem(
                    f"{quest['id']}: tagged trial but not by dmkit.trials.tier — "
                    f"expected [trial, key], got {tags}")
                continue
            self.tiers.setdefault(tags[1], []).append(quest)

        # -- derived facts several checks want -----------------------------
        self.offers = {}
        for npc in doc["content"].get("npcs", []):
            for quest_id in npc.get("offersQuests", []):
                self.offers.setdefault(quest_id, []).append(npc["id"])

        # Where everything is, so a `reach` resolves to a region. Areas carry their region as the
        # first tag; a point of interest inherits its area's; a dungeon and a gate inherit from the
        # point of interest that leads there.
        self.region_of = {}
        for area in doc["world"]["areas"]:
            tags = area.get("tags") or []
            if tags:
                self.region_of[area["id"]] = tags[0]
        for poi in doc["world"]["pointsOfInterest"]:
            region = self.region_of.get(poi.get("area"))
            if not region:
                continue
            self.region_of[poi["id"]] = region
            for field in ("dungeon", "gate"):
                if poi.get(field):
                    self.region_of[poi[field]] = region
            for trigger in poi.get("triggers", []):
                self.region_of[trigger["id"]] = region

        self.emitted = emits(doc, set())
        self.reachable = self._reachable()
        self.spawnable = self._spawnable()
        self.owned_dialogues = self._owned_dialogues()
        self.stranded_flags = self._stranded_flags()

    # -- reporting -------------------------------------------------------
    def problem(self, message):
        self.problems.append(message)

    def warn(self, message):
        self.warnings.append(message)

    def note(self, message):
        self.notes.append(message)

    # -- helpers ---------------------------------------------------------
    def area_of(self, poi_id):
        return self.pois.get(poi_id, {}).get("area")

    def level_at(self, xp):
        return level_for(self.levels, xp)

    def _reachable(self):
        """Every quest something can start, and everything those unlock."""
        frontier = []
        for quest in self.quests:
            if (quest.get("autoStart") or quest.get("giver")
                    or quest["id"] in self.emitted):
                frontier.append(quest["id"])
        for quest in self.quests:
            for npc in self.doc["content"].get("npcs", []):
                if quest["id"] in npc.get("offersQuests", []):
                    frontier.append(quest["id"])

        reachable = set()
        while frontier:
            current = frontier.pop()
            if current in reachable:
                continue
            reachable.add(current)
            frontier.extend(self.by_id.get(current, {}).get("unlocks", []))
        return reachable

    def _spawnable(self):
        """Every monster some table that is actually drawn from can produce."""
        reachable_tables = tables(self.doc, set())
        out = set()
        for table in self.doc["world"]["encounterTables"]:
            if table["id"] not in reachable_tables:
                continue
            for group in table.get("groups", []):
                for entry in group.get("entries", []):
                    out.add(entry["monster"])
        return out

    def _owned_dialogues(self):
        owned = {npc["dialogue"] for npc in self.npcs.values()
                 if npc.get("dialogue")}
        # Anything else in the document that names a dialogue counts as an owner too, so a future
        # way of opening one does not read as a fault.
        owned |= walk(self.doc["world"], "dialogue", set())
        owned |= walk(self.doc["narrative"], "dialogue", set())
        return owned

    def _stranded_flags(self):
        """Flags only ever written inside a dialogue no NPC owns."""
        stranded = set()
        for dialogue_id in set(self.dialogues) - self.owned_dialogues:
            stranded |= flag_writes(self.dialogues[dialogue_id], set())
        # A flag is stranded only if nothing else writes it, so subtract every writer that is not in
        # an unowned dialogue.
        live = flag_writes({k: v for k, v in self.doc.items()
                            if k != "narrative"}, set())
        live |= flag_writes([d for i, d in self.dialogues.items()
                             if i in self.owned_dialogues], set())
        live |= flag_writes(self.doc["narrative"]["quests"], set())
        live |= flag_writes(self.doc["narrative"].get("arcs", []), set())
        return stranded - live


# --- 1. objective targets -------------------------------------------------

def objective_targets(ctx):
    """Every `target` names something that exists, per the objective's kind."""
    for quest in ctx.quests:
        for objective in objectives_of(quest):
            target = objective.get("target")
            if not target:
                continue
            where = f"{quest['id']}/{objective['id']}"
            kind = objective.get("kind", "custom")
            collection = TARGET_COLLECTION.get(kind)
            if collection:
                pool = ctx.known[collection[1]]
                if target not in pool:
                    ctx.problem(
                        f"{where}: {kind} target {target!r} is not a "
                        f"{collection[1][:-1]}")
            elif kind == "reach":
                # Any of the four things `reach` can match.
                anywhere = (ctx.known["pois"] | ctx.known["areas"]
                            | ctx.known["dungeons"] | ctx.known["gates"]
                            | ctx.known["triggers"])
                if target not in anywhere:
                    ctx.problem(
                        f"{where}: reach target {target!r} is not a point of "
                        f"interest, area, dungeon, gate, or trigger")


# --- 2. flags: written somewhere, waited on somewhere ---------------------

def flags_have_writers(ctx):
    written = walk(ctx.doc, "flag", set())
    refs = flag_refs(ctx.doc["narrative"], set())
    flag_refs(ctx.doc["world"], refs)
    for flag in sorted(refs - written):
        ctx.problem(
            f"flag {flag!r} is waited on but never set by anything — the "
            f"objective or gate reading it can never come true")


# --- 3. the chain from the start to the ending ---------------------------

def everything_is_startable(ctx):
    for quest in ctx.quests:
        if quest["id"] not in ctx.reachable:
            ctx.problem(
                f"{quest['id']}: nothing starts it — no giver, no autoStart, "
                f"and nothing unlocks it")


def ending_is_reachable(ctx):
    if not ctx.ending:
        ctx.problem("no arc is marked isEnding, so the game cannot be won")
    for arc in ctx.ending:
        for quest_id in arc["quests"]:
            if quest_id not in ctx.reachable:
                ctx.problem(
                    f"{arc['id']}: the ending needs {quest_id}, which nothing "
                    f"starts")


# --- 4. skippable ---------------------------------------------------------

def ending_is_skippable(ctx):
    for arc in ctx.ending:
        for quest_id in arc["quests"]:
            if quest_id in ctx.side_ids:
                ctx.problem(
                    f"{arc['id']}: the ending arc contains {quest_id}, which is "
                    f"side content — the game cannot require optional work")


def spine_does_not_unlock_side(ctx):
    for quest in ctx.spine:
        for unlocked in quest.get("unlocks", []):
            if unlocked in ctx.side_ids:
                ctx.problem(
                    f"{quest['id']}: a spine quest unlocks the side quest "
                    f"{unlocked} — side content must be offered, not woven in")


def chain_flags_are_owned(ctx):
    """Every flag a chain writes carries its key as a prefix. That convention makes "does the spine
    wait on side content?" a string comparison instead of a dataflow analysis.
    """
    for key, members in ctx.chains.items():
        for quest in members:
            for flag in sorted(walk(quest, "flag", set())):
                if not flag.startswith(f"{key}_"):
                    ctx.problem(
                        f"{quest['id']}: writes or reads the flag {flag!r}, "
                        f"which is not prefixed {key!r} — a side chain must not "
                        f"touch flags it does not own")


def spine_does_not_read_side_flags(ctx):
    for quest in ctx.spine:
        for flag in sorted(flag_refs(quest, set()) | walk(quest, "flag", set())):
            owner = next((k for k in ctx.chain_keys
                          if flag.startswith(f"{k}_")), None)
            if owner:
                ctx.problem(
                    f"{quest['id']}: a spine quest reads {flag!r}, owned by the "
                    f"{owner} chain — the spine would then need side content")


# --- 5. act containment ---------------------------------------------------

def chains_are_contained(ctx):
    """One act, one region, no dependency on the story, and never expiring."""
    for key, members in ctx.chains.items():
        acts = {q["tags"][1] for q in members}
        regions = {q["tags"][3] for q in members}
        if len(acts) > 1:
            ctx.problem(f"{key}: spans acts {sorted(acts)} — a chain is one act")
        if len(regions) > 1:
            ctx.problem(f"{key}: spans regions {sorted(regions)} — a chain is one region")
        region = sorted(regions)[0]

        for quest in members:
            for objective in objectives_of(quest):
                if objective.get("kind") != "reach":
                    continue
                target = objective.get("target")
                where = ctx.region_of.get(target)
                if where and where != region:
                    ctx.problem(
                        f"{quest['id']}/{objective['id']}: reaches {target!r} in "
                        f"{where}, but the {key} chain belongs to {region}")

            for gate in (quest.get("requires") or {}).get("quests", []):
                named = gate.get("quest")
                if named in ctx.contract.act_gate_quests:
                    continue
                if named not in {q["id"] for q in members}:
                    ctx.problem(
                        f"{quest['id']}: requires {named!r}, which is neither an "
                        f"act gate nor part of the {key} chain")

            if quest.get("timeLimitDays"):
                # `expireQuests` in sim/agenda.ts never runs `onFail`, so a chain that can expire is
                # a chain that can be missed.
                ctx.problem(
                    f"{quest['id']}: side content must not expire "
                    f"(timeLimitDays is set, and onFail would not run anyway)")


# --- 6. chain integrity ---------------------------------------------------

def chains_have_one_head(ctx):
    for key, members in ctx.chains.items():
        # Declaration order survives the build, so the head is the one nothing else in the chain
        # unlocks.
        unlocked_within = {u for q in members for u in q.get("unlocks", [])
                           if u in {m["id"] for m in members}}
        heads = [q for q in members if q["id"] not in unlocked_within]
        if len(heads) != 1:
            ctx.problem(
                f"{key}: expected exactly one head, found "
                f"{sorted(q['id'] for q in heads)}")
            continue
        head = heads[0]
        giver = head.get("giver")
        if not giver:
            ctx.problem(f"{head['id']}: the head of {key} has no giver")
        elif (head["id"] not in ctx.offers.get(head["id"], [])
                and giver not in ctx.offers.get(head["id"], [])):
            ctx.problem(
                f"{head['id']}: {giver} is its giver but does not list it in "
                f"offersQuests, so nothing will offer it in play")

        for quest in members:
            if quest["id"] == head["id"]:
                continue
            if quest["id"] not in unlocked_within:
                ctx.problem(
                    f"{quest['id']}: nothing in the {key} chain unlocks it")


# --- 7. no faction is decoration -----------------------------------------

def factions_are_used(ctx):
    """Every faction is moved, deeded, and gated on somewhere. Warnings rather than errors: a
    dangling objective target makes a game unwinnable, while a faction nobody gates on is merely
    unfinished.
    """
    moved = walk(ctx.doc, "faction", set())
    for reward in ctx.quests:
        moved.update(reward.get("rewards", {}).get("reputation", {}).keys())
    deeded = {d.get("faction") for d in ctx.doc["narrative"].get("deedKinds", [])}
    gating = faction_gates(ctx.doc, set())

    for faction in ctx.factions:
        fid = faction["id"]
        if fid in ctx.contract.exempt_factions:
            continue
        if fid not in moved:
            ctx.warn(f"faction {fid}: nothing ever moves your standing with it")
        if fid not in deeded:
            ctx.warn(
                f"faction {fid}: no deed kind names it, so nobody ever witnesses "
                f"or gossips about what you did for it")
        if fid not in gating:
            ctx.warn(
                f"faction {fid}: no requirement anywhere reads it, so standing "
                f"with it buys nothing")


# --- 9. the hidden threads ------------------------------------------------
# A hidden thread has no giver and no visible arc, so every guarantee a side chain gets from being
# offered is asserted here instead. Each of these failures validates cleanly and is invisible until
# somebody plays for hours and finds nothing.

def clues_are_teachable(ctx):
    """9a. Every clue is taught by something."""
    for cid in sorted(set(ctx.lore) - taught(ctx.doc, set())):
        ctx.problem(f"clue {cid!r} is taught by nothing, so it can never be learned")


def clues_do_not_name_their_anchor(ctx):
    """9b. No clue names the place it points at.

    The mechanical half of "a clue is true and partial": text containing the name or id of a point
    of interest is a waypoint marker rather than a clue.

    Two tests. Any raw point-of-interest id in a clue is wrong. Display names are checked only
    against the anchors of the clue's own thread, since common landmark names would otherwise forbid
    ordinary English.
    """
    anchor_names = {}
    for thread in ctx.threads:
        key = f'threads.{thread["id"]}.known'
        named = [p["name"] for p in ctx.pois.values()
                 if key in json.dumps(p.get("discover", {}))]
        for entry_id in thread["entries"]:
            anchor_names[entry_id] = named

    for cid, entry in sorted(ctx.lore.items()):
        text = f"{entry.get('name', '')} {entry.get('description', '')}".lower()
        hit = next((p for p in ctx.pois if p in text), None)
        if hit:
            ctx.problem(
                f"clue {cid!r} contains the id {hit!r} — a clue is prose, not "
                f"a reference")
            continue
        for name in anchor_names.get(cid, []):
            bare = re.sub(r"^the\s+", "", name.strip(), flags=re.I).lower()
            if len(bare) >= 5 and re.search(rf"\b{re.escape(bare)}\b", text):
                ctx.problem(
                    f"clue {cid!r} names its own anchor ({name!r}) — a clue "
                    f"points, it does not direct")
                break


def threads_have_two_tellers(ctx):
    """9c. Two tellers, in two areas, so a thread does not die with one missed conversation."""
    for thread in ctx.threads:
        entries = set(thread["entries"])
        tellers = []
        for npc_id, npc in ctx.npcs.items():
            did = npc.get("dialogue")
            if not did:
                continue
            spoken = json.dumps(ctx.dialogues.get(did, {}))
            if any(f'"{e}"' in spoken for e in entries):
                tellers.append(npc_id)
        if len(tellers) < 2:
            ctx.problem(
                f"thread {thread['id']!r}: only {len(tellers)} teller(s); a "
                f"thread needs two so one missed conversation cannot end it")
        where = {ctx.area_of(ctx.npcs[t].get("home", "")) for t in tellers}
        if len(where) < 2:
            ctx.problem(
                f"thread {thread['id']!r}: every teller is in {where} — "
                f"spread them over two areas")


def key_items_have_two_routes(ctx):
    """9e. Every key item can be asked for, and taken off the body."""
    for item in ctx.items.values():
        holder = (item.get("extra") or {}).get("heldBy")
        if not holder:
            continue
        if holder not in ctx.npcs:
            ctx.problem(f"{item['id']}: holder {holder!r} is not an NPC")
            continue
        statblock = ctx.npcs[holder].get("statblock")
        if not statblock:
            ctx.problem(
                f"{item['id']}: {holder} has no statblock, so killing them "
                f"drops nothing and asking is the only route")
            continue
        table = next((m for m in ctx.doc["content"]["monsters"]
                      if m["id"] == statblock), {}).get("loot")
        drops = json.dumps(next((t for t in ctx.doc["content"]["lootTables"]
                                 if t["id"] == table), {}))
        if f'"{item["id"]}"' not in drops:
            ctx.problem(f"{item['id']}: {holder}'s statblock does not drop it")
        granted = json.dumps(ctx.doc["narrative"]["dialogues"])
        if f'"{item["id"]}"' not in granted:
            ctx.problem(
                f"{item['id']}: nobody can be asked for it, so killing is the "
                f"only route")


def standing_is_a_price(ctx):
    """9f. Standing is a price, never a wall. A `minStanding` in front of a clue or a key item is
    forbidden: hostility belongs in the check's difficulty, where it makes a roll harder rather
    than impossible.
    """
    keepsakes = {i["id"] for i in ctx.items.values()
                 if (i.get("extra") or {}).get("heldBy")}
    for dialogue in ctx.doc["narrative"]["dialogues"]:
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
                    ctx.problem(
                        f"{dialogue['id']}/{opt['id']}: a clue or key item "
                        f"behind minStanding — put the standing in the check's "
                        f"difficulty instead")


def boss_rooms_have_a_table(ctx):
    """9h. A boss room with nothing to draw from generates empty."""
    for dungeon in ctx.doc["world"]["dungeons"]:
        if not dungeon.get("bossTable"):
            ctx.warn(f"{dungeon['id']}: boss room with no bossTable")


def kill_targets_spawn(ctx):
    """9j. A kill objective needs something that actually spawns. That the monster exists does not
    prove anything puts it on a map, and an encounter table nothing references is invisible to
    every other check here.
    """
    for quest in ctx.hidden + ctx.side + ctx.trials:
        for objective in objectives_of(quest):
            if objective.get("kind") != "kill":
                continue
            target = objective.get("target")
            if target and target not in ctx.spawnable:
                ctx.problem(
                    f"{quest['id']}/{objective['id']}: nothing spawns {target!r} — "
                    f"no table any place, area, biome or dungeon draws from "
                    f"contains it, so the objective can never complete")


def thread_anchors_come_down(ctx):
    """9i. Each thread's anchor gets easier to find as the thread fills."""
    for thread in ctx.threads:
        key = f'threads.{thread["id"]}.known'
        anchors = [p for p in ctx.pois.values()
                   if key in json.dumps(p.get("discover", {}))]
        if not anchors:
            ctx.problem(
                f"thread {thread['id']!r}: no place gets easier to find as it "
                f"fills, so the clues inform nothing")


# --- 10. the trials -------------------------------------------------------

def ending_does_not_need_a_trial(ctx):
    """10a. Nothing about the ending may depend on post-game content."""
    for arc in ctx.ending:
        for quest_id in arc["quests"]:
            if quest_id in ctx.trial_ids:
                ctx.problem(
                    f"{arc['id']}: the ending arc contains {quest_id}, which is "
                    f"post-game content the ending is the gate for")


def tiers_are_a_ladder(ctx):
    """10c. Ordered, gated on the rung below, and offered by somebody. `unlocks` marks a quest
    available and does not gate starting it, so each head states its own gate.
    """
    for key, members in sorted(ctx.tiers.items()):
        unlocked_within = {u for q in members for u in q.get("unlocks", [])
                           if u in {m["id"] for m in members}}
        heads = [q for q in members if q["id"] not in unlocked_within]
        if len(heads) != 1:
            ctx.problem(
                f"{key}: expected exactly one head, found "
                f"{sorted(q['id'] for q in heads)}")
            continue
        head = heads[0]
        giver = head.get("giver")
        if not giver:
            ctx.problem(f"{head['id']}: the head of {key} has no giver")
        elif giver not in ctx.offers.get(head["id"], []):
            # `giver` is a label; `offersQuests` is what puts the job in front of a player. A tier
            # with the first and not the second is offered by nobody.
            ctx.problem(
                f"{head['id']}: {giver} is its giver but does not list it in "
                f"offersQuests, so nothing will offer it in play")

        wanted = ctx.contract.tier_gates.get(key, {})
        gate = head.get("requires") or {}
        for field, clauses in wanted.items():
            if json.dumps(clauses) not in json.dumps(gate.get(field, [])):
                ctx.problem(
                    f"{head['id']}: the head of {key} does not require "
                    f"{clauses} — the rung below it is not the gate")

        for quest in members:
            if quest["id"] != head["id"] and quest["id"] not in unlocked_within:
                ctx.problem(
                    f"{quest['id']}: nothing in the {key} tier unlocks it")


def tier_doors_want_a_relic(ctx):
    """10d. Every tier's door asks for the relic to be equipped, not merely owned."""
    for key in sorted(ctx.tiers):
        doors = [g for g in ctx.gates
                 if "trial" in (g.get("tags") or []) and key in json.dumps(g)]
        if not any(wants_equipped(g.get("requires", {})) for g in doors):
            gated = [g["id"] for g in doors]
            ctx.problem(
                f"{key}: no door asks for a relic equipped (gates: {gated or 'none'}) "
                f"— a tier tuned for fabled gear must check for it")


# --- 11. content that exists and cannot be reached ------------------------
# Whether a flag is written anywhere is not the same question as whether the writing can ever run. A
# dialogue that is the only writer of a flag and belongs to no NPC passes every other check here.

def unowned_dialogues(ctx):
    """11a. A dialogue nobody owns cannot be opened. `talk` is the only way in and it goes through
    an NPC.
    """
    for dialogue_id in sorted(set(ctx.dialogues) - ctx.owned_dialogues):
        ctx.problem(
            f"dialogue {dialogue_id!r} belongs to no NPC — nothing can open "
            f"it, so everything it says and every flag it sets is unreachable")


def stranded_flags(ctx):
    """11b. A flag an objective waits on needs a writer that can actually run. Separate from 11a
    because this makes a questline unfinishable rather than merely wasting prose.
    """
    for quest in ctx.quests:
        for flag in sorted(flag_refs(quest, set()) & ctx.stranded_flags):
            ctx.problem(
                f"{quest['id']}: waits on flag {flag!r}, which is only ever "
                f"set inside a dialogue no NPC owns — this objective can "
                f"never complete")


# --- running and reporting ------------------------------------------------

def run(doc, checks, contract=Contract()):
    """Build a `Context` and run every check against it, in order."""
    ctx = Context(doc, contract)
    for check in checks:
        check(ctx)
    return ctx


def report(ctx, headline=()):
    """Print the result and return the exit code. Problems first and alone, then the caller's
    headline sentences, then the notes, then the warnings.
    """
    if ctx.problems:
        print(f"✗ {len(ctx.problems)} problem(s) the schema cannot see\n")
        for problem in ctx.problems:
            print(f"  {problem}")
        return 1

    for line in headline:
        print(line)
    for note in ctx.notes:
        print(note)
    if ctx.warnings:
        print(f"\n! {len(ctx.warnings)} unfinished:")
        for warning in ctx.warnings:
            print(f"  {warning}")
    return 0
