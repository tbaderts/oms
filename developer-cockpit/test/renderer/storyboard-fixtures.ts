import { vi } from 'vitest';
import type { ScanResult, StoryboardDetail, StoryboardSummary } from '../../src/shared/types/storyboards';
import { useStoryboardsStore } from '../../src/renderer/stores/storyboards';
import { ext, illustration, step, story } from '../shared/storyboardFactories';

export function summaryOf(d: StoryboardDetail): StoryboardSummary {
  const { lanes: _l, steps: _s, body: _b, headings: _h, revision: _r, evidence: _e, problems: _p, orphanSteps: _o, ...summary } = d;
  return summary;
}

/** The source-spec example: four lanes, three steps, data and one alternate path. */
export function exampleDetail(overrides: Partial<StoryboardDetail> = {}): StoryboardDetail {
  return story(
    [
      step('request-quote', 0, { title: 'Request quote', kind: 'user', from: 'customer', to: 'app', out: [{ name: 'Quote' }], body: '## What happens\n\nThe customer asks for a price.\n\n## Business rules\n\n- Quotes last 10 s.\n' }),
      step('accept-quote', 1, {
        title: 'Accept quote', kind: 'user', from: 'customer', to: 'app',
        illustrations: [illustration('accept-quote.excalidraw.svg')],
        in: [{ name: 'Quote', origin: { kind: 'step', ref: 'request-quote' } }],
        out: [{ name: 'Order' }],
        body: '## What happens\n\nThe customer taps Buy.\n',
      }),
      step('route-to-market', 2, {
        title: 'Route order to market', from: 'oms', to: 'market',
        illustrations: [illustration('route.png', true)],
        in: [{ name: 'Order', origin: { kind: 'step', ref: 'accept-quote' } }],
        out: [{ name: 'Market instruction', final: true }],
        links: { api: ['oms-cmd-api#OrderCreateCmd'], events: ['OrderMessage'], states: ['NEW -> UNACK'], requirements: ['FR-001'] },
        extensions: [ext('venue-rejects', { label: '3a', when: 'The venue rejects', then: 'Ops are notified.', continueAt: { kind: 'end' } })],
        body: '## What happens\n\nOMS sends the instruction.\n',
      }),
    ],
    overrides,
  );
}

/** A plain two-step story without data or alternate paths. */
export function plainDetail(): StoryboardDetail {
  return story([step('one', 0, { title: 'Step one', from: 'customer', to: 'app' }), step('two', 1, { title: 'Step two', from: 'app', to: 'oms' })], {
    id: 'plain', title: 'Plain story',
  });
}

export function scanOf(details: StoryboardDetail[], overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    enabled: true,
    writable: true,
    catalogue: details.map(summaryOf),
    errors: [],
    roots: [{ rootId: 'abcdef123456', label: 'oms-knowledge-base/storyboards' }],
    ...overrides,
  };
}

export type StoryboardsMock = { [K in keyof Window['cockpit']['storyboards']]: ReturnType<typeof vi.fn> };

/** Installs window.cockpit.storyboards with spies; detail() serves the given details by id. */
export function mockStoryboards(details: StoryboardDetail[], scanOverrides: Partial<ScanResult> = {}): StoryboardsMock {
  const byId = new Map(details.map((d) => [d.id, d]));
  const api: StoryboardsMock = {
    scan: vi.fn(async () => scanOf(details, scanOverrides)),
    detail: vi.fn(async (id: string) => (byId.has(id) ? { ok: true, detail: byId.get(id) } : { ok: false, code: 'not-found', message: 'nope' })),
    create: vi.fn(async () => ({ ok: true, id: 'new-story' })),
    saveStory: vi.fn(async () => ({ ok: true, revision: 'r2', changed: true })),
    createStep: vi.fn(async () => ({ ok: true, stepId: 'new-step', revision: 'r2' })),
    saveStep: vi.fn(async () => ({ ok: true, revision: 'r2', changed: true })),
    deleteStep: vi.fn(async () => ({ ok: true, revision: 'r2', deleted: [] })),
    reorder: vi.fn(async () => ({ ok: true, revision: 'r2' })),
    saveIllustration: vi.fn(async (_id: string, name: string) => ({ ok: true, name, url: `storyboard-asset://x/${name}` })),
    readIllustration: vi.fn(async () => ({ ok: true, svg: '<svg/>' })),
    library: vi.fn(async () => ({ ok: true, library: null })),
    links: vi.fn(async () => ({ api: ['oms-cmd-api#OrderCreateCmd'], events: ['OrderMessage'], states: ['NEW -> UNACK'], requirements: ['FR-001', 'FR-002'] })),
    backlinks: vi.fn(async () => []),
    exportMermaid: vi.fn(async () => ({ ok: true, source: 'sequenceDiagram' })),
    exportHtml: vi.fn(async () => ({ ok: true, html: '<!doctype html>' })),
    exportPdf: vi.fn(async () => ({ ok: true, savedTo: null })),
    aiAvailable: vi.fn(async () => false),
    aiAssist: vi.fn(async () => ({ ok: false, code: 'invalid', message: 'off' })),
  };
  (window as unknown as { cockpit: Record<string, unknown> }).cockpit = {
    ...((window as unknown as { cockpit?: Record<string, unknown> }).cockpit ?? {}),
    storyboards: api,
    events: { getWebSocketUrl: async () => 'ws://localhost:1' },
  };
  return api;
}

export function resetStoryboardsStore(): void {
  useStoryboardsStore.setState(useStoryboardsStore.getInitialState(), true);
  try {
    sessionStorage.clear();
  } catch {
    // no session storage in this environment
  }
}
