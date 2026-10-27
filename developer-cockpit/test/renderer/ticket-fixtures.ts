import { vi } from 'vitest';
import type { SpecTicketDetail, SpecTicketSummary } from '../../src/shared/types/specTickets';

export function summary(id: string, overrides: Partial<SpecTicketSummary> = {}): SpecTicketSummary {
  return {
    id,
    title: `Ticket ${id}`,
    type: 'feature',
    status: 'proposal',
    awaiting: '',
    autopilot: false,
    modules: ['oms-core'],
    approvals: [],
    owner: 'Alice',
    beads: '',
    created: '2026-10-24',
    blockedFrom: '',
    blockedReason: '',
    archived: false,
    dir: `specs/changes/${id}-x`,
    tasks: { done: 0, total: 0 },
    acs: [],
    ...overrides,
  };
}

export function detail(id: string, overrides: Partial<SpecTicketDetail> = {}): SpecTicketDetail {
  return {
    ...summary(id),
    goal: 'The goal.',
    log: [],
    taskList: [],
    gate: null,
    evidence: null,
    next: 'Next step.',
    documents: {},
    ...overrides,
  };
}

/** Installs a mocked window.cockpit.specTickets and returns its mocks. */
export function mockCockpit() {
  const api = {
    list: vi.fn().mockResolvedValue({ user: 'Alice', types: ['feature', 'fix', 'refactor', 'spike', 'chore'], tickets: [summary('SPEC-0001')], errors: [] }),
    get: vi.fn().mockResolvedValue(detail('SPEC-0001')),
    run: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '', awaitingApproval: false }),
    saveDocument: vi.fn().mockImplementation(async (_id: string, _doc: string, content: string) => ({ status: 'saved', content })),
    draftGate: vi.fn().mockResolvedValue({ stage: 'proposal', pass: true, errors: [], warnings: [], exceptions: [] }),
    toggleTask: vi.fn().mockImplementation(async () => ({ status: 'saved', content: '' })),
  };
  (window as unknown as { cockpit: unknown }).cockpit = { specTickets: api };
  return api;
}
