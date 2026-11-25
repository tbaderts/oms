import type { HttpFile } from './httpFile';

/**
 * API Explorer (SPEC-0076): the operations of the OpenAPI specs a project lists in its
 * `cockpit.yaml` (`apiExplorer.apis`), requests sent from the main process, the request history
 * and `.http` templates. Nothing here knows a particular API.
 */

/** The subset of OpenAPI schema keywords the explorer uses, after $ref/allOf are resolved. */
export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  format?: string;
  example?: unknown;
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  description?: string;
}

export interface ApiParam {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  schema?: JsonSchema;
  description?: string;
}

/** One concrete request body of a polymorphic body (OpenAPI `discriminator` / `oneOf`). */
export interface ApiVariant {
  name: string;
  schema: JsonSchema;
  /** The discriminator property and the value that selects this variant, when the spec has one. */
  discriminator?: { property: string; value: string };
}

export interface ApiOperation {
  /** `operationId`, else `METHOD /path`. Unique within its API. */
  id: string;
  method: string;
  path: string;
  summary?: string;
  params: ApiParam[];
  /** The JSON request body; absent when the operation takes none. */
  requestSchema?: JsonSchema;
  /** The bodies a polymorphic request accepts; empty when the body is not polymorphic. */
  variants: ApiVariant[];
}

export interface ApiInfo {
  name: string;
  baseUrl: string;
  /** Workspace-relative spec file. */
  spec: string;
  title?: string;
  operations: ApiOperation[];
  /** Why the spec could not be read; `operations` is empty then. */
  error?: string;
}

export interface ApiCatalog {
  apis: ApiInfo[];
}

export interface ApiRequest {
  method: string;
  /** Absolute http(s) URL. */
  url: string;
  headers?: Record<string, string>;
  /** Text body (JSON in practice); ignored for GET and HEAD. */
  body?: string;
  /** For the history: the API and operation the request came from, or the template name. */
  label?: string;
}

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
/** Methods that change nothing; any other method to a non-local host needs confirmation. */
export const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

export function isLocalHost(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** `baseUrl` + `path` with `{param}` placeholders filled (encoded) and non-empty query parameters appended. */
export function buildUrl(baseUrl: string, path: string, pathParams: Record<string, string> = {}, query: Record<string, string> = {}): string {
  const filled = path.replace(/\{([^}]+)\}/g, (raw, name: string) => (pathParams[name]?.trim() ? encodeURIComponent(pathParams[name].trim()) : raw));
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v.trim() !== ''));
  const s = qs.toString();
  return `${baseUrl.replace(/\/+$/, '')}${filled}${s ? `?${s}` : ''}`;
}

export interface ApiResponse {
  ok: boolean;
  /** null when no HTTP response was received (unreachable, timeout, refused before sending). */
  status: number | null;
  durationMs: number;
  /** Parsed JSON when the response was JSON, otherwise the text. */
  body: unknown;
  contentType: string;
  url: string;
  error?: string;
  /** The request was refused before it was sent (invalid URL, unconfirmed host, invalid method). */
  refused?: boolean;
}

export interface HistoryEntry {
  id: string;
  at: string;
  label: string;
  method: string;
  /** Path and query, for the list; the full URL is in `url`. */
  path: string;
  url?: string;
  status: number | null;
  durationMs: number;
  request: { body?: string; truncated?: boolean; headers?: Record<string, string> };
  /** Refused before sending; `status: null` without it means the target was not reachable. */
  refused?: boolean;
}

export interface TemplateSource {
  /** Workspace-relative with forward slashes, or absolute when outside the workspace. */
  path: string;
  /** A configured source that does not exist. */
  missing?: boolean;
  /** The file could not be read. */
  error?: string;
  file?: HttpFile;
}

export type SaveTemplateRequest =
  | { path: string; name: string; method: string; url: string; body: string }
  | { newFile: string; name: string; method: string; url: string; body: string };

export type SaveTemplateResult = { ok: true; path: string } | { ok: false; error: string };
