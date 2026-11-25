/**
 * Folder layout of the knowledge base that the cockpit reads (SPEC-0061). Paths are relative to
 * the knowledge base root and '/'-separated; join them with `path.join` before touching the disk.
 * The okf-check checker enforces the same layout (tools/okf-check/okf-check.mjs).
 */
export const CAPABILITIES_DIR = 'capabilities';
export const USE_CASES_DIR = 'capabilities/use-cases';
export const ACTORS_DIR = 'capabilities/actors';
export const FR_DIR = 'capabilities/functional-requirements';
export const NFR_DIR = 'capabilities/non-functional-requirements';
export const REQUIREMENT_DIRS = [FR_DIR, NFR_DIR] as const;
