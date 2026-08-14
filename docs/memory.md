# Memory, gossip, and learning

This is where emergence comes from.

A deed is not a global fact. It is witnessed by particular people, spreads imperfectly through particular settlements, distorts as it travels, and fades unless something renews it. Two runs of the same module diverge because *who knows what* diverges.

All of it lives under `narrative.memory`.

## Who is driving

```jsonc
{ "narrative": { "memory": { "mode": "hybrid" } } }
```

| Mode | Behaviour |
| --- | --- |
| `simulated` | The engine runs witnessing, spread, and decay on its own. Hands off. |
| `manual` | Nothing propagates unless your content says so. The story lands exactly as written. |
| `hybrid` | The engine simulates, but anything you state explicitly wins. **Default.** |

`hybrid` exists because a GM should be able to let the world run itself *and* pin the beats that matter.

## Witnessing — who saw it

```jsonc
"witness": {
  "requiresLineOfSight": true,
  "deadMenTellNoTales": true,
  "identificationChance": 0.75,
  "disguiseReduction": 0.5,
  "factionAlwaysLearns": false
}
```

`deadMenTellNoTales` is the setting that makes stealth and massacre mechanically distinct. With it on, killing every witness means the deed never enters the social system at all — nobody spreads it, nobody remembers it, your reputation is untouched.

`identificationChance` is the difference between "someone robbed the mill" and "*you* robbed the mill". A witness who fails to identify you spreads a rumour that never attaches to your name.

## Forgetting — how it fades

```jsonc
"forgetting": {
  "curve": "exponential",
  "halfLifeDays": 45,
  "floor": 0.05,
  "reinforceOnRecall": 0.3,
  "neverForget": ["barrow_robbed"]
}
```

| Curve | Shape |
| --- | --- |
| `none` | Perfect recall, forever. |
| `linear` | Steady decline to the floor. |
| `exponential` | Sharp at first, then a long tail — how people actually forget. |
| `threshold` | Total recall until the span elapses, then nothing. |

`reinforceOnRecall` is why grudges outlive kindnesses: every time a memory comes up, it is renewed. An NPC who mentions your theft each visit will never forget it, while the favour you did once fades on schedule.

`neverForget` and a `floor` above zero are how you say *some things are permanent*.

## Gossip — how it travels

```jsonc
"gossip": {
  "spreadPerDay": 0.3,
  "maxHops": 3,
  "hopRetention": 0.7,
  "distortionPerHop": 0.2,
  "requiresTravel": true,
  "crossFactionRate": 0.2,
  "minimumSeverity": 5
}
```

Spread is per-hop, not global. A rumour moves from someone who knows to someone who does not, losing fidelity each time. That is what produces the situation where a village two days away has heard a garbled version and the next village has heard nothing at all.

- **`maxHops`** — retellings before a rumour stops moving. `0` disables spread entirely.
- **`distortionPerHop`** — chance a detail changes: who did it, or how badly.
- **`requiresTravel`** — whether news needs someone to physically carry it. Turn it off for a setting with fast couriers or magical communication.
- **`minimumSeverity`** — small deeds die where they happen.

## Learning — how they adapt

Memory changes how people *feel*. Learning changes what they *do*.

```jsonc
"learning": {
  "encountersBeforeAdapting": 3,
  "adaptationStrength": 0.5,
  "sharedWithinFaction": true,
  "minimumIntellect": 6,
  "tracks": ["damageTypes", "abilities"],
  "forgetAfterDays": 60
}
```

The third goblin ambush prepares for the fireball that killed the first two. `minimumIntellect` is what keeps beasts from doing this — a bog hound never learns, a wight does. `sharedWithinFaction` decides whether knowledge is held per-creature or spreads through the organisation.

## Pinning specific beats

Global settings give you a world that behaves plausibly. `rules` let you overrule it where the story needs a particular thing to happen:

```jsonc
"rules": [
  {
    "id": "vess_never_forgets_theft",
    "description": "Whatever the simulation decides, Vess learns of a theft and never lets it go.",
    "deedKinds": ["theft"],
    "alwaysKnownBy": ["vess"],
    "halfLifeDays": 3650
  },
  {
    "id": "barrow_is_quiet",
    "description": "Nothing living saw it, so it spreads only to the things of the fen.",
    "deedKinds": ["barrow_robbed"],
    "neverKnownBy": ["vess"],
    "spreadPerDay": 0
  }
]
```

Rules apply in order after the global settings. `manualOnly: true` on a rule takes its deeds out of the simulation entirely.

## Reading memory from content

Memory is queryable like anything else, through a [requirement](requirements.md):

```jsonc
{ "memories": [
    { "deedKind": "theft", "who": "speaker", "known": true, "withinDays": 60 }
] }
```

- **`who`** — `speaker` (this NPC), `party`, `anyone`, or `faction`.
- **`known: false`** — require that they have *not* heard. A quest that only appears before word gets out is as common as the opposite.
- **`withinDays`** — recent memory only, so old news stops mattering.

The distinction that makes this worth having: you are not asking whether the deed *happened*. You are asking whether *this person knows about it*.
