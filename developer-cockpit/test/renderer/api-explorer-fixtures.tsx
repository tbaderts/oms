import { vi } from 'vitest';
import type { ApiCatalog, ApiRequest, ApiResponse, HistoryEntry, SaveTemplateRequest, SaveTemplateResult, TemplateSource } from '../../src/shared/apiExplorer';

/** A small catalog: a polymorphic command endpoint, a GET with path and query parameters. */
export const CATALOG: ApiCatalog = {
  apis: [
    {
      name: 'Shop',
      title: 'Shop API',
      baseUrl: 'http://localhost:8000/v1',
      spec: 'api/shop.yml',
      operations: [
        {
          id: 'execute',
          method: 'POST',
          path: '/commands',
          summary: 'Run a command',
          params: [],
          requestSchema: { type: 'object', required: ['kind'], properties: { kind: { type: 'string' } } },
          variants: [
            {
              name: 'AddItem',
              discriminator: { property: 'kind', value: 'AddItem' },
              schema: { type: 'object', required: ['kind', 'sku', 'quantity'], properties: { kind: { type: 'string' }, sku: { type: 'string', minLength: 1 }, quantity: { type: 'integer' } } },
            },
            {
              name: 'Checkout',
              discriminator: { property: 'kind', value: 'Checkout' },
              schema: { type: 'object', required: ['kind', 'basketId'], properties: { kind: { type: 'string' }, basketId: { type: 'string' } } },
            },
          ],
        },
        {
          id: 'getBasket',
          method: 'GET',
          path: '/baskets/{basketId}',
          params: [
            { name: 'basketId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'verbose', in: 'query', required: false, schema: { type: 'boolean' } },
          ],
          variants: [],
        },
      ],
    },
    { name: 'Broken', baseUrl: 'http://localhost:9', spec: 'api/broken.yml', operations: [], error: 'broken.yml: bad indentation' },
  ],
};

export const response = (over: Partial<ApiResponse> = {}): ApiResponse => ({
  ok: true,
  status: 200,
  durationMs: 12,
  body: { status: 'OK' },
  contentType: 'application/json',
  url: 'http://localhost:8000/v1/commands',
  ...over,
});

/** Installs window.cockpit.apiExplorer with vi.fn()s returning sensible defaults. */
export function mockApiExplorer(opts: { catalog?: ApiCatalog; history?: HistoryEntry[]; templates?: TemplateSource[] } = {}) {
  const api = {
    catalog: vi.fn(async () => opts.catalog ?? CATALOG),
    send: vi.fn(async (_req: ApiRequest, _host?: string) => response({ status: 201, body: { id: 'B-1' } })),
    history: vi.fn(async () => opts.history ?? []),
    clearHistory: vi.fn(async () => {}),
    templates: vi.fn(async () => opts.templates ?? []),
    saveTemplate: vi.fn(async (req: SaveTemplateRequest): Promise<SaveTemplateResult> => ({ ok: true, path: 'path' in req ? req.path : `requests/${req.newFile}` })),
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
