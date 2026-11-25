/**
 * REST Client variables in `.http` templates (SPEC-0008): the file's `@name = value` variables and
 * the system variables `{{$guid}}`, `{{$timestamp}}`, `{{$datetime iso8601}}` and
 * `{{$randomInt min max}}`.
 */

const VARIABLE = /\{\{\s*([^{}]*?)\s*\}\}/g;

export interface ResolveContext {
  /** The template file's `@name = value` variables. */
  variables: Record<string, string>;
  now: () => Date;
  uuid: () => string;
  random: () => number;
}

export const liveContext = (variables: Record<string, string>): ResolveContext => ({
  variables,
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
      return miss(expr, raw);
    });

  return { text: resolve(text, 0), unresolved };
}

/**
 * Replaces the file variables a text uses that the target file does not declare with their values,
 * so the request still resolves once saved there. System variables stay, to stay fresh per send.
 */
export function inlineFileVariables(text: string, variables: Record<string, string>, declared: Record<string, string>): string {
  const inline = (t: string, depth: number): string =>
    t.replace(VARIABLE, (raw, name: string) => {
      if (depth >= MAX_DEPTH || name in declared || !Object.prototype.hasOwnProperty.call(variables, name)) return raw;
      return inline(variables[name], depth + 1);
    });
  return inline(text, 0);
}
