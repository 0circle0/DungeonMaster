/**
 * Morale (studio half).
 *
 * The authoring side of a paired mod: this adds a `morale` field to every
 * monster, and `mods/engine/morale-*` reads it during play. Neither half needs
 * a schema change, because the value lands in the monster's `extra` bag —
 * which `schema/common.ts` documents as the supported way to exceed what the
 * format ships with.
 *
 * The practical consequence: a module carrying `extra.morale` still validates,
 * still compiles, and still hashes stably against a stock engine. Someone
 * without these mods can open and play the game; they just do not get morale.
 */

/** Extra fields on whatever the author has selected. */
dm.hook('editor.fields', (ctx) => {
  const selection = ctx.selection;
  if (!selection) return null;

  // Only for a monster: `content.monsters` then an index.
  const path = selection.path || [];
  if (path[0] !== 'content' || path[1] !== 'monsters' || path.length < 3) return null;

  return [
    {
      kind: 'fields',
      fields: [
        {
          path: ['extra', 'morale'],
          label: 'Morale',
          kind: 'number',
          min: 0,
          max: 10,
          help: 'How long it holds when the fight turns. 0 breaks at the first wound; 10 never runs.',
        },
      ],
    },
  ];
});

/** Extra validation, surfaced in the problems console beside the engine's own. */
dm.hook('editor.lint', (ctx) => {
  const monsters = ((ctx.doc.content || {}).monsters) || [];
  const problems = [];

  for (let i = 0; i < monsters.length; i++) {
    const monster = monsters[i] || {};
    const extra = monster.extra || {};
    if (extra.morale === undefined) {
      problems.push({
        severity: 'info',
        code: 'no_morale',
        path: 'content.monsters.' + (monster.id || i),
        message: (monster.id || 'this monster') + ' has no morale, so it will fight to the death.',
        hint: 'Set Morale on the monster, or leave it if fighting to the death is the intent.',
      });
    } else if (typeof extra.morale !== 'number' || extra.morale < 0 || extra.morale > 10) {
      problems.push({
        severity: 'warning',
        code: 'bad_morale',
        path: 'content.monsters.' + (monster.id || i) + '.extra.morale',
        message: 'Morale must be a number from 0 to 10.',
        hint: null,
      });
    }
  }

  return [{ kind: 'diagnostics', diagnostics: problems }];
});

/** A bulk action, offered in the Mods dock. */
dm.hook('editor.commands', (ctx) => {
  // Without `run` this is the "what can you do" question.
  if (!ctx.run) {
    return [
      {
        kind: 'commands',
        commands: [{ id: 'fill', label: 'Give every monster default morale', group: 'Morale' }],
      },
    ];
  }

  if (ctx.run !== 'fill') return null;

  const monsters = ((ctx.doc.content || {}).monsters) || [];
  const patches = [];
  for (let i = 0; i < monsters.length; i++) {
    const monster = monsters[i] || {};
    const extra = monster.extra || {};
    if (extra.morale !== undefined) continue;
    patches.push({ op: 'set', path: ['content', 'monsters', i, 'extra', 'morale'], value: 5 });
  }
  return [{ kind: 'patch', patches: patches }];
});

/** A panel: what the module looks like through this mod's eyes. */
dm.hook('editor.panel', (ctx) => {
  const monsters = ((ctx.doc.content || {}).monsters) || [];
  const rows = monsters.map((monster) => {
    const extra = monster.extra || {};
    return [
      String(monster.id || '?'),
      extra.morale === undefined ? '—' : String(extra.morale),
    ];
  });

  return [
    {
      kind: 'widget',
      root: {
        kind: 'rows',
        children: [
          { kind: 'text', text: 'Morale decides when a monster runs. Blank means it never does.' },
          { kind: 'table', columns: ['Monster', 'Morale'], rows: rows },
          { kind: 'button', id: 'fill', label: 'Fill the blanks with 5' },
        ],
      },
    },
  ];
});
