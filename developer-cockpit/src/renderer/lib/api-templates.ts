import type { JsonSchema, TemplateSource } from '@shared/apiExplorer';
import { bodyType, isCommandRequest, templateName } from '@shared/httpFile';
import { buildTemplate, checkBody, type CheckResult } from './api-schema';

/** A command body from a `.http` file, with the file's variables (SPEC-0008). */
export interface CommandTemplate {
  source: string;
  name: string;
  type: string;
  body: string;
  variables: Record<string, string>;
  line: number;
}

export interface UnusableTemplate {
  source: string;
  name: string;
  line: number;
  reason: string;
}

const VARIABLE = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** Groups the execute requests of all sources by command type; the rest of a file is ignored. */
export function classifyTemplates(
  sources: TemplateSource[],
  commandTypes: string[],
): { byType: Record<string, CommandTemplate[]>; unusable: UnusableTemplate[] } {
  const byType: Record<string, CommandTemplate[]> = {};
  const unusable: UnusableTemplate[] = [];
  for (const s of sources) {
    if (!s.file) continue;
    const seen: Record<string, number> = {};
    s.file.requests.filter(isCommandRequest).forEach((r, i) => {
      const fallback = (type: string) => templateName(r, type, (seen[type] = (seen[type] ?? 0) + 1));
      if (!r.body) {
        unusable.push({ source: s.path, name: fallback('command'), line: r.line, reason: 'no body' });
        return;
      }
      let type: unknown;
      try {
        type = bodyType(r.body);
      } catch (err) {
        unusable.push({ source: s.path, name: r.name ?? r.comment ?? `command #${i + 1}`, line: r.line, reason: `invalid JSON: ${(err as Error).message.split('\n')[0]}` });
        return;
      }
      if (typeof type !== 'string' || !commandTypes.includes(type)) {
        const label = typeof type === 'string' ? type : 'command';
        unusable.push({ source: s.path, name: fallback(label), line: r.line, reason: typeof type === 'string' ? `unknown command type ${type}` : 'no command type' });
        return;
      }
      (byType[type] ??= []).push({ source: s.path, name: fallback(type), type, body: r.body, variables: s.file!.variables, line: r.line });
    });
  }
  return { byType, unusable };
}

export interface ResolveContext {
  /** The template file's `@name = value` variables. */
  variables: Record<string, string>;
  /** The followed order, for `{{orderId}}`. */
  orderId: string | null;
  now: () => Date;
  uuid: () => string;
  random: () => number;
}

export const liveContext = (variables: Record<string, string>, orderId: string | null): ResolveContext => ({
  variables,
  orderId,
  now: () => new Date(),
  uuid: () => crypto.randomUUID(),
  random: Math.random,
});

const MAX_DEPTH = 5;

/** Replaces REST Client variables; anything it cannot resolve is left in place and named once. */
export function resolveVariables(text: string, ctx: ResolveContext): { text: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const miss = (name: string, raw: string) => {
    if (!unresolved.includes(name)) unresolved.push(name);
    return raw;
  };

  const resolve = (input: string, depth: number): string =>
    input.replace(VARIABLE, (raw, expr: string) => {
      const [fn, ...args] = expr.split(/\s+/);
      if (fn.startsWith('$')) {
        switch (fn) {
          case '$guid':
            return ctx.uuid();
          case '$timestamp':
            return String(Math.floor(ctx.now().getTime() / 1000));
          case '$datetime':
            return args.length === 1 && args[0] === 'iso8601' ? ctx.now().toISOString() : miss(expr, raw);
          case '$randomInt': {
            const [min, max] = args.map(Number);
            if (args.length !== 2 || !Number.isInteger(min) || !Number.isInteger(max) || max <= min) return miss(expr, raw);
            return String(min + Math.floor(ctx.random() * (max - min)));
          }
          default:
            return miss(expr, raw);
        }
      }
      if (Object.prototype.hasOwnProperty.call(ctx.variables, expr)) {
        if (depth >= MAX_DEPTH) return miss(expr, raw);
        const before = unresolved.length;
        const value = resolve(ctx.variables[expr], depth + 1);
        // A variable whose value cannot be resolved is reported under its own name.
        if (unresolved.length > before) {
          unresolved.splice(before);
          return miss(expr, raw);
        }
        return value;
      }
      if (expr === 'orderId' && ctx.orderId) return ctx.orderId;
      return miss(expr, raw);
    });

  return { text: resolve(text, 0), unresolved };
}

/**
 * Replaces the file variables a body uses that the target file does not declare with their values,
 * so the body still resolves once saved there. System variables stay, to stay fresh per send.
 */
export function inlineFileVariables(body: string, variables: Record<string, string>, declared: Record<string, string>): string {
  const inline = (text: string, depth: number): string =>
    text.replace(VARIABLE, (raw, name: string) => {
      if (depth >= MAX_DEPTH || name in declared || !Object.prototype.hasOwnProperty.call(variables, name)) return raw;
      return inline(variables[name], depth + 1);
    });
  return inline(body, 0);
}

/** The body check on the resolved text; unresolved variables are the only findings then. */
export function checkTemplateBody(text: string, type: string, schema: JsonSchema, ctx: ResolveContext): CheckResult {
  const r = resolveVariables(text, ctx);
  if (r.unresolved.length) {
    return { findings: r.unresolved.map((name) => ({ path: `{{${name}}}`, message: 'unresolved variable' })), unresolved: r.unresolved };
  }
  return checkBody(r.text, type, schema);
}

const PER_SEND: Record<string, string> = {
  clOrdId: '{{$guid}}',
  commandId: '{{$guid}}',
  sendingTime: '{{$datetime iso8601}}',
  transactTime: '{{$datetime iso8601}}',
};

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function replacePerSend(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) if (key in PER_SEND) obj[key] = PER_SEND[key];
}

/** Turns the fields that must differ per send into variables, at the top and one level down. */
export function templatize(bodyText: string): string {
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
  if (!isObject(body)) return bodyText;
  replacePerSend(body);
  for (const v of Object.values(body)) if (isObject(v)) replacePerSend(v);
  return JSON.stringify(body, null, 2);
}

/** Assigned by oms-core, so not part of a new order even though the command schema lists them. */
const SERVER_FIELDS = ['orderId', 'parentOrderId', 'rootOrderId', 'origClOrdId'];
/** Specific to the old order's day; a copied expiry would usually be in the past. */
const DATED_FIELDS = ['expireTime'];

/** An OrderCreateCmd body with an existing order's client fields and fresh per-send values. */
export function orderToTemplate(order: Record<string, unknown>, createSchema: JsonSchema): string {
  const fields = createSchema.properties?.order?.properties ?? {};
  const copy: Record<string, unknown> = {};
  // In the contract's field order, not the query API's.
  for (const key of Object.keys(fields)) {
    const value = order[key];
    if (!SERVER_FIELDS.includes(key) && !DATED_FIELDS.includes(key) && value !== null && value !== undefined) copy[key] = value;
  }
  return templatize(JSON.stringify(buildTemplate('OrderCreateCmd', createSchema, { order: copy })));
}
