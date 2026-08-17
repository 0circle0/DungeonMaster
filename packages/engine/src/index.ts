export { simulateLoot, simulateEncounters } from './analysis.js';
export type { Outcome, EncounterOutcome, SimulationResult, EncounterSimulationResult } from './analysis.js';

export { takeItem, dropItem, equipItem, unequipItem, useItem, giveItem, itemsWithinReach } from './sim/items.js';

export {
  narrate, narrateEvent, describeSurroundings, formatRoll, placeOf, placeNameOf,
} from './narrate/narrate.js';
export type { Line, NarratorContext } from './narrate/narrate.js';
export { narrateFrom, interpolate, list, count, article, plural, nameScore } from './narrate/grammar.js';
export type { NarrateOptions, Grammar } from './narrate/grammar.js';
export {
  text, render, message, literal, joinMessages, grammarOf,
} from './narrate/systemText.js';
export type { Message, TextParams } from './narrate/systemText.js';

export { spreadRumours, decayMemories, driftFactions, retention, memoryKeyOf, memoryModel } from './sim/gossip.js';
export type { MemoryModel } from './sim/gossip.js';
export { tickDay, recordEncounter, hasAdapted, learningKey } from './sim/agenda.js';

export { runTriggers, shouldFire, triggersFor } from './sim/triggers.js';
export type { TriggerDef, TriggerSource } from './sim/triggers.js';
export { openGate, markGateOpen, describeRequirement } from './sim/gates.js';
export type { GateDef, GateOutcome } from './sim/gates.js';
export {
  startQuest, abandonQuest, advanceQuests, grantXp,
  startAutoQuests, refreshQuestAvailability, objectivesOf, stageIndexOf,
} from './sim/quests.js';
export type { QuestDef, StageDef, ObjectiveDef } from './sim/quests.js';
export { questJournal, currentObjective, journalByArc } from './sim/questview.js';
export { arcsOf, endingReached, arcScope } from './sim/arcs.js';
export type { ArcView, ArcStatus, ArcDef } from './sim/arcs.js';
export { questsOffered } from './sim/quests.js';
export { describeCreature } from './narrate/grammar.js';
export type { JournalEntry, JournalObjective, CurrentObjective } from './sim/questview.js';
export { startDialogue, visibleOptions, chooseOption, endDialogue, canTalkTo } from './sim/dialogue.js';
export type { VisibleOption } from './sim/dialogue.js';
export { recordDeed, witnessesOf, knowledgeOf } from './sim/deeds.js';
export { enterDungeon, enterArea, enterPoi, placeParty } from './sim/enter.js';
export { OPEN_NAMESPACES } from './stats.js';

export { populateDungeon, rollLoot, rollEncounter, singleScope } from './world/populate.js';
export { springTrap, searchForTraps, disarmTrap, reachableTrap } from './sim/traps.js';
export { shopOf, shopStock, sellable, shopBarred, priceOf, buyItem, sellItem } from './sim/trade.js';
export { phaseOf, dateOf, layerOf } from './sim/clock.js';
export {
  slotsFor, slotsLeft, slotForSpell, saveDifficultyOf, attackBonusOf, isSpell, recoverSlots,
} from './rules/casting.js';
export type { WorldDate } from './sim/clock.js';
export type { ShopDef, StockEntry } from './sim/trade.js';
export type { ScopeSet, LootOptions } from './world/populate.js';
export type { Population, PlacedMonster, PlacedLoot, PlacedTrap, LootDraw, EncounterDraw } from './world/populate.js';
export { generateDungeon, gatesOf } from './world/dungeon.js';
export type { GeneratedDungeon, Room, Door } from './world/dungeon.js';
export { buildMap, resolvePalette } from './world/mapgen.js';
export type { BuiltMap, Palette, MapSpec } from './world/mapgen.js';
export { buildStaticMap } from './world/staticmap.js';
export type { BuiltStaticMap, StaticSpawn } from './world/staticmap.js';

export * from './grid/index.js';

export { SAVE_VERSION, entity, livingParty, withEntity } from './state.js';
export type {
  GameState,
  Entity,
  EntityId,
  ActiveCondition,
  ItemStack,
  Location,
  QuestState,
  Deed,
} from './state.js';

export {
  modifiersOf, maximaOf, minimaOf, initialOf, derivedOf, statsOf, buildScope,
  proficiencyOf, carriedWeight, skillRankOf, skillRanksOf,
} from './stats.js';
export {
  sensesOf,
  senseOf,
  sightSenseOf,
  rangeOf,
  signalAt,
  canPerceive,
  canPerceiveTile,
  perceivedTiles,
  perceive,
  impressions,
  detectionRange,
  markStrength,
  markSpread,
  leaveMarks,
  pruneMarks,
  perceiveInto,
  perceiveAll,
  currentAlert,
  makeNoise,
  emissionOf,
  stanceOf,
  defaultStanceOf,
  senseReport,
  roughBearing,
} from './sim/senses.js';
export { simulatePerception } from './analysis.js';
export type { PerceptionPreview, PerceptionCell } from './analysis.js';
export type { SenseDef, Percept, PerceptionContext, Threshold, DeclaredStance } from './sim/senses.js';
export type { EntityStats } from './stats.js';

export { createCharacter, spawnMonster, spawnNpc, npcIdOf, CreationError } from './character.js';
export type { CharacterChoices } from './character.js';

export { reduce, reduceAll, advanceTime, occupiedTiles } from './reduce.js';
export type { ReduceResult, ReduceContext } from './reduce.js';

export { DIRECTIONS as COMPASS, DIRECTION_OFFSETS, isDirection } from './actions.js';
export type { Action, ActionType, Direction } from './actions.js';

export { isEvent, eventsOfType } from './events.js';
export type { GameEvent, EventType, RollRecord } from './events.js';

export { Transaction, applyOps, adjustResource, applyCondition, removeCondition, changeInventory, adjustReputation } from './rules/apply.js';
export { tickConditions, tickAllConditions, preventsAction, impliedConditions } from './rules/conditions.js';

export {
  check,
  skillCheck,
  savingThrow,
  opposedCheck,
  succeeded,
  difficultyOf,
  skillModifier,
  attributeModifier,
  criticalMultiplier,
} from './rules/check.js';
export type { CheckOptions, Swing } from './rules/check.js';

export {
  tileSize,
  toTiles,
  reachOf,
  speedOf,
  combatants,
  isHostileTo,
  reachability,
  coverBonus,
  resolveTargets,
  nearestHostile,
} from './rules/combat/targeting.js';
export type { TargetingContext, Reachability } from './rules/combat/targeting.js';

export { useAbility, defaultAttackAbility } from './rules/combat/attack.js';
export {
  rollInitiative,
  maybeStartCombat,
  maybeEndCombat,
  activeEntity,
  hasBudget,
  endTurn,
  runReactions,
  broadcastReaction,
  provokeOpportunity,
} from './rules/combat/turn.js';
export { takeAiTurn, runAiTurns } from './rules/combat/ai.js';

export { save, load, statesEqual } from './save.js';
export type { SaveFile, LoadResult, SaveOptions, SaveLineageEntry } from './save.js';

// Mods. `ModRuntime` is what a front end builds and hands to `reduce` via
// `ReduceContext.mods`; the hook names are the contract a mod attaches to.
export { ModRuntime } from './mods/runtime.js';
export type { ModRuntimeOptions } from './mods/runtime.js';
export { HOOK_NAMES, isHookName } from './mods/hooks.js';
export type { HookName, HookOutcome, HookSubjects } from './mods/hooks.js';

export type { MapInstance, CombatState } from './state.js';

export { newGame, defaultChoices, NewGameError } from './newgame.js';
export type { NewGameOptions } from './newgame.js';

export { costOf, totalSpent, baseAllocation, creationProblem } from './creation.js';
