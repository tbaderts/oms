import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { ApiConfig } from '../../shared/projectConfig';
import type { ApiCatalog, ApiInfo, ApiOperation, ApiParam, ApiVariant, JsonSchema } from '../../shared/apiExplorer';

type Raw = Record<string, any>;

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'];

/**
 * The operations of the OpenAPI specs a project lists in `apiExplorer.apis` (SPEC-0076). Each
 * request body is resolved into a self-contained schema ($ref and allOf inlined, refs into other
 * files of the spec's folder followed). A polymorphic body (`discriminator.mapping` or a `oneOf`
 * of refs) becomes one variant per concrete schema. Reads on every call; specs stay live.
 */
export class ApiCatalogService {
  constructor(
    private workspaceRoot: string,
    private apis: ApiConfig[],
  ) {}

  load(): ApiCatalog {
    return { apis: this.apis.map((api) => this.loadApi(api)) };
  }

  private loadApi(api: ApiConfig): ApiInfo {
    const info: ApiInfo = { name: api.name, baseUrl: api.baseUrl, spec: api.spec, operations: [] };
    const file = path.resolve(this.workspaceRoot, api.spec);
    const docs = new Docs(path.dirname(file));
    try {
      const doc = docs.get(path.basename(file));
      if (typeof doc.info?.title === 'string') info.title = doc.info.title;
      const name = path.basename(file);
      for (const [p, item] of Object.entries((doc.paths ?? {}) as Record<string, Raw>)) {
        const shared = Array.isArray(item?.parameters) ? item.parameters : [];
        for (const method of METHODS) {
          const op = item?.[method] as Raw | undefined;
          if (!op || typeof op !== 'object') continue;
          info.operations.push(this.operation(method.toUpperCase(), p, op, shared, name, docs));
        }
      }
    } catch (err) {
      info.error = (err as Error).message;
      info.operations = [];
    }
    return info;
  }

  private operation(method: string, p: string, op: Raw, shared: Raw[], file: string, docs: Docs): ApiOperation {
    const params = new Map<string, ApiParam>();
    for (const raw of [...shared, ...(Array.isArray(op.parameters) ? op.parameters : [])]) {
      const param = raw?.$ref ? docs.deref(raw.$ref, file).node : raw;
      if (!param || !['path', 'query', 'header'].includes(param.in) || typeof param.name !== 'string') continue;
      params.set(`${param.in}:${param.name}`, {
        name: param.name,
        in: param.in,
        required: param.in === 'path' || param.required === true,
        ...(param.schema ? { schema: docs.resolve(param.schema, file, new Set()) } : {}),
        ...(typeof param.description === 'string' ? { description: param.description } : {}),
      });
    }

    const result: ApiOperation = {
      id: typeof op.operationId === 'string' && op.operationId ? op.operationId : `${method} ${p}`,
      method,
      path: p,
      ...(typeof op.summary === 'string' ? { summary: op.summary } : {}),
      params: [...params.values()],
      variants: [],
    };

    let body = op.requestBody as Raw | undefined;
    let bodyFile = file;
    if (body?.$ref) ({ node: body, file: bodyFile } = docs.deref(body.$ref, file));
    const content = body?.content as Raw | undefined;
    const media = content && (content['application/json'] ?? Object.entries(content).find(([k]) => /json/i.test(k))?.[1]);
    if (media?.schema) {
      const { node: top, file: topFile } = media.schema.$ref ? docs.deref(media.schema.$ref, bodyFile) : { node: media.schema, file: bodyFile };
      result.requestSchema = docs.resolve(media.schema, bodyFile, new Set());
      result.variants = this.variants(top, topFile, docs);
    }
    return result;
  }

  /** One variant per mapping entry, or per `$ref` of a `oneOf`. */
  private variants(schema: Raw, file: string, docs: Docs): ApiVariant[] {
    const property = typeof schema?.discriminator?.propertyName === 'string' ? schema.discriminator.propertyName : undefined;
    const mapping = schema?.discriminator?.mapping;
    if (mapping && typeof mapping === 'object') {
      return Object.entries(mapping as Record<string, string>).map(([value, ref]) => ({
        name: value,
        schema: docs.resolve({ $ref: ref }, file, new Set()),
        ...(property ? { discriminator: { property, value } } : {}),
      }));
    }
    if (Array.isArray(schema?.oneOf)) {
      return schema.oneOf.map((s: Raw, i: number) => {
        const name = typeof s?.$ref === 'string' ? s.$ref.split('/').pop()! : `Variant ${i + 1}`;
        return { name, schema: docs.resolve(s, file, new Set()), ...(property ? { discriminator: { property, value: name } } : {}) };
      });
    }
    return [];
  }
}

/** The YAML files of one spec folder, loaded on first use. */
class Docs {
  private cache = new Map<string, Raw>();

  constructor(private dir: string) {}

  get(name: string): Raw {
    const file = path.resolve(this.dir, name);
    // Refs stay inside the spec's folder tree.
    const rel = path.relative(this.dir, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`${name}: a $ref may not leave the spec folder`);
    let doc = this.cache.get(file);
    if (!doc) {
      if (!fs.existsSync(file)) throw new Error(`${path.basename(file)} not found in ${this.dir}`);
      try {
        doc = (yaml.load(fs.readFileSync(file, 'utf-8')) ?? {}) as Raw;
      } catch (err) {
        throw new Error(`${path.basename(file)}: ${(err as Error).message.split('\n')[0]}`);
      }
      this.cache.set(file, doc);
    }
    return doc;
  }

  /** The node a `$ref` points at, and the file it lives in. */
  deref(ref: string, file: string): { node: Raw; file: string } {
    const [refFile, pointer = ''] = String(ref).split('#');
    // A file ref is relative to the file that contains it; names are kept relative to the spec folder.
    const target = refFile ? path.relative(this.dir, path.resolve(this.dir, path.dirname(file), refFile)) || refFile : file;
    const node = pointer
      .split('/')
      .filter(Boolean)
      .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
      .reduce<Raw | undefined>((n, part) => n?.[part], this.get(target));
    if (!node) throw new Error(`${file}: unresolvable $ref ${ref}`);
    return { node, file: target };
  }

  /** Inlines $ref and merges allOf; a ref seen again on the same path becomes {}. */
  resolve(node: Raw, file: string, seen: Set<string>): JsonSchema {
    if (!node || typeof node !== 'object') return {};
    if (node.$ref) {
      const { node: found, file: target } = this.deref(node.$ref, file);
      const key = `${target}#${String(node.$ref).split('#')[1] ?? ''}`;
      if (seen.has(key)) return {};
      const resolved = this.resolve(found, target, new Set(seen).add(key));
      return node.description ? { ...resolved, description: node.description } : resolved;
    }

    if (Array.isArray(node.allOf)) {
      const parts = node.allOf.map((p: Raw) => this.resolve(p, file, seen));
      const merged: JsonSchema = parts.length === 1 ? { ...parts[0] } : { type: 'object' };
      if (parts.length > 1) {
        for (const p of parts) {
          if (p.properties) merged.properties = { ...merged.properties, ...p.properties };
          if (p.required) merged.required = [...new Set([...(merged.required ?? []), ...p.required])];
          if (p.description && !merged.description) merged.description = p.description;
        }
      }
      if (node.description) merged.description = node.description;
      return merged;
    }

    const out: JsonSchema = {};
    for (const k of ['type', 'required', 'enum', 'format', 'example', 'default', 'minLength', 'maxLength', 'description'] as const) {
      if (node[k] !== undefined) (out as Raw)[k] = node[k];
    }
    if (node.properties) {
      out.properties = {};
      for (const [name, prop] of Object.entries(node.properties as Record<string, Raw>)) {
        out.properties[name] = this.resolve(prop, file, seen);
      }
    }
    if (node.items) out.items = this.resolve(node.items, file, seen);
    return out;
  }
}
