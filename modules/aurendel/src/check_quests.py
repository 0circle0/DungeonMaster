#!/usr/bin/env python3
"""Check the references and the contracts `npm run validate` cannot.

    python3 check_quests.py

The generic half lives in `dmkit.lint`, which explains what the schema cannot
see and why. What is here is the part that is a fact about *Aurendel* rather
than about the engine: the two act gates, the XP curve the acts were tuned
against, the empty half of the map, and the three tiers.

It reads the built `module.json`, so it checks what actually shipped rather
than what the generator meant.

**The order of `CHECKS` is the order of the report.** Problems and warnings are
flat lists printed in append order, so the interleaving below is today's
message order and reordering it would be a diff in every future run.
"""
import _bootstrap  # noqa: F401  sys.path; must come first
import json  # noqa: E402
import os  # noqa: E402
import sys  # noqa: E402

from dmkit import lint  # noqa: E402
from dmkit.lint import flag_refs, objectives_of, walk  # noqa: E402

import hiddenspace  # noqa: E402
import postgame  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MODULE = os.path.join(ROOT, "modules/aurendel/module.json")

CONTRACT = lint.Contract(
    # The spine quests a side chain is allowed to name in `requires`: the act
    # gates from `acts.ACT_GATES`. Anything else means a chain has grown a
    # dependency on the story, which is the thing side content may not do.
    act_gate_quests={"the_open_door", "the_undercroft"},
    # `the_unsealed` is what the wards were built against. It has no rank
    # ladder, gates nothing, and is never gained — it exists so creatures have
    # a side. Exempt on purpose.
    exempt_factions={"the_unsealed"},
    tier_gates=postgame.TIER_GATES,
)

# The three tiers' own modules, for the post-game encounter check below.
TRIAL_MODULES = ("trial_one", "trial_two", "trial_three")
FINISHED = "aurendel_finished"


# --- 8. the XP budget, reported rather than asserted ----------------------

def xp_budget(ctx):
    """What a run banks by the end of each act, and the level it reaches."""
    acts = ["act1", "act2", "act3"]
    spine_xp = {a: sum(lint.xp_of(q) for q in ctx.spine if a in q.get("tags", []))
                for a in acts}
    side_xp = {a: sum(lint.xp_of(q) for q in ctx.side if a in q.get("tags", []))
               for a in acts}

    # Two places in the spine authorise more than any one run can collect, and
    # counting what is written rather than what is banked would overstate a
    # party's level by most of a tier. Act I forks into the Crown's commission
    # or the Library's errand and you take exactly one; Act II writes three ward
    # routes and asks for any two.
    branch_xp = sum(lint.xp_of(q) for q in ctx.spine
                    if "act1" in q.get("tags", []) and "branch" in q.get("tags", []))
    spine_run = dict(spine_xp)
    spine_run["act1"] = spine_xp["act1"] - branch_xp // 2
    spine_run["act2"] = round(spine_xp["act2"] * 2 / 3)

    ctx.note("XP budget — what a run banks by the end of each act:")
    running_spine = running_all = 0
    for act in acts:
        running_spine += spine_run[act]
        running_all += spine_run[act] + side_xp[act]
        ctx.note(
            f"  {act}: spine {spine_run[act]:>5}  side {side_xp[act]:>5}   "
            f"→ level {ctx.level_at(running_spine):>2} straight through, "
            f"level {ctx.level_at(running_all):>2} doing everything")


# --- 9d. hidden threads stand on empty ground ----------------------------

def hidden_threads_stand_on_empty_ground(ctx):
    """Nothing hidden stands on ground a questline already uses.

    `hiddenspace.EMPTY` is the frozen snapshot of the areas neither the spine
    nor a side chain touches — the sixty-one places a thread is allowed to use.
    """
    empty = set(hiddenspace.areas())
    for quest in ctx.hidden:
        for objective in objectives_of(quest):
            target = objective.get("target")
            if objective.get("kind") != "reach" or not target:
                continue
            where = ctx.area_of(target) or (target if target in ctx.areas else None)
            if where and where not in empty:
                ctx.problem(
                    f"{quest['id']}/{objective['id']}: {target!r} is in "
                    f"{where!r}, which a questline already uses — hidden "
                    f"threads go in the empty half of the map")
    for npc_id, npc in ctx.npcs.items():
        did = npc.get("dialogue", "")
        if not did.startswith("frost_") and not did.startswith("hidden_"):
            continue
        where = ctx.area_of(npc.get("home", ""))
        if where and where not in empty:
            ctx.problem(
                f"{npc_id}: lives in {where!r}, which a questline already uses")


# --- 9g. nothing playable early reads a hidden flag ----------------------

def nothing_early_reads_a_hidden_flag(ctx):
    """The hidden quests and the `frost_` gates own their flags."""
    hidden_flags = set()
    for quest in ctx.hidden:
        hidden_flags |= walk(quest, "flag", set())
    for gate in ctx.gates:
        if gate["id"].startswith("frost_"):
            hidden_flags |= walk(gate, "flag", set())
    for quest in ctx.spine + ctx.side:
        read = flag_refs(quest, set())
        for flag in sorted(read & hidden_flags):
            ctx.problem(
                f"{quest['id']}: reads {flag!r}, which a hidden thread owns — "
                f"the main line would then wait on content nobody offers")


# --- 10b. trials own the `trial_` prefix ---------------------------------

def trials_own_their_prefix(ctx):
    """Written, not merely mentioned.

    `walk(..., "flag")` cannot tell a `setFlag` from a `requires.flags[].flag`,
    and every trial door reads `aurendel_finished` on purpose — that is the
    gate, not a trespass. So this reads writes only.
    """
    trial_flags = set()
    for quest in ctx.trials:
        lint.flag_writes(quest, trial_flags)
    for gate in ctx.gates:
        if "trial" in (gate.get("tags") or []):
            lint.flag_writes(gate, trial_flags)
    for flag in sorted(trial_flags):
        if not flag.startswith("trial_"):
            ctx.problem(
                f"trial content owns the flag {flag!r}, which is not prefixed "
                f"'trial_' — the prefix is what makes the next check a string "
                f"comparison instead of a dataflow analysis")
    for quest in ctx.spine + ctx.side + ctx.hidden:
        for flag in sorted(flag_refs(quest, set()) & trial_flags):
            ctx.problem(
                f"{quest['id']}: reads {flag!r}, which a trial owns — content "
                f"playable before the ending would then wait on content that "
                f"only exists after it")


# --- 10e. post-game encounter groups are gated on the ending -------------

def post_game_groups_are_gated(ctx):
    """A group left out of the gating is a level-nineteen monster in Act I."""
    for module_name in TRIAL_MODULES:
        module = __import__(module_name)
        for table_id in {t for tables in getattr(module, "AREA_ENCOUNTERS", {}).values()
                         for t in tables}:
            table = next((t for t in ctx.doc["world"]["encounterTables"]
                          if t["id"] == table_id), None)
            if not table:
                ctx.problem(f"{module_name}: no encounter table {table_id!r}")
                continue
            for group in table["groups"]:
                if FINISHED not in json.dumps(group.get("requires", {})):
                    ctx.problem(
                        f"{table_id}/{group['id']}: a post-game group that is "
                        f"not gated on the ending — this draws in Act I")


# The order of this list is the order of the report, which is why it is spelled
# out rather than concatenated from two halves: today's message order
# interleaves them, and a reordering would be a diff in every future run.
CHECKS = [
    lint.objective_targets,                   # §1
    lint.flags_have_writers,                  # §2
    lint.everything_is_startable,             # §3
    lint.ending_is_reachable,                 # §3
    lint.ending_is_skippable,                 # §4
    lint.spine_does_not_unlock_side,          # §4
    lint.chain_flags_are_owned,               # §4
    lint.spine_does_not_read_side_flags,      # §4
    lint.chains_are_contained,                # §5
    lint.chains_have_one_head,                # §6
    lint.factions_are_used,                   # §7   (warnings)
    xp_budget,                                # §8   (notes)
    lint.clues_are_teachable,                 # §9a
    lint.clues_do_not_name_their_anchor,      # §9b
    lint.threads_have_two_tellers,            # §9c
    hidden_threads_stand_on_empty_ground,     # §9d
    lint.key_items_have_two_routes,           # §9e
    lint.standing_is_a_price,                 # §9f
    nothing_early_reads_a_hidden_flag,        # §9g
    lint.boss_rooms_have_a_table,             # §9h  (warnings)
    lint.kill_targets_spawn,                  # §9j
    lint.thread_anchors_come_down,            # §9i
    lint.ending_does_not_need_a_trial,        # §10a
    trials_own_their_prefix,                  # §10b
    lint.tiers_are_a_ladder,                  # §10c
    lint.tier_doors_want_a_relic,             # §10d
    post_game_groups_are_gated,               # §10e
    lint.unowned_dialogues,                   # §11a
    lint.stranded_flags,                      # §11b
]


def main():
    with open(MODULE) as f:
        doc = json.load(f)
    ctx = lint.run(doc, CHECKS, CONTRACT)
    return lint.report(ctx, headline=[
        f"✓ {len(ctx.quests)} quests ({len(ctx.spine)} spine, {len(ctx.side)} side in "
        f"{len(ctx.chains)} chains, {len(ctx.hidden)} hidden, {len(ctx.trials)} trial in "
        f"{len(ctx.tiers)} tiers): every objective target resolves, every flag "
        f"waited on is set, the ending is reachable, and none of the optional "
        f"content touches it",
        f"✓ {len(ctx.tiers)} tiers behind the ending: an ordered ladder, each rung "
        f"gated on the one below, every door asking for a fabled relic worn, "
        f"and nothing playable before the ending reading a trial flag",
        f"✓ {len(ctx.lore)} clues in {len(ctx.threads)} threads: every one teachable, "
        f"two tellers in two areas each, and none of them names the place it "
        f"points at",
    ])


if __name__ == "__main__":
    sys.exit(main())
