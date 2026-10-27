import type { JsonSchema } from '@shared/apiExplorer';

/** Placeholder for a required string, so the template passes the check while showing what to fill in. */
const placeholder = (name: string) => `<${name}>`;

function sample(name: string, s: JsonSchema): unknown {
  if (s.enum?.length) return s.enum[0];
  if (s.example !== undefined) return s.example;
  if (s.type === 'object' || s.properties) {
    const obj: Record<string, unknown> = {};
    for (const req of s.required ?? []) obj[req] = sample(req, s.properties?.[req] ?? {});
    return obj;
  }
  switch (s.type) {
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'string':
      if (s.format === 'date-time') return new Date().toISOString();
      return (s.minLength ?? 0) > 0 ? placeholder(name) : '';
    default:
      return placeholder(name);
  }
}

/** Sets `key` on the body and on every nested object whose schema has that property (e.g. execution.orderId). */
function applyPreset(body: Record<string, unknown>, s: JsonSchema, preset: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(preset)) {
    if (s.properties?.[key]) body[key] = value;
  }
  for (const [name, child] of Object.entries(s.properties ?? {})) {
    const nested = body[name];
    if (child.properties && nested && typeof nested === 'object' && !Array.isArray(nested)) {
      applyPreset(nested as Record<string, unknown>, child, preset);
    }
  }
}

/** A body for `type` with every required property filled, plus `preset` values where the schema has them. */
export function buildTemplate(type: string, schema: JsonSchema, preset: Record<string, unknown> = {}): Record<string, unknown> {
  const body = sample('body', schema) as Record<string, unknown>;
  body.type = type;
  if (schema.properties?.version) body.version = '1.0.0';
  applyPreset(body, schema, preset);
  // Keep `type` and `version` first, as in the API examples.
  const { type: t, version, ...rest } = body;
  return { type: t, ...(version !== undefined ? { version } : {}), ...rest };
}

export interface Finding {
  path: string;
  message: string;
}

export interface CheckResult {
  parseError?: string;
  findings: Finding[];
  /** Template variables that could not be resolved; sending is blocked while there are any. */
  unresolved?: string[];
}

const kindOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function walk(value: unknown, s: JsonSchema, path: string, out: Finding[]): void {
  const at = path || '(body)';
  if (s.enum) {
    if (!s.enum.includes(value)) out.push({ path: at, message: `${JSON.stringify(value)} is not one of ${s.enum.join(', ')}` });
    return;
  }
  const expected = s.type ?? (s.properties ? 'object' : undefined);
  if (!expected) return;
  const actual = kindOf(value);
  const matches = expected === 'integer' ? Number.isInteger(value) : expected === actual;
  if (!matches) {
    out.push({ path: at, message: `expected ${expected}, got ${actual}` });
    return;
  }
  if (typeof value === 'string') {
    if (s.minLength !== undefined && value.length < s.minLength) {
      out.push({ path: at, message: `shorter than ${s.minLength} character${s.minLength === 1 ? '' : 's'}` });
    }
    if (s.maxLength !== undefined && value.length > s.maxLength) {
      out.push({ path: at, message: `longer than ${s.maxLength} characters` });
    }
  }
  if (actual === 'object') {
    const obj = value as Record<string, unknown>;
    for (const req of s.required ?? []) {
      if (obj[req] === undefined) out.push({ path: path ? `${path}.${req}` : req, message: 'required property is missing' });
    }
    // Unknown properties are not reported: the server ignores them.
    // No schema in the contracts is nullable, so null is checked like any other value.
    for (const [name, child] of Object.entries(s.properties ?? {})) {
      if (obj[name] !== undefined) walk(obj[name], child, path ? `${path}.${name}` : name, out);
    }
  }
  if (actual === 'array' && s.items) {
    (value as unknown[]).forEach((item, i) => walk(item, s.items!, `${path}[${i}]`, out));
  }
}

/** Offset of the first JSON syntax error. JSON.parse messages do not reliably carry one. */
function errorOffset(text: string): number {
  let i = 0;
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) i++;
  };
  const fail = (): never => {
    throw i;
  };
  const value = (): void => {
    ws();
    const c = text[i];
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']';
      i++;
      ws();
      if (text[i] === close) return void i++;
      for (;;) {
        if (c === '{') {
          ws();
          if (text[i] !== '"') fail();
          str();
          ws();
          if (text[i] !== ':') fail();
          i++;
        }
        value();
        ws();
        if (text[i] === ',') i++;
        else if (text[i] === close) return void i++;
        else fail();
      }
    }
    if (c === '"') return str();
    const m = /^(-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i));
    if (!m) fail();
    i += m![0].length;
  };
  const str = () => {
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\n') fail();
      i += text[i] === '\\' ? 2 : 1;
    }
    if (i >= text.length) fail();
    i++;
  };
  try {
    value();
    ws();
    if (i < text.length) fail();
    return text.length;
  } catch (at) {
    return typeof at === 'number' ? at : 0;
  }
}

function position(text: string, offset: number): string {
  const before = text.slice(0, offset).split('\n');
  return `line ${before.length}, column ${before[before.length - 1].length + 1}`;
}

/** Checks a command body against its schema; findings are warnings, a parse error blocks sending. */
export function checkBody(text: string, type: string, schema: JsonSchema): CheckResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    const reason = (err as Error).message.split('\n')[0].replace(/, "[\s\S]*" is not valid JSON$/, '');
    return { parseError: `Invalid JSON at ${position(text, errorOffset(text))}: ${reason}`, findings: [] };
  }
  const findings: Finding[] = [];
  walk(value, schema, '', findings);
  const body = value as Record<string, unknown> | null;
  if (kindOf(body) === 'object' && body!.type !== undefined && body!.type !== type) {
    const at = findings.findIndex((f) => f.path === 'type');
    if (at >= 0) findings.splice(at, 1);
    findings.unshift({ path: 'type', message: `expected "${type}"` });
  }
  return { findings };
}

/**
 * Whether a command acts on an existing order: `orderId` at the top, or required one level down
 * (execution.orderId). The new order of OrderCreateCmd has an optional orderId and does not count.
 */
export function namesOrder(schema: JsonSchema): boolean {
  if (schema.properties?.orderId) return true;
  return Object.values(schema.properties ?? {}).some((p) => Boolean(p.properties?.orderId && p.required?.includes('orderId')));
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** The order a sent command concerns: the created id, the execution's order or the command's orderId. */
export function orderIdOf(body: unknown, response: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, any>;
  if (b.type === 'OrderCreateCmd') {
    const r = response as Record<string, unknown> | null;
    return r?.status === 'OK' ? str(r.id) : null;
  }
  if (b.type === 'ExecutionCreateCmd') return str(b.execution?.orderId);
  return str(b.orderId);
}
