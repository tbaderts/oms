// Storyboards (SPEC-0014): file-backed process journeys. The source of truth is the folder on disk;
// these types are what the main process hands the renderer. No type here carries a writable path.

export type LaneKind = 'actor' | 'channel' | 'system' | 'external';
export type StepKind = 'user' | 'system' | 'external' | 'manual';
export type StoryStatus = 'draft' | 'stable' | 'deprecated';
export type TrustTier = 'unevidenced' | 'evidenced' | 'human-verified';
/** Ordered from best to worst; a storyboard takes the worst of its sources. */
export type DriftStatus = 'none' | 'current' | 'drifted' | 'missing' | 'unknown';

export const LANE_KINDS: readonly LaneKind[] = ['actor', 'channel', 'system', 'external'];
export const STEP_KINDS: readonly StepKind[] = ['user', 'system', 'external', 'manual'];
export const STORY_STATUSES: readonly StoryStatus[] = ['draft', 'stable', 'deprecated'];
export const DRIFT_ORDER: readonly DriftStatus[] = ['none', 'current', 'drifted', 'missing', 'unknown'];

export interface Lane {
  id: string;
  label: string;
  kind: LaneKind;
}

export interface Heading {
  level: number;
  text: string;
  anchor: string;
}

export interface Illustration {
  /** Flat file name in the storyboard's assets/ folder, as written in the step file. */
  src: string;
  caption?: string;
  /** `storyboard-asset://<id>/<src>`, or null when `src` is not a valid asset name. */
  url: string | null;
  missing: boolean;
  /** True for *.excalidraw.svg, the only format the integrated editor opens. */
  editable: boolean;
}

export type Origin =
  | { kind: 'step'; ref: string }
  | { kind: 'extension'; ref: string }
  | { kind: 'external'; lane: string }
  | { kind: 'external'; label: string }
  | { kind: 'unknown' };

export interface DataIn {
  name: string;
  shape?: string;
  origin: Origin;
}

export interface DataOut {
  name: string;
  shape?: string;
  final?: boolean;
}

export type ContinueAt = { kind: 'stay' } | { kind: 'step'; step: string } | { kind: 'end' };

export interface Extension {
  id: string;
  /** Derived from step and extension order (`3a`); never stored. */
  label: string;
  when: string;
  then: string;
  continueAt: ContinueAt;
  illustrations: Illustration[];
  in: DataIn[];
  out: DataOut[];
}

export interface StepLinks {
  api: string[];
  events: string[];
  states: string[];
  requirements: string[];
}

export const LINK_CATEGORIES = ['api', 'events', 'states', 'requirements'] as const;
export type LinkCategory = (typeof LINK_CATEGORIES)[number];

export interface Step {
  id: string;
  /** 0-based position in story.md; the displayed number is index + 1. */
  index: number;
  title: string;
  kind: StepKind;
  from?: string;
  to?: string;
  illustrations: Illustration[];
  links: StepLinks;
  in: DataIn[];
  out: DataOut[];
  extensions: Extension[];
  body: string;
  headings: Heading[];
  /** Revision token of the step file; '' when the file is unreadable. */
  revision: string;
  /** Workspace-relative, for display only. */
  sourcePath: string;
  readable: boolean;
  /** Why the step file could not be read (missing, symlink, oversized, malformed, id mismatch). */
  unreadableReason?: string;
}

export interface EvidenceRepo {
  module: string;
  commit: string;
  drift: DriftStatus;
}

export interface EvidenceSource {
  module: string;
  path: string;
  line?: number;
  endLine?: number;
  label?: string;
  drift: DriftStatus;
}

export interface EvidenceIssue {
  kind: 'kb-link-missing' | 'unknown-commit' | 'unknown-module' | 'malformed-source';
  message: string;
}

export interface Evidence {
  repos: EvidenceRepo[];
  sources: EvidenceSource[];
  kbLinks: { path: string; exists: boolean }[];
  verified: { by: string; at: string }[];
  issues: EvidenceIssue[];
}

export interface StoryboardSummary {
  id: string;
  title: string;
  description: string;
  domain: string;
  status: StoryStatus;
  owner?: string;
  tags: string[];
  /** Workspace-relative folder, for display only. */
  sourcePath: string;
  modified: number;
  stepCount: number;
  stepTitles: string[];
  /** One entry per declared step: its first illustration URL, or null for a placeholder. */
  thumbnails: (string | null)[];
  trust: TrustTier;
  drift: DriftStatus;
  hasCard: boolean;
  /** True when the card exists but its evidence is broken (unknown commit, missing kb link …). */
  brokenEvidence: boolean;
}

export interface StoryboardDetail extends StoryboardSummary {
  lanes: Lane[];
  steps: Step[];
  body: string;
  headings: Heading[];
  revision: string;
  evidence: Evidence | null;
  problems: Problem[];
  /** The story's own unknown front-matter keys are kept on disk; their names are listed for the editor. */
  orphanSteps: string[];
}

export type ProblemCode =
  | 'step-unreadable'
  | 'unknown-lane'
  | 'missing-illustration'
  | 'unresolved-link'
  | 'orphan-step'
  | 'data-no-source'
  | 'data-never-read'
  | 'data-origin-unresolved'
  | 'extension-unknown-target'
  | 'extension-backward-target'
  | 'extension-duplicate-id';

export const PROBLEM_SEVERITY: Record<ProblemCode, 'error' | 'warning'> = {
  'step-unreadable': 'error',
  'unknown-lane': 'error',
  'missing-illustration': 'warning',
  'unresolved-link': 'warning',
  'orphan-step': 'warning',
  'data-no-source': 'warning',
  'data-never-read': 'warning',
  'data-origin-unresolved': 'warning',
  'extension-unknown-target': 'error',
  'extension-backward-target': 'error',
  'extension-duplicate-id': 'error',
};

export interface Problem {
  code: ProblemCode;
  severity: 'error' | 'warning';
  stepId?: string;
  extensionId?: string;
  /** The data name a data-* problem is about, so a quick fix can target exactly that entry. */
  subject?: string;
  message: string;
}

export interface ScanError {
  code: 'duplicate-id' | 'symlink' | 'oversized' | 'malformed-story' | 'malformed-card' | 'missing-root';
  /** Workspace-relative path the error is about. */
  path: string;
  message: string;
}

export interface StoryboardRoot {
  /** Opaque capability for `create`; not a path. */
  rootId: string;
  /** Workspace-relative, for display only. */
  label: string;
}

export interface ScanResult {
  enabled: boolean;
  writable: boolean;
  catalogue: StoryboardSummary[];
  errors: ScanError[];
  roots: StoryboardRoot[];
}

export interface LinkIndex {
  api: string[];
  events: string[];
  states: string[];
  requirements: string[];
}

export type StoryboardErrorCode = 'conflict' | 'read-only' | 'not-found' | 'invalid' | 'too-large' | 'exists';

export type StoryboardResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; code: 'conflict'; message: string; latestRevision: string }
  | { ok: false; code: Exclude<StoryboardErrorCode, 'conflict'>; message: string };

export interface StoryboardsConfig {
  enabled: boolean;
  /** Workspace-relative folders; a `*` segment matches one directory level. */
  roots: string[];
  maxSourceBytes: number;
  maxAssetBytes: number;
  writable: boolean;
}

export const DEFAULT_STORYBOARDS_CONFIG: StoryboardsConfig = {
  enabled: true,
  roots: ['oms-knowledge-base/storyboards'],
  maxSourceBytes: 1_048_576,
  maxAssetBytes: 524_288,
  writable: true,
};

/** Story front-matter keys a save may change; anything else in the file is kept as it is. */
export const STORY_PATCH_KEYS = ['title', 'status', 'domain', 'owner', 'tags', 'lanes'] as const;
export type StoryPatch = Partial<{
  title: string;
  status: StoryStatus;
  domain: string;
  owner: string;
  tags: string[];
  lanes: Lane[];
}>;

/** Step front-matter keys a save may change. */
export const STEP_PATCH_KEYS = ['title', 'kind', 'from', 'to', 'illustrations', 'links', 'in', 'out', 'extensions'] as const;
export interface StoredIllustration {
  src: string;
  caption?: string;
}
export interface StoredExtension {
  id: string;
  when: string;
  then: string;
  continueAt: ContinueAt;
  illustrations?: StoredIllustration[];
  in?: DataIn[];
  out?: DataOut[];
}
export type StepPatch = Partial<{
  title: string;
  kind: StepKind;
  from: string | null;
  to: string | null;
  illustrations: StoredIllustration[];
  links: Partial<StepLinks>;
  in: DataIn[];
  out: DataOut[];
  extensions: StoredExtension[];
}>;

export type AiAssistKind = 'draftProse' | 'reviewExtensions' | 'suggestLinks';

export type AiProposal =
  | { kind: 'draftProse'; markdown: string }
  | { kind: 'reviewExtensions'; extensions: { when: string; then: string; continueAt: ContinueAt }[] }
  | { kind: 'suggestLinks'; links: StepLinks };
