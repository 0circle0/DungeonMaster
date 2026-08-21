/** The play surface, shared by every front end. */

export { parse, resolveNoun, isMeta, HELP, VERB_SPECS, traderNearby, stockNearby } from './parser.js';
export type {
  ParseResult, MetaCommand, ParseContext, Candidate, Resolution, VerbSpec, VerbTakes,
} from './parser.js';
export {
  visibleEntities, carried, carriedOrNearby, reachablePlaces,
} from './parser.js';
export { complete, candidatesFor } from './commands.js';
export type { Completion } from './commands.js';

export {
  startSession, applyAction, runCommand, currentOptions, serialize, deserialize,
  applyTo, interpret,
} from './session.js';
export type { Session, CommandResult, CommandOutcome, PlayContext, Turn } from './session.js';

export {
  creationRules,
  costOf,
  totalSpent,
  baseAllocation,
  adjust,
  remaining,
  toChoices,
} from './creation.js';
export type { CreationRules, AdjustResult } from './creation.js';

export { affordances, affordancesAt, affordancesFor } from './affordances.js';
export type { Affordance, AffordanceKind, Subject } from './affordances.js';

export { toneOf, toneOfEntity, glyphOfEntity } from './views/palette.js';
export type { Tone } from './views/palette.js';
export { duration } from './views/format.js';
export { waysFromHere } from './views/exits.js';
export type { WaysFromHere, PlaceExit, RoadExit, Frontier } from './views/exits.js';
export { mapView } from './views/map.js';
export type { MapView, MapCellView, MapCellEntity, Visibility, MapViewOptions } from './views/map.js';
export { shopView } from './views/shop.js';
export type { ShopView } from './views/shop.js';
export { statusView, clockOf } from './views/status.js';
export type { StatusView, ResourceReading } from './views/status.js';
export { partyView } from './views/party.js';
export type { PartyMember } from './views/party.js';
export { legend } from './views/legend.js';
export type { LegendEntry } from './views/legend.js';
export { sheetView } from './views/sheet.js';
export type { SheetView, AttributeReading } from './views/sheet.js';
export { inventoryView } from './views/inventory.js';
export type { CarriedItem } from './views/inventory.js';
