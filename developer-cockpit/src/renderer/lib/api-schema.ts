import type { JsonSchema } from '@shared/apiExplorer';

/** Placeholder for a required string, so the template passes the check while showing what to fill in. */
const placeholder = (name: string) => `<${name}>`;

function sample(name: string, s: JsonSchema): unknown {
  if (s.enum?.length) return s.enum[0];
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
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

/**
 * A request body for `schema` with every required property filled. For a variant of a polymorphic
 * body, the discriminator property is set to the value that selects it and comes first.
 */
export function buildBody(schema: JsonSchema, discriminator?: { property: string; value: string }): unknown {
  const body = sample('body', schema);
  if (!discriminator || !body || typeof body !== 'object' || Array.isArray(body)) return body;
  const { [discriminator.property]: _old, ...rest } = body as Record<string, unknown>;
  return { [discriminator.property]: discriminator.value, ...rest };
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

/**
 * Checks a JSON body against its schema; findings are warnings, a parse error blocks sending. With a
 * discriminator, a body that names another variant is reported first.
 */
export function checkBody(text: string, schema: JsonSchema, discriminator?: { property: string; value: string }): CheckResult {
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
  const d = discriminator;
  if (d && kindOf(body) === 'object' && body![d.property] !== undefined && body![d.property] !== d.value) {
    const at = findings.findIndex((f) => f.path === d.property);
    if (at >= 0) findings.splice(at, 1);
    findings.unshift({ path: d.property, message: `expected "${d.value}"` });
  }
  return { findings };
}
