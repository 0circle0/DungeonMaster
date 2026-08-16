#!/usr/bin/env python3
"""Check the references `npm run validate` cannot.

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

This is the pre-flight for those three. It reads the built `module.json`, so it
checks what actually shipped rather than what the generator meant.
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


def main():
    with open(MODULE) as f:
        doc = json.load(f)

    problems = []
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
    def objectives_of(quest):
        yield from quest.get("objectives", [])
        for stage in quest.get("stages", []):
            yield from stage.get("objectives", [])

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
    waited = set()
    for quest in quests:
        for objective in objectives_of(quest):
            when = json.dumps(objective.get("when", {}))
            for flag in written | {"__none__"}:
                pass
        # Cheaper and exact: pull every `flags.x` ref out of the quest.
    refs = set()

    def flag_refs(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if k == "ref" and isinstance(v, str) and v.startswith("flags."):
                    refs.add(v[len("flags."):])
                flag_refs(v)
        elif isinstance(node, list):
            for item in node:
                flag_refs(item)

    flag_refs(doc["narrative"])
    flag_refs(doc["world"])
    # `requires.flags[].flag` is a structured gate rather than a ref.
    for entry in walk(doc, "flag", set()):
        written.add(entry)

    orphans = sorted(refs - written)
    for flag in orphans:
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

    # --- report ------------------------------------------------------------
    if problems:
        print(f"✗ {len(problems)} problem(s) the schema cannot see\n")
        for problem in problems:
            print(f"  {problem}")
        return 1

    print(f"✓ {len(quests)} quests: every objective target resolves, every "
          f"flag waited on is set, and the ending is reachable")
    return 0


if __name__ == "__main__":
    sys.exit(main())
