import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { SpecsConfig } from '../../shared/types/config';
import type { SpecFile, SpecValidationResult, DomainEntity, DomainField } from '../../shared/types/specs';

export class SpecsService {
  constructor(
    private workspaceRoot: string,
    private specsConfig: SpecsConfig,
  ) {}

  discoverFiles(): SpecFile[] {
    const files: SpecFile[] = [];

    for (const relDir of this.specsConfig.openApiPaths) {
      const absDir = path.join(this.workspaceRoot, relDir);
      this.scanDir(absDir, relDir, 'openapi', ['.yml', '.yaml'], files);
    }

    for (const relDir of this.specsConfig.avroPaths) {
      const absDir = path.join(this.workspaceRoot, relDir);
      this.scanDir(absDir, relDir, 'avro', ['.avsc'], files);
    }

    return files;
  }

  private scanDir(
    absDir: string,
    relDir: string,
    type: 'openapi' | 'avro',
    extensions: string[],
    out: SpecFile[],
  ): void {
    if (!fs.existsSync(absDir)) return;
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      const ext = path.extname(entry.name);
      if (!extensions.includes(ext)) continue;
      const fullPath = path.join(absDir, entry.name);
      const relativePath = path.join(relDir, entry.name).replace(/\\/g, '/');
      out.push({
        path: fullPath,
        relativePath,
        name: entry.name,
        type,
        extension: ext as '.yml' | '.avsc',
      });
    }
  }

  readFile(filePath: string): string {
    this.validatePathWithinWorkspace(filePath);
    return fs.readFileSync(filePath, 'utf-8');
  }

  writeFile(filePath: string, content: string): void {
    this.validatePathWithinSpecDirs(filePath);
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  validate(_filePath: string, content: string): SpecValidationResult {
    const ext = path.extname(_filePath).toLowerCase();
    const errors: string[] = [];

    try {
      if (ext === '.avsc' || ext === '.json') {
        JSON.parse(content);
      } else {
        yaml.load(content);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
    }

    return { valid: errors.length === 0, errors };
  }

  parseEntities(): DomainEntity[] {
    const entities: DomainEntity[] = [];
    const files = this.discoverFiles();

    for (const file of files) {
      try {
        const content = fs.readFileSync(file.path, 'utf-8');
        if (file.type === 'openapi') {
          this.parseOpenApiEntities(content, entities);
        } else {
          this.parseAvroEntity(content, entities);
        }
      } catch {
        // Skip unparseable files
      }
    }

    return entities;
  }

  private parseOpenApiEntities(content: string, out: DomainEntity[]): void {
    const doc = yaml.load(content) as Record<string, unknown>;
    const components = doc?.components as Record<string, unknown> | undefined;
    const schemas = components?.schemas as Record<string, unknown> | undefined;
    if (!schemas) return;

    for (const [name, schemaDef] of Object.entries(schemas)) {
      const schema = schemaDef as Record<string, unknown>;
      if (!schema) continue;

      const isEnum = schema.type === 'string' && Array.isArray(schema.enum);
      const isCommand = name.endsWith('Cmd');
      const kind: DomainEntity['kind'] = isEnum ? 'enum' : isCommand ? 'command' : 'record';

      const fields: DomainField[] = [];
      const references: string[] = [];

      if (isEnum) {
        // Store enum values as fields with name=value
        for (const val of schema.enum as string[]) {
          fields.push({
            name: val,
            type: 'enum-value',
            doc: '',
            required: false,
            isEnum: false,
            isRef: false,
            refTarget: '',
          });
        }
      } else {
        // Handle allOf (inheritance)
        const allOf = schema.allOf as Record<string, unknown>[] | undefined;
        const directProps = schema.properties as Record<string, unknown> | undefined;
        const requiredFields = (schema.required as string[]) || [];

        let properties: Record<string, unknown> = {};
        let combinedRequired: string[] = [...requiredFields];

        if (allOf) {
          for (const part of allOf) {
            if (part.$ref) {
              const refName = this.extractRefName(part.$ref as string);
              if (refName) references.push(refName);
            }
            if (part.properties) {
              properties = { ...properties, ...(part.properties as Record<string, unknown>) };
            }
            if (part.required) {
              combinedRequired.push(...(part.required as string[]));
            }
          }
        }
        if (directProps) {
          properties = { ...properties, ...directProps };
        }

        for (const [fieldName, fieldDef] of Object.entries(properties)) {
          const field = fieldDef as Record<string, unknown>;
          const { typeName, refTarget } = this.resolveOpenApiFieldType(field);
          const isRef = !!refTarget;

          if (refTarget && !references.includes(refTarget)) {
            references.push(refTarget);
          }

          fields.push({
            name: fieldName,
            type: typeName,
            doc: (field.description as string) || '',
            required: combinedRequired.includes(fieldName),
            isEnum: isRef, // refs to enums in this schema are all enums
            isRef,
            refTarget: refTarget || '',
          });
        }
      }

      out.push({ name, source: 'openapi', kind, fields, references });
    }
  }

  private resolveOpenApiFieldType(field: Record<string, unknown>): { typeName: string; refTarget: string } {
    // Direct $ref
    if (field.$ref) {
      const refName = this.extractRefName(field.$ref as string);
      return { typeName: refName || 'object', refTarget: refName || '' };
    }

    // allOf with $ref (common pattern: allOf: [{ $ref: '...' }])
    if (Array.isArray(field.allOf)) {
      for (const part of field.allOf as Record<string, unknown>[]) {
        if (part.$ref) {
          const refName = this.extractRefName(part.$ref as string);
          return { typeName: refName || 'object', refTarget: refName || '' };
        }
      }
    }

    const type = (field.type as string) || 'object';
    const format = field.format as string | undefined;
    if (format) return { typeName: `${type}(${format})`, refTarget: '' };
    return { typeName: type, refTarget: '' };
  }

  private extractRefName(ref: string): string | null {
    // Handles both '#/components/schemas/Name' and 'schema.yml#/components/schemas/Name'
    const match = ref.match(/\/schemas\/([^/]+)$/);
    return match ? match[1] : null;
  }

  private parseAvroEntity(content: string, out: DomainEntity[]): void {
    const schema = JSON.parse(content) as Record<string, unknown>;
    const name = schema.name as string;
    if (!name) return;

    const avroType = schema.type as string;
    const isEnum = avroType === 'enum';
    const isCommand = name.endsWith('Cmd');
    const kind: DomainEntity['kind'] = isEnum ? 'enum' : isCommand ? 'command' : 'record';

    const fields: DomainField[] = [];
    const references: string[] = [];

    if (isEnum) {
      const symbols = (schema.symbols as string[]) || [];
      for (const val of symbols) {
        fields.push({
          name: val,
          type: 'enum-value',
          doc: (schema.doc as string) || '',
          required: false,
          isEnum: false,
          isRef: false,
          refTarget: '',
        });
      }
    } else {
      const avroFields = (schema.fields as Record<string, unknown>[]) || [];
      for (const f of avroFields) {
        const fieldName = f.name as string;
        const { typeName, refTarget } = this.resolveAvroFieldType(f.type);
        const isRef = !!refTarget;

        if (refTarget && !references.includes(refTarget)) {
          references.push(refTarget);
        }

        fields.push({
          name: fieldName,
          type: typeName,
          doc: (f.doc as string) || '',
          required: f.default === undefined,
          isEnum: isRef,
          isRef,
          refTarget: refTarget || '',
        });
      }
    }

    out.push({ name, source: 'avro', kind, fields, references });
  }

  private resolveAvroFieldType(avroType: unknown): { typeName: string; refTarget: string } {
    if (typeof avroType === 'string') {
      const refTarget = this.extractAvroRefName(avroType);
      return { typeName: refTarget || avroType, refTarget: refTarget || '' };
    }

    if (Array.isArray(avroType)) {
      // Union type, e.g. ["null", "string"] or ["null", "org.example.common.model.msg.Side"]
      const nonNull = avroType.filter((t) => t !== 'null');
      if (nonNull.length === 1) {
        const inner = nonNull[0];
        if (typeof inner === 'string') {
          const refTarget = this.extractAvroRefName(inner);
          return { typeName: refTarget || inner, refTarget: refTarget || '' };
        }
      }
      return { typeName: avroType.filter((t) => t !== 'null').join(' | '), refTarget: '' };
    }

    return { typeName: 'object', refTarget: '' };
  }

  private extractAvroRefName(fqn: string): string | null {
    // Fully-qualified Avro names like "org.example.common.model.msg.Side" → "Side"
    if (fqn.includes('.')) {
      return fqn.split('.').pop() || null;
    }
    return null;
  }

  private validatePathWithinWorkspace(filePath: string): void {
    const resolved = path.resolve(filePath);
    const wsRoot = path.resolve(this.workspaceRoot);
    if (!resolved.startsWith(wsRoot)) {
      throw new Error(`Path ${filePath} is outside workspace`);
    }
  }

  private validatePathWithinSpecDirs(filePath: string): void {
    const resolved = path.resolve(filePath);
    const allDirs = [...this.specsConfig.openApiPaths, ...this.specsConfig.avroPaths];
    const withinSpec = allDirs.some((relDir) => {
      const absDir = path.resolve(this.workspaceRoot, relDir);
      return resolved.startsWith(absDir);
    });
    if (!withinSpec) {
      throw new Error(`Path ${filePath} is not within spec directories`);
    }
  }
}
