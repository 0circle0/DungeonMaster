"""Emitting a module document."""
import collections
import json
import os


def load_base(path):
    """The base module document, read whole."""
    with open(path) as f:
        return json.load(f)


def text_grammar(*pool_lists):
    """Merge text-grammar pools: first spelling of an id wins, sorted by id."""
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


def jsonable(value):
    """A document Python and JavaScript serialize identically."""
    if isinstance(value, bool):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [jsonable(v) for v in value]
    return value


def write(doc, out_dir, *, name="module.json", indent=2):
    """Write the document and return the path."""
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(jsonable(doc), f, indent=indent, ensure_ascii=False)
        f.write("\n")
    return path
