"""Hand-drawn interiors: ASCII art in, a `maps/<id>/` folder out."""
import json
import os

class Map:
    """One hand-drawn interior."""

    # Declared, never assigned: a subclass must supply all three.
    TERRAIN: dict
    MARKER: dict
    IMPASSABLE: set

    def __init__(self, mid, name, description, art, gates=None):
        if any(getattr(self, attr, None) is None
               for attr in ("TERRAIN", "MARKER", "IMPASSABLE")):
            raise TypeError(
                f"{type(self).__name__} must define TERRAIN, MARKER and "
                f"IMPASSABLE — they are a world's terrain vocabulary, and "
                f"`dmkit.maps` has none of its own")
        self.id = mid
        self.name = name
        self.description = description
        self.art = [row for row in art.strip("\n").split("\n")]
        self.gates = gates or {}
        widths = {len(row) for row in self.art}
        if len(widths) != 1:
            raise ValueError(f"{mid}: ragged art, row widths {sorted(widths)}")
        for y, row in enumerate(self.art):
            for x, ch in enumerate(row):
                if ch not in self.TERRAIN:
                    raise ValueError(f"{mid}: unknown art character {ch!r} at {x},{y}")
        if not any(ch in self.MARKER for row in self.art for ch in row):
            raise ValueError(f"{mid}: no entry marker")
        self._check_reachable()

    def _check_reachable(self):
        """Fail here rather than in the linter."""
        height, width = len(self.art), len(self.art[0])
        walkable = {(x, y) for y in range(height) for x in range(width)
                    if self.TERRAIN[self.art[y][x]] not in self.IMPASSABLE}
        start = next((x, y) for y in range(height) for x in range(width)
                     if self.art[y][x] in self.MARKER)
        if start not in walkable:
            raise ValueError(f"{self.id}: entry marker is on impassable terrain")
        seen, stack = {start}, [start]
        while stack:
            x, y = stack.pop()
            for spot in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if spot in walkable and spot not in seen:
                    seen.add(spot)
                    stack.append(spot)
        stranded = sorted(walkable - seen)
        if stranded:
            raise ValueError(
                f"{self.id}: {len(stranded)} tile(s) sealed off from the entry, "
                f"first at {stranded[0]}")

    def layer(self, pick):
        return [[pick(ch) for ch in row] for row in self.art]

    def write(self, root):
        """Write `<root>/<id>/`."""
        folder = os.path.join(root, self.id)
        os.makedirs(folder, exist_ok=True)
        layers = [("terrain", "terrain.csv", lambda ch: self.TERRAIN[ch]),
                  ("markers", "markers.csv", lambda ch: self.MARKER.get(ch, ""))]
        if self.gates:
            layers.append(("gates", "gates.csv",
                           lambda ch: self.gates.get(ch, "")))
        manifest = {"id": self.id, "name": self.name,
                    "description": self.description, "entry": "entry",
                    "layers": []}
        for kind, filename, pick in layers:
            rows = self.layer(pick)
            with open(os.path.join(folder, filename), "w") as f:
                f.write("\n".join(",".join(row) for row in rows) + "\n")
            manifest["layers"].append({"kind": kind, "name": kind, "file": filename})
        with open(os.path.join(folder, "map.json"), "w") as f:
            json.dump(manifest, f, indent=2)
            f.write("\n")
        return f"{self.id} ({len(self.art[0])}x{len(self.art)})"


def write_all(maps, root):
    """Write every map under `root`, in order."""
    os.makedirs(root, exist_ok=True)
    return [entry.write(root) for entry in maps]
