"""Emitting a module document.

`extends: "<base>@1.0.0"` is the obvious way to get a ruleset in, and it does
not survive validation: `npm run validate` lints the **raw** document before
resolving extends (bin/validate.ts:59 → diagnostics/lint.ts:1023), so a child
that leans on its parent for `rules` fails the schema pass with "attributes is
required", and `$delete` markers fail it too — only `mods` may carry those in a
raw document.

So a base ruleset is *composed in* rather than inherited: the base module stays
canonical on disk and a build copies its rules, its character content and its
system text into the world. One source of truth, two standalone modules on
disk, which is what the tooling wants.
"""
import collections
import json
import os


def load_base(path):
    """The base module document, read whole."""
    with open(path) as f:
        return json.load(f)


def text_grammar(*pool_lists):
    """Merge text-grammar pools: first spelling of an id wins, sorted by id.

    Sorted because a diff of a multi-megabyte document is only useful if the
    order is a function of the content rather than of the import graph.
    """
    seen, merged = set(), []
    for entries in pool_lists:
        for entry in entries:
            if entry["id"] in seen:
                continue
            seen.add(entry["id"])
            merged.append(entry)
    merged.sort(key=lambda e: e["id"])
    return merged


def document(*, module_id, version, engine, meta, rules, content, world,
             narrative, start, extends=None, fmt=1):
    """The document, in the key order the schema reads and a diff wants."""
    doc = collections.OrderedDict()
    doc["format"] = fmt
    doc["id"] = module_id
    doc["version"] = version
    doc["engine"] = engine
    doc["extends"] = extends
    doc["meta"] = meta
    doc["rules"] = rules
    doc["content"] = content
    doc["world"] = world
    doc["narrative"] = narrative
    doc["start"] = start
    return doc


def write(doc, out_dir, *, name="module.json", indent=2):
    """Write the document and return the path."""
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    with open(path, "w") as f:
        json.dump(doc, f, indent=indent)
        f.write("\n")
    return path
