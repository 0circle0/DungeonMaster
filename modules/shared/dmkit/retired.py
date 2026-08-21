"""Refuse to overwrite a module that has been handed over to its `project/`."""

import os
import sys


def refuse_if_handed_over(out_dir):
    """Stop unless `--force`, when `out_dir` already has a `project/`."""
    if not os.path.isdir(os.path.join(out_dir, "project")):
        return
    if "--force" in sys.argv:
        return

    name = os.path.basename(out_dir.rstrip(os.sep))
    sys.stderr.write(
        f"x {name} is authored as {name}/project now, and this generator "
        f"overwrites module.json.\n"
        f"  Edit the project files and run: npm run project -- build modules/{name}\n"
        f"  Pass --force only if you mean to discard what is in project/.\n"
    )
    raise SystemExit(1)
