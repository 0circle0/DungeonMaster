"""Factions: a power that holds ground and has an opinion about you."""


def regional(fid, name, description, *, standing=0, decay=0.05, relations=None,
             ranks=()):
    """A power that holds one region and has an opinion about you."""
    return {"id": fid, "name": name, "description": description,
            "initialStanding": standing, "decayPerDay": decay,
            "relations": dict(relations or {}),
            "ranks": [{"id": r, "name": n, "atLeast": at} for r, n, at in ranks]}


def deed_kind(did, name, faction, severity, *, memorability=1.5, distortion=0.2):
    """Something you did that somebody saw."""
    return {"id": did, "name": name, "faction": faction, "severity": severity,
            "memorability": memorability, "distortion": distortion}


def standing_gate(faction, minimum, hint):
    """A dialogue option that shows what it would take, rather than hiding it."""
    return {"requires": {"factions": [{"faction": faction, "minStanding": minimum}]},
            "locked_hint": hint}
