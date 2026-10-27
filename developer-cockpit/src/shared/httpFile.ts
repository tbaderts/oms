// The subset of the VS Code REST Client `.http` format the API Explorer uses for templates
// (SPEC-0008): requests separated by `###`, `# @name`, comments and `@var = value` file variables.

export interface HttpRequestBlock {
  /** From `# @name X` or `// @name X`. */
  name: string | null;
  /** The last plain comment line before the request line. */
  comment: string | null;
  /** Upper case; a bare URL line is GET. */
  method: string;
  /** As written, variables unresolved. */
  url: string;
  /** Text after the headers, trimmed at the end; null when there is none. */
  body: string | null;
  /** 1-based line of the request line. */
  line: number;
}

export interface HttpFile {
  variables: Record<string, string>;
  requests: HttpRequestBlock[];
}

const SEPARATOR = /^###/;
const COMMENT = /^\s*(#|\/\/)\s?(.*)$/;
const NAME = /^@name\s+(.+?)\s*$/;
const VARIABLE = /^@([A-Za-z_][\w.-]*)\s*=\s*(.*?)\s*$/;
const REQUEST = /^([A-Za-z]+)\s+(\S+)(\s+HTTP\/[\d.]+)?\s*$/;

export function parseHttpFile(text: string): HttpFile {
  const lines = text.split(/\r?\n/);
  const variables: Record<string, string> = {};
  const requests: HttpRequestBlock[] = [];

  let name: string | null = null;
  let comment: string | null = null;
  let current: HttpRequestBlock | null = null;
  let inBody = false;
  let body: string[] = [];

  const finish = () => {
    if (current) {
      const text = body.join('\n').replace(/\s+$/, '');
      current.body = text ? text : null;
      requests.push(current);
    }
    name = null;
    comment = null;
    current = null;
    inBody = false;
    body = [];
  };

  lines.forEach((line, i) => {
    if (SEPARATOR.test(line)) {
      finish();
      return;
    }
    if (inBody) {
      body.push(line);
      return;
    }
    const c = COMMENT.exec(line);
    if (c) {
      const n = NAME.exec(c[2].trim());
      if (n) name = n[1];
      else if (!current && c[2].trim()) comment = c[2].trim();
      return;
    }
    const v = VARIABLE.exec(line.trim());
    if (v) {
      variables[v[1]] = v[2];
      return;
    }
    if (!current) {
      if (!line.trim()) return;
      const r = REQUEST.exec(line.trim());
      const [method, url] = r ? [r[1].toUpperCase(), r[2]] : ['GET', line.trim()];
      current = { name, comment, method, url, body: null, line: i + 1 };
      return;
    }
    // Headers run up to the first blank line; the body follows.
    if (!line.trim()) inBody = true;
  });
  finish();

  return { variables, requests };
}

export const isCommandRequest = (r: HttpRequestBlock): boolean =>
  r.method === 'POST' && /\/api\/command\/execute\/?$/.test(r.url.split('?')[0]);

/** The name a template is listed under: `@name`, else the comment above it, else `<type> #n`. */
export const templateName = (r: HttpRequestBlock, type: string, n: number): string => r.name ?? r.comment ?? `${type} #${n}`;

/** One execute request as a `.http` block, to append to a file; the body is written as given. */
export function formatTemplateBlock(name: string, url: string, body: string): string {
  return `\n###\n# @name ${name}\nPOST ${url} HTTP/1.1\ncontent-type: application/json\n\n${body}\n`;
}

const VARIABLE_REF = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** The `type` of a template body; variables may stand for numbers, so they are read as 0. Throws on invalid JSON. */
export function bodyType(body: string): unknown {
  return JSON.parse(body.replace(VARIABLE_REF, '0'))?.type;
}

/** The names the requests of a file are listed under, as the API Explorer lists them (`<type> #n` counted per type). */
export function effectiveNames(file: HttpFile): string[] {
  const seen: Record<string, number> = {};
  return file.requests.map((r) => {
    if (r.name ?? r.comment) return (r.name ?? r.comment)!;
    if (!isCommandRequest(r)) return '';
    let type: unknown;
    try {
      type = r.body ? bodyType(r.body) : undefined;
    } catch {
      // unnamed invalid JSON has no listed name to clash with
    }
    const label = typeof type === 'string' ? type : 'command';
    return templateName(r, label, (seen[label] = (seen[label] ?? 0) + 1));
  });
}
