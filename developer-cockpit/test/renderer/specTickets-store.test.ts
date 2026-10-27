// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { eventBus } from '../../src/renderer/lib/event-bus';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { useSpecTicketsLiveRefresh } from '../../src/renderer/hooks/useSpecTicketsLiveRefresh';
import { useNavigationStore } from '../../src/renderer/stores/navigation';
import { useDocEditorStore } from '../../src/renderer/stores/docEditor';
import { openTicket } from '../../src/renderer/lib/open-ticket';
import { detail, mockCockpit, summary } from './ticket-fixtures';

class FakeWebSocket {
  static last: FakeWebSocket | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { FakeWebSocket.last = this; }
  close() {}
}

describe('useSpecTicketsStore', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    eventBus.connect('ws://test');
  });
  afterEach(() => {
    eventBus.disconnect();
    vi.unstubAllGlobals();
    useSpecTicketsStore.setState(useSpecTicketsStore.getInitialState(), true);
  });

  it('refreshes list and open detail on specs:tickets-changed', async () => {
    const api = mockCockpit();
    await useSpecTicketsStore.getState().load();
    await useSpecTicketsStore.getState().select('SPEC-0001');
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledTimes(1);

    api.list.mockResolvedValue({ user: 'Alice', tickets: [summary('SPEC-0001', { status: 'design' })], errors: [] });
    api.get.mockResolvedValue(detail('SPEC-0001', { status: 'design' }));
    renderHook(() => useSpecTicketsLiveRefresh());
    FakeWebSocket.last!.onmessage!({
      data: JSON.stringify({ type: 'specs:tickets-changed', timestamp: Date.now(), payload: { path: 'x' } }),
    });

    await waitFor(() => expect(useSpecTicketsStore.getState().detail?.status).toBe('design'));
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenLastCalledWith('SPEC-0001');
    expect(useSpecTicketsStore.getState().tickets[0].status).toBe('design');
  });

  it('clears the detail when the open ticket disappears', async () => {
    const api = mockCockpit();
    await useSpecTicketsStore.getState().load();
    await useSpecTicketsStore.getState().select('SPEC-0001');
    expect(useSpecTicketsStore.getState().detail?.id).toBe('SPEC-0001');

    api.list.mockResolvedValue({ user: 'Alice', tickets: [], errors: [] });
    api.get.mockRejectedValue(new Error('spec CLI returned no JSON for "status SPEC-0001"'));
    await useSpecTicketsStore.getState().refresh();

    expect(useSpecTicketsStore.getState()).toMatchObject({ selectedId: null, detail: null, error: null });
  });

  it('ignores an older list response that arrives after a newer one', async () => {
    const api = mockCockpit();
    let releaseOld!: () => void;
    api.list
      .mockImplementationOnce(() => new Promise((r) => {
        releaseOld = () => r({ user: 'Alice', tickets: [summary('SPEC-0001', { status: 'proposal' })], errors: [] });
      }))
      .mockResolvedValueOnce({ user: 'Alice', tickets: [summary('SPEC-0001', { status: 'design' })], errors: [] });

    const older = useSpecTicketsStore.getState().load();
    await useSpecTicketsStore.getState().load();
    releaseOld();
    await older;

    expect(useSpecTicketsStore.getState().tickets[0].status).toBe('design');
  });

  it('runs one action at a time and refreshes afterwards', async () => {
    const api = mockCockpit();
    let release!: () => void;
    api.run.mockImplementation(() => new Promise((r) => { release = () => r({ exitCode: 3, stdout: 'awaiting', stderr: '', awaitingApproval: true }); }));
    const first = useSpecTicketsStore.getState().run({ kind: 'advance', id: 'SPEC-0001' });
    await useSpecTicketsStore.getState().run({ kind: 'advance', id: 'SPEC-0001' });
    expect(api.run).toHaveBeenCalledTimes(1);
    expect(useSpecTicketsStore.getState().running).toBe(true);
    release();
    await first;
    expect(useSpecTicketsStore.getState()).toMatchObject({ running: false, lastResult: { exitCode: 3 } });
    expect(api.list).toHaveBeenCalled();
  });

  it('keeps an action error visible across the refresh that follows', async () => {
    const api = mockCockpit();
    api.run.mockRejectedValueOnce(new Error('spec CLI failed: spawn EPERM'));
    await useSpecTicketsStore.getState().run({ kind: 'advance', id: 'SPEC-0001' });
    expect(api.list).toHaveBeenCalled(); // the refresh ran and succeeded
    expect(useSpecTicketsStore.getState().error).toBe('spec CLI failed: spawn EPERM');
  });

  it('run returns the id of a newly created ticket and selects it', async () => {
    const api = mockCockpit();
    api.run.mockResolvedValueOnce({ exitCode: 0, stdout: 'Created SPEC-0042 in specs/changes/SPEC-0042-x', stderr: '', awaitingApproval: false });
    api.get.mockResolvedValue(detail('SPEC-0042'));
    // After creation the CLI lists the new ticket (otherwise refresh() treats it as removed).
    api.list.mockResolvedValue({ user: 'Alice', tickets: [summary('SPEC-0042')], errors: [] });
    const created = await useSpecTicketsStore.getState().run({ kind: 'new', title: 'T', type: 'fix', modules: ['oms-core'], goal: 'G' });
    expect(created).toBe('SPEC-0042');
    expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0042');

    api.run.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'bad type', awaitingApproval: false });
    expect(await useSpecTicketsStore.getState().run({ kind: 'new', title: 'T', type: 'x', modules: ['oms-core'], goal: 'G' })).toBeNull();
    expect(await useSpecTicketsStore.getState().run({ kind: 'advance', id: 'SPEC-0042' })).toBeNull();

    // Unsaved edits and the user keeps them: the ticket exists but is not selected, so no id.
    useDocEditorStore.getState().open('SPEC-0042', 'proposal', 'base');
    useDocEditorStore.getState().edit('mine');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    api.run.mockResolvedValueOnce({ exitCode: 0, stdout: 'Created SPEC-0043 in specs/changes/SPEC-0043-x', stderr: '', awaitingApproval: false });
    expect(await useSpecTicketsStore.getState().run({ kind: 'new', title: 'T', type: 'fix', modules: ['oms-core'], goal: 'G' })).toBeNull();
    expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0042');
    confirm.mockRestore();
    useDocEditorStore.getState().close();
  });

  it('openTicket selects the ticket and switches to Spec Tickets unless the guard cancels', async () => {
    mockCockpit();
    useNavigationStore.setState({ activeView: 'dashboard' });
    await openTicket('SPEC-0001');
    expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0001');
    expect(useNavigationStore.getState().activeView).toBe('spec-tickets');

    // Unsaved edits and the user cancels: stay on the Dashboard with the old selection.
    useNavigationStore.setState({ activeView: 'dashboard' });
    useDocEditorStore.getState().open('SPEC-0001', 'proposal', 'base');
    useDocEditorStore.getState().edit('mine');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await openTicket('SPEC-0002');
    expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0001');
    expect(useNavigationStore.getState().activeView).toBe('dashboard');
    confirm.mockRestore();
    useDocEditorStore.getState().close();
  });
});
