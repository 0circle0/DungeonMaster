/** The mod format and its sandbox. */

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

// The editor target.
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
