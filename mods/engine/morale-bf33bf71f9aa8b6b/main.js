/**
 * Morale (engine half).
 *
 * Reads the `extra.morale` its studio half writes and makes it mean something:
 * a monster whose vitality drops below its morale threshold turns and runs.
 *
 * The pairing is the point. Neither half knows about the other's code; they
 * agree only on a path into a monster's `extra` bag, which is data both the
 * schema and a stock engine already tolerate.
 */

dm.hook('action.after', (ctx) => {
  // Only worth looking after something that could have hurt someone.
  const type = ctx.subject.action.type;
  if (type !== 'attack' && type !== 'useAbility') return null;

  const entities = dm.state.get('entities');
  if (!entities) return null;

  const directives = [];
  const broken = ctx.self.broken || {};

  for (const id in entities) {
    const entity = entities[id];
    if (!entity || !entity.alive || entity.kind !== 'monster') continue;
    if (broken[id]) continue;

    // The threshold lives on the statblock the author edited in the studio.
    const statblock = entity.statblock;
    if (!statblock) continue;
    const monster = dm.state.get('module.content.monsters.' + statblock);
    const morale = monster && monster.extra ? monster.extra.morale : undefined;
    if (typeof morale !== 'number') continue;

    // Ten is "never runs"; zero is "runs at the first wound".
    const vitality = entity.resources ? entity.resources.vitality : undefined;
    if (typeof vitality !== 'number') continue;
    if (vitality > morale) continue;

    directives.push({
      kind: 'event',
      event: 'moraleBroke',
      data: { entity: id, morale: morale, vitality: vitality },
    });
    broken[id] = true;
  }

  if (directives.length === 0) return null;
  directives.push({ kind: 'modState', key: 'broken', value: broken });
  return directives;
});
