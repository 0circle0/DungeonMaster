/**
 * The mod format and its sandbox.
 *
 * Browser-safe: nothing here touches the filesystem. Reading a mod off disk
 * lives in `@dm/mods/load`, which is deliberately not re-exported so a client
 * import of it is a build error.
 */

export {
  modManifestSchema,
  hookDeclSchema,
  limitsSchema,
  hashTagSchema,
  modIdentity,
  parseModIdentity,
  MOD_FORMAT_VERSION,
} from './schema/manifest.js';
export type { ModManifest, HookDecl, ModLimits } from './schema/manifest.js';

export { hashMod, MANIFEST_FILE } from './hash.js';
export type { ModFiles } from './hash.js';

export {
  modDirectiveSchema,
  modDirectivesSchema,
  statePatchSchema,
  statePathSchema,
  checkJsonSafe,
  MOD_STATE_BUDGET,
} from './directives.js';
export type { ModDirective, StatePatch } from './directives.js';

export { resolveMods, activeModIdentities } from './registry.js';
export type { ModDeclaration, ModResolution, ModIssue } from './registry.js';

export { prepareSandbox, createHost } from './sandbox/quickjs.js';
export { PRELUDE_SOURCE } from './sandbox/prelude.js';
export type {
  SandboxHost,
  SandboxCall,
  SandboxResult,
  SandboxFailure,
  LoadedMod,
  HostOptions,
  InstallResult,
} from './sandbox/host.js';

// The editor target. Separate from the engine contract because the two run
// against different hosts and share nothing but the manifest.
export {
  modFieldSchema,
  modWidgetSchema,
  modDiagnosticSchema,
  modPatchSchema,
  modCommandSchema,
  editorDirectiveSchema,
  editorDirectivesSchema,
  EDITOR_HOOK_NAMES,
  isEditorHookName,
} from './editor.js';
export type {
  EditorHookName,
  EditorDirective,
  ModField,
  ModWidget,
  ModDiagnostic,
  ModPatch,
  ModCommand,
} from './editor.js';
