"""Refuse to overwrite a module that has been handed over to its `project/`.

These generators write `module.json` wholesale. Once a module has a `project/`
beside it, that tree is the source of truth and `module.json` is built from it
by `npm run project -- build` — so a generator run would throw away whatever has
been authored since the handover, and the only thing that would notice is
`project.test.ts` failing some time later.

Kept rather than deleted because these files are still the only home for what
was never ported: `lint.py`'s contract checks, the map reachability flood fill,
the caverns and BSP sizing, the post-game ladder, and two-way road expansion.
They are how these worlds were first built, not how they are maintained.
"""

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
