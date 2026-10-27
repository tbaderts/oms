import { vi } from 'vitest';
import { ApiCatalogService } from '../../src/main/services/ApiCatalogService';
import type { ApiResponse, CommandCatalog, HistoryEntry, OrderFollowUp, SaveTemplateRequest, SaveTemplateResult, TemplateSource } from '../../src/shared/apiExplorer';
import { REPO_ROOT } from '../fixtures/workspace';

/** The catalog of the repository's real contracts. */
export const CATALOG: CommandCatalog = new ApiCatalogService(REPO_ROOT, ['oms-contracts/src/main/openapi']).load();

export const response = (over: Partial<ApiResponse> = {}): ApiResponse => ({
  ok: true,
  status: 200,
  durationMs: 12,
  body: { status: 'OK' },
  contentType: 'application/json',
  url: 'http://localhost:8090/api/command/execute',
  ...over,
});

export const followUp = (over: Partial<OrderFollowUp> = {}): OrderFollowUp => ({
  orderId: 'O-1',
  order: { orderId: 'O-1', state: 'UNACK', side: 'BUY', symbol: 'AAPL', orderQty: 100, cumQty: 0, leavesQty: 100 },
  events: [
    { version: 1, event: 'NEW_ORDER', resultingState: 'UNACK', timeStamp: '2026-10-27T10:00:00Z', transaction: { type: 'OrderCreateCmd' }, orderSnapshot: { orderId: 'O-1' } },
  ],
  ...over,
});

/** Installs window.cockpit.apiExplorer with vi.fn()s returning sensible defaults. */
export function mockApiExplorer(opts: { baseUrl?: string; local?: boolean; history?: HistoryEntry[]; templates?: TemplateSource[] } = {}) {
  const api = {
    catalog: vi.fn(async () => CATALOG),
    baseUrl: vi.fn(async () => ({ baseUrl: opts.baseUrl ?? 'http://localhost:8090', local: opts.local ?? true })),
    sendCommand: vi.fn(async (_body: string, _host?: string) => response({ status: 201, body: { id: 'O-1', status: 'OK', message: 'Order created successfully: O-1' } })),
    search: vi.fn(async () => response({ url: 'http://localhost:8090/api/query/search', body: { content: [], page: { number: 0, size: 50, totalElements: 0, totalPages: 0 } } })),
    followUp: vi.fn(async (_id: string) => followUp()),
    history: vi.fn(async () => opts.history ?? []),
    clearHistory: vi.fn(async () => {}),
    templates: vi.fn(async () => opts.templates ?? []),
    saveTemplate: vi.fn(async (req: SaveTemplateRequest): Promise<SaveTemplateResult> => ({ ok: true, path: 'path' in req ? req.path : `developer-cockpit/api-templates/${req.newFile}` })),
  };
  (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { apiExplorer: api };
  return api;
}

export class FakeWebSocket {
  static last: FakeWebSocket | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeWebSocket.last = this;
  }
  close() {}
}
