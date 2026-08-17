"""Aurendel — how its people say no, and how a conversation gets out.

`dmkit.lore` builds the hidden-thread conversations; the seven sentences below
are the ones it would otherwise have had to invent. They are here because a
refusal is authored narration in a particular register — third person, present
tense, nobody's name — and a shared default would be Aurendel's register
imposed on whatever world came next.

The `hidden_*.py` files import from here rather than from `dmkit.lore`, so they
go on reading as prose. Everything `dmkit.lore` exports that needs no voice —
`clue`, `thread`, `relic`, `sealed`, and the rest — is re-exported unchanged.
"""
from dmkit import lore as _kit
from dmkit.lore import (  # noqa: F401  re-exported unchanged
    blocked, carried, clue, finding, given, handover, keepsake, learn,
    reading, relic, rumoured, sealed, standing_dc, thread, token, trial,
    trophy)

VOICE = _kit.Voice(
    go_on="Go on.",
    leave_it="Leave it.",
    thanks="Thank you.",
    then_no="Then no.",
    leave="Nothing.",
    rumour_refused="“I've said all I mean to,” they say, and go back to what "
                   "they were doing.",
    favour_refused="“No,” they say, and that is the whole of the answer you "
                   "are getting.",
)


def rumour(*args, **kw):
    """`dmkit.lore.rumour`, in Aurendel's voice."""
    return _kit.rumour(*args, voice=VOICE, **kw)


def favour(*args, **kw):
    """`dmkit.lore.favour`, in Aurendel's voice."""
    return _kit.favour(*args, voice=VOICE, **kw)


def talk(*args, **kw):
    """`dmkit.lore.talk`, in Aurendel's voice."""
    return _kit.talk(*args, voice=VOICE, **kw)


def coldshoulder(*args, **kw):
    """`dmkit.lore.coldshoulder`, in Aurendel's voice."""
    return _kit.coldshoulder(*args, voice=VOICE, **kw)
