export interface SpecFile {
  path: string;
  relativePath: string;
  name: string;
  type: 'openapi' | 'avro';
  extension: '.yml' | '.avsc';
}

export interface SpecValidationResult {
  valid: boolean;
  errors: string[];
}

/** A code-generation task from the project's `cockpit.yaml` (`codegen`, SPEC-0076). */
export interface CodeGenTask {
  id: string;
  name: string;
  description: string;
  /** Workspace-relative folder the command runs in. */
  cwd: string;
  /** The command and its arguments, e.g. `["./gradlew", "build"]`. */
  command: string[];
  /** Used instead of `command` on Windows, e.g. `[".\\gradlew.bat", "build"]`. */
  windowsCommand?: string[];
  /** What the task reads, shown on its card. */
  inputs?: string;
}

export interface CodeGenResult {
  taskId: string;
  success: boolean;
  output: string;
  durationMs: number;
}

export interface DomainEntity {
  name: string;
  source: 'openapi' | 'avro';
  kind: 'record' | 'enum' | 'command';
  fields: DomainField[];
  references: string[];
}

export interface DomainField {
  name: string;
  type: string;
  doc: string;
  required: boolean;
  isEnum: boolean;
  isRef: boolean;
  refTarget: string;
}
