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

export interface CodeGenTask {
  id: string;
  name: string;
  description: string;
  inputSpec: string;
  outputPackage: string;
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
