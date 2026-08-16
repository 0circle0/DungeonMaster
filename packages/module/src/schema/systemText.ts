/**
 * Everything the engine says out loud.
 *
 * The tactical layer has been data since the beginning — dice, criticals,
 * conditions, saves — but the *prose* was not. Seventy-three refusals and some
 * sixty narration templates were English string literals inside the engine, so
 * a module set in space still said "a critical hit" and "the party spreads
 * out", and a module in another language was impossible.
 *
 * This is the registry that fixes it: a stable key for every sentence, and the
 * canonical wording as data rather than as code. The engine emits a key and its
 * values; the module decides the words.
 *
 * ## Two tiers, and why
 *
 * A message is one of two things, and they need different rules.
 *
 * - **`fragment`** — a piece another message interpolates. `combat.outcome.failure`
 *   is the word `{outcome}` in `combat.attacked`. Delete it and you get
 *   `David  a bog hound`: a sentence with a hole where its verb was. Nothing
 *   can sensibly stand in, so these are **required in the document** and a
 *   module that omits one does not compile.
 * - **`message`** — a sentence that stands on its own. Delete `combat.died` and
 *   the worst case is that you get the shipped wording back, which is legible.
 *   These carry a schema default, so an author writes only what they want to
 *   change.
 *
 * That distinction is the whole validation policy: **a value is only mandatory
 * when something else is relying on it to convey a message.**
 *
 * `placeholders` lists the `{names}` a message cannot lose — the ones carrying
 * the facts. Others (`type`, `resisted`) are optional colour the engine supplies
 * and an author may drop. `compileModule` checks both, so the failure is a load
 * error rather than something a player finds three rooms in.
 *
 * A value may also be `{ "pool": "some_pool" }` instead of a string, which
 * hands the message to `narrative.textGrammar` and gets weighted, condition-
 * gated variation for free.
 */

import { z } from 'zod';
import { ref } from './common.js';

export interface SystemTextEntry {
  /** Stable, dotted, and part of the module format's contract. */
  readonly key: string;
  /** What the message is for, published in the generated reference. */
  readonly doc: string;
  /**
   * `fragment` — interpolated into another message; required in the document.
   * `message` — stands alone; defaulted, so it may be omitted.
   */
  readonly tier: 'fragment' | 'message';
  /** `{names}` the text must keep. Losing one leaves a hole in the sentence. */
  readonly placeholders: readonly string[];
  /** The canonical English, seeded into a module by `npm run systemtext`. */
  readonly text: string;
}

/**
 * Generic in the key so the literal survives into `SystemTextKey`, which is
 * what makes a typo in an engine call site a type error rather than a message
 * that silently never renders.
 */
const entry = <K extends string>(
  key: K,
  tier: 'fragment' | 'message',
  text: string,
  doc: string,
  placeholders: readonly string[] = [],
) => ({ key, tier, text, doc, placeholders });

/**
 * Every message the engine can produce.
 *
 * Grouped the way a player meets them. Adding one here is the only way to add
 * engine prose; the guard test in `spine.test.ts` fails on a literal.
 */
export const SYSTEM_TEXT = [
  // — grammar ————————————————————————————————————————————————
  entry('grammar.and', 'fragment', 'and', 'Joins the last two items of a list.'),
  entry('grammar.or', 'fragment', 'or', 'Joins alternatives, as in a gate\'s unmet requirements.'),
  entry('grammar.list.separator', 'fragment', ', ', 'Between all but the last two items of a list.'),
  entry('grammar.list.pair', 'fragment', '{first} {conjunction} {last}', 'A list of exactly two.', ['first', 'last', 'conjunction']),
  entry('grammar.list.many', 'fragment', '{head} {conjunction} {last}', 'A list of three or more; `head` is already joined.', ['head', 'last', 'conjunction']),
  entry('grammar.article.consonant', 'fragment', 'a {noun}', 'Indefinite article before a consonant.', ['noun']),
  entry('grammar.article.vowel', 'fragment', 'an {noun}', 'Indefinite article before a vowel.', ['noun']),
  entry('grammar.count', 'fragment', '{number} {noun}', 'A counted noun, as in "three hounds".', ['number', 'noun']),
  entry(
    'grammar.plural',
    'fragment',
    '{noun}s',
    'How a counted noun is made plural when the content declares no plural of its own.',
    ['noun'],
  ),
  entry(
    'grammar.smallNumbers',
    'fragment',
    'no one two three four five six seven eight nine ten',
    'Number words from zero upward, space separated. Counts past the end of this ladder are written as digits.',
  ),
  entry('unit.round', 'fragment', 'round', 'One round of combat, singular.'),
  entry('unit.rounds', 'fragment', 'rounds', 'Rounds of combat, plural.'),

  // — direction ——————————————————————————————————————————————
  entry('direction.north', 'fragment', 'north', 'Bearing word, interpolated into `{direction}`.'),
  entry('direction.south', 'fragment', 'south', 'Bearing word.'),
  entry('direction.east', 'fragment', 'east', 'Bearing word.'),
  entry('direction.west', 'fragment', 'west', 'Bearing word.'),
  entry('direction.northeast', 'fragment', 'northeast', 'Bearing word.'),
  entry('direction.northwest', 'fragment', 'northwest', 'Bearing word.'),
  entry('direction.southeast', 'fragment', 'southeast', 'Bearing word.'),
  entry('direction.southwest', 'fragment', 'southwest', 'Bearing word.'),
  entry('direction.here', 'fragment', 'right here', 'Bearing to the tile you are standing on.'),
  entry('direction.nearby', 'fragment', 'nearby', 'Bearing too close or too diagonal to name.'),

  // — rolls ——————————————————————————————————————————————————
  entry('roll.line', 'fragment', '{total} ({parts}){versus}{swing}', 'A roll shown as its arithmetic, so a player can learn the system.', ['total', 'parts']),
  entry('roll.versus', 'fragment', ' vs {difficulty}', 'The number a roll was measured against.', ['difficulty']),
  entry('roll.swing', 'fragment', ' [{swing}]', 'Advantage or disadvantage on a roll.', ['swing']),

  // — combat —————————————————————————————————————————————————
  entry('combat.outcome.critical', 'fragment', 'a critical hit', 'How a critical reads in an attack line.'),
  entry('combat.outcome.success', 'fragment', 'a hit', 'How a success reads in an attack line.'),
  entry('combat.outcome.failure', 'fragment', 'a miss', 'How a failure reads in an attack line.'),
  entry('combat.outcome.fumble', 'fragment', 'a fumble', 'How a fumble reads in an attack line.'),
  entry('combat.attack.unnamed', 'fragment', 'attacks', 'Stands in when an attack names no ability.'),
  entry('combat.check.unnamed', 'fragment', 'check', 'Stands in when a check names neither skill nor attribute.'),
  entry('combat.damaged.resisted', 'fragment', ' ({raw} before resistance)', 'Appended when resistance or vulnerability changed the number.', ['raw']),

  entry('combat.attacked', 'message', '{attacker} — {ability} on {target}: {roll} — {outcome}.', 'One attack, with its arithmetic.', ['attacker', 'target', 'roll', 'outcome']),
  entry('combat.checked', 'message', '{who} — {what}: {roll}.', 'A skill or attribute check.', ['who', 'roll']),
  entry('combat.saved', 'message', '{who} — {save} save: {roll}.', 'A saving throw.', ['who', 'roll']),
  entry('combat.damaged', 'message', '{who} takes {amount}{type} damage{resisted}.', 'Damage taken.', ['who', 'amount']),
  entry('combat.healed', 'message', '{who} recovers {amount}.', 'A resource restored.', ['who', 'amount']),
  entry('combat.died', 'message', '{who} falls.', 'A creature dies.', ['who']),
  entry('combat.conditionApplied', 'message', '{who} is {condition}.', 'A condition takes hold.', ['who', 'condition']),
  entry('combat.conditionExpired', 'message', '{who} is no longer {condition}.', 'A condition runs out.', ['who', 'condition']),
  entry('combat.conditionResisted', 'message', '{who} shrugs off {condition}.', 'A condition is saved against.', ['who', 'condition']),
  entry('combat.reacted', 'message', '{who} reacts.', 'A reaction fires.', ['who']),
  entry('combat.started', 'message', 'Combat begins — {who}.', 'A fight starts, listing who is in it.', ['who']),
  entry('combat.ended.victory', 'message', 'The fight is over.', 'The party won.'),
  entry('combat.ended.fled', 'message', 'You are not followed.', 'The party escaped.'),
  entry('combat.ended.defeat', 'message', 'The party falls.', 'The party lost.'),
  entry('combat.round', 'message', '— round {round} —', 'A new round begins.', ['round']),
  entry('combat.turn', 'message', "{who}'s turn.", 'Whose turn it is — without this a player only learns it from a refusal.', ['who']),

  // — movement ———————————————————————————————————————————————
  entry('move.blocked', 'message', 'Blocked by {what}.', 'Something stopped a step: a wall, or somebody standing there.', ['what']),
  entry('move.blocked.edge', 'fragment', 'the edge of the world', 'What stopped a step when it was the end of the map rather than any terrain.'),

  // — items and coin —————————————————————————————————————————
  entry('item.taken', 'message', 'Taken: {items}.', 'Picked up.', ['items']),
  entry('item.lost', 'message', 'Lost: {items}.', 'Gone from the party\'s hands.', ['items']),
  entry('item.dropped', 'message', '{who} leaves {items} behind.', 'A body\'s spoils — a silent drop is a drop the player never picks up.', ['who', 'items']),
  entry('trade.bought', 'message', 'Bought {items} from {who} for {price}.', 'A purchase.', ['items', 'who', 'price']),
  entry('trade.sold', 'message', 'Sold {items} to {who} for {price}.', 'A sale.', ['items', 'who', 'price']),
  entry('currency.gained', 'message', 'You are {amount} the richer.', 'Coin arriving any way other than a sale.', ['amount']),
  entry('currency.lost', 'message', 'You are {amount} the poorer.', 'Coin leaving any way other than a purchase.', ['amount']),

  // — traps and discovery ————————————————————————————————————
  entry('trap.sprung', 'message', '{who} sets off {trap}!', 'A trap fires.', ['who', 'trap']),
  entry('trap.disarmed', 'message', '{who} disarms the {trap}.', 'A trap is made safe.', ['who', 'trap']),
  entry('discovered.trap', 'message', 'You spot {what}.', 'A trap is noticed before it fires.', ['what']),
  entry('discovered.place', 'message', 'You find {what}.', 'A hidden place is found.', ['what']),

  // — progression ————————————————————————————————————————————
  entry('progress.xp', 'message', '{who} gains {amount} experience.', 'Experience awarded.', ['who', 'amount']),
  entry('progress.level', 'message', '{who} reaches level {level}.', 'A level gained.', ['who', 'level']),

  // — gates ——————————————————————————————————————————————————
  entry('gate.opened.bypass', 'fragment', ' — forced', 'Appended when a gate was forced rather than opened.'),
  entry('gate.opened.ability', 'fragment', ' — by power', 'Appended when an ability opened a gate.'),
  entry('gate.blocked.missing', 'fragment', ' You would need {what}.', 'Appended to a blocked gate, listing what would open it.', ['what']),
  entry('gate.opened', 'message', '{gate} opens{how}.', 'A gate gives way.', ['gate']),
  entry('gate.blocked', 'message', '{gate} will not open.{missing}', 'A gate holds.', ['gate']),

  // — requirements, as a player reads them ———————————————————
  entry('requirement.item', 'fragment', 'the {item}', 'An item a requirement asks for.', ['item']),
  entry('requirement.skill', 'fragment', '{skill} {rank}', 'A skill rank a requirement asks for.', ['skill', 'rank']),
  entry('requirement.quest', 'fragment', '{quest} {status}', 'A quest state a requirement asks for.', ['quest', 'status']),
  entry('requirement.faction', 'fragment', 'standing with the {faction}', 'Reputation a requirement asks for.', ['faction']),
  entry('requirement.level', 'fragment', 'level {level}', 'A level a requirement asks for.', ['level']),
  entry('requirement.ability', 'fragment', 'the {ability} ability', 'An ability a requirement asks for.', ['ability']),

  // — quests —————————————————————————————————————————————————
  entry('quest.offered', 'message', '{who} has work for you: {quest}.', 'Somebody offers a job.', ['who', 'quest']),
  entry('quest.started', 'message', 'New quest: {quest} — {description}', 'A job taken, with what it is — the title alone says nothing.', ['quest', 'description']),
  entry('quest.started.plain', 'message', 'New quest: {quest}.', 'A job taken that has no description.', ['quest']),
  entry('quest.stage', 'message', '{stage}', 'A quest moves on, when the stage wrote no journal prose.', ['stage']),
  entry('quest.stage.journal', 'message', '{stage} — {journal}', 'A quest moves on, with the stage\'s own journal line.', ['stage', 'journal']),
  entry('quest.objective', 'message', 'Objective complete: {objective}', 'One objective done.', ['objective']),
  entry('quest.completed', 'message', 'Quest complete: {quest}.', 'A job finished.', ['quest']),
  entry('quest.failed', 'message', 'Quest failed: {quest} — {reason}.', 'A job lost.', ['quest', 'reason']),
  entry('quest.failed.abandoned', 'fragment', 'abandoned', 'Why a quest was lost: the party walked away from it.'),
  entry('quest.failed.conditions', 'fragment', 'conditions changed', 'Why a quest was lost: its `failWhen` became true.'),
  entry('quest.failed.timedOut', 'fragment', 'too much time passed', 'Why a quest was lost: its deadline ran out.'),
  entry('quest.failed.expired', 'fragment', 'time ran out', 'Why a quest was lost: it expired off-screen.'),

  // — the party ——————————————————————————————————————————————
  entry('party.stance', 'message', 'You move at a {stance}.', 'The party changes how carefully it moves.', ['stance']),
  entry('party.following', 'message', 'The others fall in behind you.', 'The party closes up.'),
  entry('party.spread', 'message', 'The party spreads out.', 'The party stops following.'),

  // — the world ——————————————————————————————————————————————
  entry('time.dayBroke', 'message', 'Day {day} breaks.', 'A new day.', ['day']),
  entry('reputation.improved', 'fragment', 'improved', 'Which way standing moved.'),
  entry('reputation.worsened', 'fragment', 'worsened', 'Which way standing moved.'),
  entry('reputation.changed', 'message', '{faction}: {direction} ({delta}).', 'Standing with a faction moved.', ['faction', 'direction', 'delta']),
  entry('deed.witness', 'fragment', 'witness', 'One witness.'),
  entry('deed.witnesses', 'fragment', 'witnesses', 'Several witnesses.'),
  entry('deed.unseen', 'message', 'Nobody saw that.', 'A deed nobody witnessed — which is what makes stealth mechanically different.'),
  entry('deed.witnessed', 'message', '{witnesses} to that.', 'A deed that was seen.', ['witnesses']),
  entry('game.victory', 'message', 'You have won.', 'The game is won.'),
  entry('game.defeat', 'message', 'Your party is dead.', 'The game is lost.'),

  // — perception ——————————————————————————————————————————————
  entry('sense.nearness.faint', 'fragment', 'Faintly', 'How a weak or stale impression is introduced.'),
  entry('sense.nearness.close', 'fragment', 'Close by', 'How a strong impression is introduced.'),
  entry('sense.nearness.far', 'fragment', 'Somewhere', 'How a middling impression is introduced.'),
  entry('sense.unnamed', 'fragment', 'sense', 'Stands in when a sense declares no name.'),
  entry('perception.investigating', 'message', '{who} casts about, and starts toward something.', 'A creature goes to look at what it noticed.', ['who']),
  entry('perception.lostInterest', 'message', '{who} loses the thread of it.', 'A creature gives up looking.', ['who']),
  entry('sense.empty', 'message', 'You stop. Nothing reaches you.', 'Using a sense that turns nothing up, when the sense has no name.'),
  entry('sense.empty.named', 'message', 'You stop. Nothing reaches you by {sense}.', 'Using a sense that turns nothing up. Always says something — silence reads as a broken command.', ['sense']),
  entry('sense.impression', 'message', '{nearness}, something you can {sense}.', 'Noticing something, when the sense wrote no phrasing of its own.', ['nearness', 'sense']),

  // — looking around —————————————————————————————————————————
  entry('look.creatures', 'message', 'You see {what}.', 'Who else is here.', ['what']),
  entry('look.creature.plain', 'message', '{name}, and nothing more to be told from here.', 'Looking at a creature whose statblock wrote no description.', ['name']),
  entry('look.item.plain', 'message', '{name}. Nothing remarkable.', 'Looking at an item that wrote no description.', ['name']),
  entry('look.place.plain', 'message', '{name}, from here.', 'Looking at a place that wrote no description.', ['name']),
  entry('look.unseen', 'message', 'You cannot see {what} from here.', 'Looking at something that is not here.', ['what']),

  // — refusals: acting at all ————————————————————————————————
  entry('refused.actor.missing', 'message', 'no such character', 'The action named somebody who is not in the game.'),
  entry('refused.action.unknown', 'message', '"{action}" is not something you can do', 'An action this build has never heard of — a save or a caller can hand one over.', ['action']),
  entry('refused.turn.other', 'message', "it is {who}'s turn", 'Acting out of turn.', ['who']),
  entry('refused.select.notParty', 'message', 'not in the party', 'Selecting somebody who is not yours to command.'),

  // — refusals: moving ———————————————————————————————————————
  entry('refused.move.noMap', 'message', 'not on a map', 'Moving while not on a tactical map.'),
  entry('refused.move.tooFar', 'message', 'that is not one step away', 'Moving further than one tile at a time.'),
  entry('refused.move.noMovement', 'message', 'no movement left this turn', 'Out of movement in combat.'),
  entry('refused.travel.noMap', 'message', 'nowhere to walk', 'Walking with no map underfoot.'),
  entry('refused.travel.noRoute', 'message', 'no way through', 'No path to the destination.'),
  entry('refused.travel.noRoad', 'message', 'there is no road that way', 'No connection between these two areas.'),
  entry('refused.travel.noWayUp', 'message', 'there is no way back up', 'No route out of a dungeon by that door.'),
  entry('refused.travel.notYet', 'message', 'not yet — {missing}', 'The way on is gated, and this is what is missing.', ['missing']),
  entry('refused.travel.notYet.plain', 'message', 'not yet', 'The way on is gated, with nothing to say about why.'),
  entry('refused.travel.unknownArea', 'message', 'no area "{area}"', 'The module names no such area.', ['area']),
  entry('refused.leave.noExitFound', 'message', 'find the way out first', 'Leaving a dungeon before the exit is known.'),
  entry('refused.leave.nowhere', 'message', 'there is nowhere to go back to', 'Leaving with nowhere to go.'),
  entry('refused.enter.noSuchPlace', 'message', 'there is no "{target}" here', 'Entering something that is not here.', ['target']),
  entry('refused.enter.unknownPlace', 'message', 'no such place', 'The place exists in no collection.'),
  entry('refused.enter.unknownDungeon', 'message', 'no dungeon "{dungeon}"', 'The module names no such dungeon.', ['dungeon']),

  // — refusals: fighting —————————————————————————————————————
  entry('refused.attack.noWeapon', 'message', '{who} has nothing to attack with', 'Attacking with no ability and no weapon.', ['who']),
  entry('refused.ability.unknown', 'message', 'no ability "{ability}"', 'The module names no such ability.', ['ability']),
  entry('refused.ability.notKnown', 'message', '{who} does not know {ability}', 'Using an ability this creature has not got.', ['who', 'ability']),
  entry('refused.ability.prevented', 'message', '{who} cannot take that action right now', 'A condition forbids the action type.', ['who']),
  entry('refused.ability.requirements', 'message', '{who} does not meet the requirements for {ability}', 'An ability is gated and the gate is shut.', ['who', 'ability']),
  entry('refused.ability.unavailable', 'message', '{ability} cannot be used now', 'An ability\'s own condition says no.', ['ability']),
  entry('refused.ability.cooldown', 'message', '{ability} is not ready for another {rounds}', 'An ability is still cooling down.', ['ability', 'rounds']),
  entry('refused.ability.noAction', 'message', 'no action left this turn', 'Out of actions in combat.'),
  entry('refused.cost.shortfall', 'message', 'not enough {resource}', 'An ability costs more than is left.', ['resource']),
  entry('refused.target.none', 'message', 'nothing to target', 'An ability that needs a target found none.'),
  entry('refused.target.missing', 'message', 'no target', 'No target was named.'),
  entry('refused.target.empty', 'message', 'nothing there', 'The named target is gone.'),
  entry('refused.target.elsewhere', 'message', 'not here', 'The target is on another map.'),
  entry('refused.target.outOfRange', 'message', 'out of range', 'Beyond the ability\'s reach.'),
  entry('refused.target.outOfReach', 'message', 'out of reach', 'Beyond arm\'s length.'),
  entry('refused.target.noSight', 'message', 'no line of sight', 'Something solid is in the way.'),
  entry('refused.target.covered', 'message', 'they are behind full cover', 'Cover blocks the shot entirely.'),
  entry('refused.flee.noCombat', 'message', 'nothing to flee from', 'Fleeing outside a fight.'),
  entry('refused.flee.noExit', 'message', 'there is nowhere to run', 'Fleeing with no way out.'),

  // — refusals: casting ——————————————————————————————————————
  entry('refused.cast.silenced', 'message', '{who} cannot speak the words', 'A verbal component with speech prevented.', ['who']),
  entry('refused.cast.bound', 'message', '{who} cannot make the signs', 'A somatic component with gesture prevented.', ['who']),
  entry('refused.cast.noComponent', 'message', '{who} has no {component}', 'A material component the caster is not carrying.', ['who', 'component']),
  entry('refused.cast.notRitual', 'message', '{spell} cannot be cast as a ritual', 'Casting as a ritual something that is not one.', ['spell']),
  entry('refused.cast.noSlot', 'message', 'no slot left for {spell}', 'Out of spell slots at that level.', ['spell']),

  // — refusals: things and people ————————————————————————————
  entry('refused.item.unknown', 'message', 'no item "{item}"', 'The module names no such item.', ['item']),
  entry('refused.item.notCarried', 'message', 'you are not carrying that', 'Acting on an item nobody holds.'),
  entry('refused.take.nothingHere', 'message', 'there is nothing here to take', 'Nothing within reach to pick up.'),
  entry('refused.take.noSuchItem', 'message', 'there is no {item} here', 'That particular thing is not here.', ['item']),
  entry('refused.equip.notWearable', 'message', '{item} is not something you wear', 'Equipping something with no slot.', ['item']),
  entry('refused.equip.notAllowed', 'message', '{item} is not for you', 'Equipping something this character may not use.', ['item']),
  entry('refused.unequip.notWorn', 'message', 'you are not wearing that', 'Taking off something not worn.'),
  entry('refused.use.nothingHappens', 'message', 'nothing happens with the {item}', 'Using an item that declares no effect.', ['item']),
  entry('refused.use.spent', 'message', 'the {item} is spent', 'Using an item whose charges are gone.', ['item']),
  entry('refused.give.tooFar', 'message', 'they are not close enough', 'Handing something over from too far away.'),
  entry('refused.search.nothing', 'message', 'you find nothing here', 'A search that turned nothing up.'),
  entry('refused.disarm.nothingHere', 'message', 'there is nothing here to disarm', 'Disarming with no trap in reach.'),
  entry('refused.open.noSuchThing', 'message', 'nothing here called "{target}"', 'Opening something that is not here.', ['target']),
  entry('refused.open.unknownGate', 'message', 'no gate "{gate}"', 'The module names no such gate.', ['gate']),
  entry('refused.sense.unknown', 'message', 'nothing here works like that', 'Using a sense the module does not declare.'),
  entry('refused.stance.unknown', 'message', 'there is no way of moving called "{stance}"', 'Setting a stance the module does not declare.', ['stance']),
  entry('refused.follow.inCombat', 'message', 'in a fight everyone acts on their own initiative', 'Setting follow while fighting.'),
  entry('refused.rest.notHere', 'message', 'cannot rest like that here', 'This place does not allow that kind of rest.'),
  entry('refused.rest.inCombat', 'message', 'not while fighting', 'Resting mid-fight.'),
  entry('refused.rest.interrupted', 'message', 'something came looking before you could settle', 'A rest broken into.'),

  // — refusals: talking and trading ——————————————————————————
  entry('refused.talk.tooFar', 'message', 'too far away to talk', 'Talking from across the room.'),
  entry('refused.talk.nothingToSay', 'message', '{who} has nothing to say', 'This character has no dialogue.', ['who']),
  entry('refused.talk.unknownDialogue', 'message', 'no dialogue "{dialogue}"', 'The module names no such dialogue.', ['dialogue']),
  entry('refused.reply.noConversation', 'message', 'nobody is talking', 'Replying with no conversation open.'),
  entry('refused.reply.unknown', 'message', 'no such reply', 'Choosing a reply that is not on offer.'),
  entry('refused.reply.locked', 'message', 'you cannot say that', 'A reply that is shown but not available, and wrote no hint of its own.'),
  entry('refused.buy.noStock', 'message', 'they have nothing to sell', 'This character keeps no shop.'),
  entry('refused.buy.noSuchItem', 'message', 'they do not have that', 'Not in stock.'),
  entry('refused.buy.tooExpensive', 'message', 'you cannot afford that', 'Not enough coin.'),
  entry('refused.sell.notBuying', 'message', 'they are not buying', 'This shop does not buy.'),
  entry('refused.sell.unwanted', 'message', 'they have no use for that', 'This shop will not take that.'),
  entry('refused.trade.barred', 'message', 'they will not deal with you — {missing}', 'The shop is gated, and this is why.', ['missing']),
  entry('refused.trade.barred.plain', 'message', 'they will not deal with you', 'The shop is gated, with nothing to say about why.'),

  // — what a button says when it will not work ———————————————
  entry('affordance.barred', 'message', 'barred — needs {what}', 'A way that is shut, and what would open it.', ['what']),
  entry('affordance.needs', 'message', 'needs {what}', 'A shop that will not deal, and what would change that.', ['what']),

  // — refusals: quests ———————————————————————————————————————
  entry('refused.quest.unknown', 'message', 'no quest "{quest}"', 'The module names no such quest.', ['quest']),
  entry('refused.quest.unavailable', 'message', '{quest} is not available yet', 'A quest whose requirements are unmet.', ['quest']),
  entry('refused.quest.notTaken', 'message', 'you are not on that job', 'Abandoning a quest nobody took.'),

  // — refusals the engine should never need ——————————————————
  entry('refused.internal.unknownResource', 'message', 'no resource "{resource}"', 'Content named a resource the ruleset does not declare.', ['resource']),
  entry('refused.internal.unknownCondition', 'message', 'no condition "{condition}"', 'Content named a condition the ruleset does not declare.', ['condition']),
  entry('refused.internal.unknownFaction', 'message', 'no faction "{faction}"', 'Content named a faction the module does not declare.', ['faction']),
  entry('refused.internal.unknownOp', 'message', 'this engine does not implement "{op}"', 'An effect this build does not know.', ['op']),
] as const satisfies readonly SystemTextEntry[];

/** Every key the engine can ask for. A typo is a type error at the call site. */
export type SystemTextKey = (typeof SYSTEM_TEXT)[number]['key'];

/** Lookup by key, built once. */
export const SYSTEM_TEXT_BY_KEY: ReadonlyMap<string, SystemTextEntry> = new Map(
  SYSTEM_TEXT.map((item) => [item.key, item]),
);

/** Keys a document must declare: the pieces other messages are built from. */
export const REQUIRED_SYSTEM_TEXT: readonly string[] = SYSTEM_TEXT.filter(
  (item) => item.tier === 'fragment',
).map((item) => item.key);

/** The canonical wording, ready to write into a module document. */
export function defaultSystemText(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of SYSTEM_TEXT) out[item.key] = item.text;
  return out;
}

/**
 * Just the fragments — the smallest `systemText` block a module can compile
 * with. What a new module starts from, so a fresh scaffold is a working
 * document rather than a wall of prose nobody has read.
 */
export function requiredSystemText(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of SYSTEM_TEXT) if (item.tier === 'fragment') out[item.key] = item.text;
  return out;
}

/**
 * One message: a string, or a text-grammar pool for weighted variation.
 *
 * The pool form is a `ref`, so a typo in it is a dangling reference at load
 * rather than a message that silently never appears.
 */
export const systemTextValueSchema = z.union([
  z.string(),
  z.object({ pool: ref('narrative.textGrammar') }).strict(),
]);

/**
 * What the engine says, keyed.
 *
 * Fragments are declared optional here rather than required so that a module
 * missing one gets `compileModule`'s own diagnostic — which names the key and
 * quotes the canonical wording — instead of Zod's bare "required" on a key an
 * author has never seen before.
 */
export const systemTextSchema = z
  .object(
    Object.fromEntries(
      SYSTEM_TEXT.map((item) => [
        item.key,
        item.tier === 'fragment'
          ? systemTextValueSchema.optional().describe(item.doc)
          : systemTextValueSchema.default(item.text).describe(item.doc),
      ]),
    ) as Record<string, z.ZodTypeAny>,
  )
  .strict();

export type SystemTextValue = z.infer<typeof systemTextValueSchema>;
export type SystemText = Partial<Record<SystemTextKey, SystemTextValue>>;
