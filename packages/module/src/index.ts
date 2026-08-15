export * from './dsl/index.js';

export { compileModule, CompiledModule, hashModule, formatIssues } from './compile.js';
export type { CompileIssue, CompileResult } from './compile.js';

export { mergeModules, resolveExtends, parseExtends, DELETE_MARKER } from './merge.js';

export * from './diagnostics/index.js';
export * from './analysis/index.js';

export { gameModuleSchema, FORMAT_VERSION, COLLECTION_PATHS } from './schema/module.js';
export type { GameModule, CollectionPath, ModuleMeta, Creation, Start } from './schema/module.js';

export { rulesSchema } from './schema/rules.js';
export type { Rules, Attribute, Resource, DerivedStat, Condition } from './schema/rules.js';

export { contentSchema } from './schema/content.js';
export type { Content, Ability, Item, Monster, Faction, Reaction, LootTable } from './schema/content.js';

export { worldSchema, triggerSchema, gateSchema, areaSchema, pointOfInterestSchema } from './schema/world.js';
export { terrainSchema, paletteSchema, mapSpecSchema, positionSchema } from './schema/space.js';
export type { Terrain, Palette, MapSpec, Position } from './schema/space.js';
export type { World, Biome, RoomTemplate, Area, PointOfInterest, Gate, Trigger, EncounterTable } from './schema/world.js';

export { staticMapSchema, mapLayerSchema, LAYER_TARGETS, LAYER_KINDS } from './schema/staticmap.js';
export type { StaticMap, MapLayer, LayerKind } from './schema/staticmap.js';
// Browser-safe static map file handling; disk policy is in `@dm/module/load`.
export {
  parseCsvGrid,
  serializeCsvGrid,
  assembleStaticMap,
  splitStaticMap,
  sortWorldMaps,
} from './staticmaps.js';
export type { CsvIssue, AssembleIssue } from './staticmaps.js';

export {
  requirementSchema,
  requirementBranchSchema,
  compileRequirement,
  isEmptyRequirement,
} from './schema/requirement.js';
export type { Requirement, RequirementBranch } from './schema/requirement.js';

export {
  savingThrowSchema, sizeSchema, spellcastingSchema, opportunitySchema, damageInteractionSchema,
} from './schema/tactical.js';
export type { SavingThrow, Size, Spellcasting, Opportunity } from './schema/tactical.js';

export { memoryModelSchema, gossipSchema, learningSchema, forgettingSchema, witnessSchema } from './schema/memory.js';
export type { MemoryModel, Gossip, Learning } from './schema/memory.js';

export { narrativeSchema } from './schema/narrative.js';
export type { Narrative, TextPool, TextVariant, Quest } from './schema/narrative.js';

export {
  ExprSchema,
  PredicateSchema,
  EffectSchema,
  RuleSchema,
  diceNotation,
} from './dsl/schema.js';
