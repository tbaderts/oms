import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { CommandCatalog, JsonSchema } from '../../shared/apiExplorer';

const CMD_API = 'oms-cmd-api.yml';
const COMMON = 'schema.yml';
/** schema.yml enums the explorer offers as filter values. */
const ENUMS = ['State', 'CancelState', 'Side', 'OrdType'];

type Raw = Record<string, any>;

/**
 * Reads the command API from the contracts and resolves each command type into a self-contained
 * schema ($ref and allOf inlined). Reads on every call; the files are small and must stay live.
 */
export class ApiCatalogService {
  constructor(
    private workspaceRoot: string,
    private openApiPaths: string[],
  ) {}

  load(): CommandCatalog {
    try {
      const docs: Record<string, Raw> = { [CMD_API]: this.read(CMD_API), [COMMON]: this.read(COMMON) };
      const mapping = docs[CMD_API]?.components?.schemas?.Command?.discriminator?.mapping;
      if (!mapping || typeof mapping !== 'object') {
        return { commandTypes: [], schemas: {}, error: `${CMD_API}: Command has no discriminator mapping` };
      }
      const commandTypes = Object.keys(mapping);
      const schemas: Record<string, JsonSchema> = {};
      for (const type of commandTypes) {
        schemas[type] = this.resolve({ $ref: mapping[type] }, CMD_API, docs, new Set());
      }
      for (const name of ENUMS) {
        schemas[`enum:${name}`] = this.resolve({ $ref: `#/components/schemas/${name}` }, COMMON, docs, new Set());
      }
      return { commandTypes, schemas };
    } catch (err) {
      return { commandTypes: [], schemas: {}, error: (err as Error).message };
    }
  }

  private read(name: string): Raw {
    for (const dir of this.openApiPaths) {
      const file = path.resolve(this.workspaceRoot, dir, name);
      if (!fs.existsSync(file)) continue;
      try {
        return yaml.load(fs.readFileSync(file, 'utf-8')) as Raw;
      } catch (err) {
        throw new Error(`${name}: ${(err as Error).message.split('\n')[0]}`);
      }
    }
    throw new Error(`${name} not found in ${this.openApiPaths.join(', ')}`);
  }

  /** Inlines $ref (same file or schema.yml) and merges allOf; a ref seen again on the same path becomes {}. */
  private resolve(node: Raw, file: string, docs: Record<string, Raw>, seen: Set<string>): JsonSchema {
    if (node.$ref) {
      const [refFile, pointer] = String(node.$ref).split('#');
      const target = refFile || file;
      const key = `${target}#${pointer}`;
      if (seen.has(key)) return {};
      const doc = docs[target];
      if (!doc) throw new Error(`${file}: unresolvable $ref ${node.$ref}`);
      const found = pointer.split('/').filter(Boolean).reduce<Raw | undefined>((n, part) => n?.[part], doc);
      if (!found) throw new Error(`${file}: unresolvable $ref ${node.$ref}`);
      const resolved = this.resolve(found, target, docs, new Set(seen).add(key));
      return node.description ? { ...resolved, description: node.description } : resolved;
    }

    if (Array.isArray(node.allOf)) {
      const parts = node.allOf.map((p: Raw) => this.resolve(p, file, docs, seen));
      const merged: JsonSchema = parts.length === 1 ? { ...parts[0] } : { type: 'object' };
      if (parts.length > 1) {
        for (const p of parts) {
          merged.properties = { ...merged.properties, ...p.properties };
          merged.required = [...new Set([...(merged.required ?? []), ...(p.required ?? [])])];
          if (p.description && !merged.description) merged.description = p.description;
        }
      }
      if (node.description) merged.description = node.description;
      return merged;
    }

    const out: JsonSchema = {};
    for (const k of ['type', 'required', 'enum', 'format', 'example', 'minLength', 'maxLength', 'description'] as const) {
      if (node[k] !== undefined) (out as Raw)[k] = node[k];
    }
    if (node.properties) {
      out.properties = {};
      for (const [name, prop] of Object.entries(node.properties as Record<string, Raw>)) {
        out.properties[name] = this.resolve(prop, file, docs, seen);
      }
    }
    if (node.items) out.items = this.resolve(node.items, file, docs, seen);
    return out;
  }
}
