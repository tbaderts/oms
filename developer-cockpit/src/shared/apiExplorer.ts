import type { HttpFile } from './httpFile';

/**
 * API Explorer: shared types, the oms-core paths the contracts leave out, and the query API's
 * filter vocabulary (SPEC-0007).
 */

export const DEFAULT_OMS_CORE_URL = 'http://localhost:8090';

/** The contracts declare no `servers`; oms-core serves the command and query APIs under these prefixes. */
export const API_PREFIX = { command: '/api/command', query: '/api/query' } as const;
export const COMMAND_PATH = `${API_PREFIX.command}/execute`;
export const SEARCH_PATH = `${API_PREFIX.query}/search`;
/** Internal, uncontracted oms-core endpoint (`OrderEventController`, `@Hidden`). */
export const eventsPath = (orderId: string) => `/api/order-events/orderId/${encodeURIComponent(orderId)}`;

/** The subset of OpenAPI schema keywords the explorer uses, after $ref/allOf are resolved. */
export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  format?: string;
  example?: unknown;
  minLength?: number;
  maxLength?: number;
  description?: string;
}

export interface CommandCatalog {
  /** Command types in the order of the `Command` discriminator mapping. */
  commandTypes: string[];
  /** Bundled schema per command type, plus `enum:<Name>` for the shared enums. */
  schemas: Record<string, JsonSchema>;
  error?: string;
}

export type FilterKind = 'string' | 'numeric' | 'datetime' | 'enum';
export type FilterOp = 'eq' | 'like' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';

export interface FilterField {
  field: string;
  kind: FilterKind;
  ops: FilterOp[];
  /** Name of the schema.yml enum holding the allowed values, for enum fields. */
  enumName?: string;
}

const RANGE_OPS: FilterOp[] = ['eq', 'gt', 'gte', 'lt', 'lte', 'between'];
const field = (name: string, kind: FilterKind, enumName?: string): FilterField => ({
  field: name,
  kind,
  ops: kind === 'string' ? ['eq', 'like'] : kind === 'enum' ? ['eq'] : RANGE_OPS,
  ...(enumName ? { enumName } : {}),
});

/** Mirrors the "Filterable fields" of oms-query-api.yml (and `OrderSpecifications`); a test keeps them in step. */
export const FILTER_FIELDS: FilterField[] = [
  ...['orderId', 'rootOrderId', 'parentOrderId', 'clOrdId', 'account', 'symbol', 'securityId'].map((f) => field(f, 'string')),
  ...['price', 'orderQty', 'cashOrderQty'].map((f) => field(f, 'numeric')),
  ...['sendingTime', 'transactTime', 'expireTime', 'orderReceivedTime', 'ackTime', 'marketSendTime', 'marketAckTime'].map((f) =>
    field(f, 'datetime'),
  ),
  field('side', 'enum', 'Side'),
  field('ordType', 'enum', 'OrdType'),
  field('state', 'enum', 'State'),
  field('cancelState', 'enum', 'CancelState'),
];

export interface QueryParam {
  field: string;
  op: FilterOp;
  /** For `between`: `low,high` (either side may be empty). */
  value: string;
}

export interface Paging {
  page?: number;
  size?: number;
  sort?: string;
}

/** Query string for the search API. Throws on a field or operator the API does not support. */
export function toSearchParams(params: QueryParam[], paging: Paging): URLSearchParams {
  const qs = new URLSearchParams();
  for (const p of params) {
    const f = FILTER_FIELDS.find((x) => x.field === p.field);
    if (!f) throw new Error(`Unknown filter field: ${p.field}`);
    if (!f.ops.includes(p.op)) throw new Error(`Operator ${p.op} is not valid for ${p.field}`);
    if (p.value.trim() === '') continue;
    qs.append(p.op === 'eq' ? p.field : `${p.field}__${p.op}`, p.value.trim());
  }
  if (paging.page !== undefined) qs.append('page', String(paging.page));
  if (paging.size !== undefined) qs.append('size', String(paging.size));
  if (paging.sort) qs.append('sort', paging.sort);
  return qs;
}

export function isLocalHost(baseUrl: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
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
  /** The request was refused before it was sent (invalid body, unconfirmed host, invalid URL or filter). */
  refused?: boolean;
}

export interface TimelineEvent {
  version: number;
  event: string;
  resultingState: string | null;
  timeStamp: string | null;
  transaction: unknown;
  orderSnapshot: unknown;
}

export interface OrderFollowUp {
  orderId: string;
  /** The order from the query API, or null when no order has this id. */
  order: Record<string, unknown> | null;
  /** Why the order could not be read; absent when the query answered (an unknown order is `order: null` without it). */
  orderError?: string;
  /** Events sorted by version, or null when they could not be read in the expected shape. */
  events: TimelineEvent[] | null;
  rawEvents?: unknown;
  error?: string;
}

export type HistoryRequest =
  | { body: string; truncated?: boolean }
  | { params: QueryParam[]; page?: number; size?: number; sort?: string };

export interface HistoryEntry {
  id: string;
  at: string;
  kind: 'command' | 'query';
  /** Command type, or 'search'. */
  label: string;
  method: 'POST' | 'GET';
  path: string;
  status: number | null;
  durationMs: number;
  request: HistoryRequest;
  /** Refused before sending; `status: null` without it means oms-core was not reachable. */
  refused?: boolean;
}

/** Folder of the shared `.http` templates, relative to the workspace root (SPEC-0008). */
export const SHARED_TEMPLATE_DIR = 'developer-cockpit/api-templates';

export interface TemplateSource {
  /** Workspace-relative with forward slashes, or absolute when outside the workspace. */
  path: string;
  /** In the shared template folder. */
  shared: boolean;
  /** A configured source that does not exist. */
  missing?: boolean;
  /** The file could not be read. */
  error?: string;
  file?: HttpFile;
}

export type SaveTemplateRequest =
  | { path: string; name: string; body: string }
  | { newFile: string; name: string; body: string };

export type SaveTemplateResult = { ok: true; path: string } | { ok: false; error: string };
