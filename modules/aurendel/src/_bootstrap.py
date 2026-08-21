"""Put this directory and `modules/shared` on `sys.path`."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SHARED = os.path.join(ROOT, "modules", "shared")

# Removed before inserting, so the order is true even when HERE is already at index 0.
for path in (SHARED, HERE):
    if path in sys.path:
        sys.path.remove(path)
    sys.path.insert(0, path)
