// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SignalsWatcher } from '../../src/renderer/components/SignalsWatcher';
import { Toaster } from '../../src/renderer/components/Toaster';
import { StatusBar } from '../../src/renderer/components/layout/StatusBar';
import { eventBus } from '../../src/renderer/lib/event-bus';
import { useSignalsStore } from '../../src/renderer/stores/signals';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { useNavigationStore } from '../../src/renderer/stores/navigation';
import { mockCockpit, summary } from './ticket-fixtures';

class FakeWebSocket {
  static last: FakeWebSocket | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { FakeWebSocket.last = this; }
  close() {}
}

const BASE = ['2026-10-30 08:00 — design → plan', '2026-10-30 08:01 — verify run: fail'];
const ticket = (log: string[]) => summary('SPEC-0007', { title: 'Seven', status: 'implement', recentLog: log });
const changed = () =>
  FakeWebSocket.last!.onmessage!({ data: JSON.stringify({ type: 'specs:tickets-changed', timestamp: Date.now(), payload: { path: 'x' } }) });

/** The shell parts that live outside the views, with the user on another view. */
async function renderShell() {
  const api = mockCockpit();
  api.list.mockResolvedValue({ user: 'Alice', tickets: [ticket(BASE)], errors: [] });
  useNavigationStore.setState({ activeView: 'contracts' });
  render(<><SignalsWatcher /><Toaster /><StatusBar /></>);
  await waitFor(() => expect(useSignalsStore.getState().initialized).toBe(true));
  return api;
}

describe('signals in the shell', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    eventBus.connect('ws://test');
  });
  afterEach(() => {
    cleanup();
    eventBus.disconnect();
    vi.unstubAllGlobals();
    useSpecTicketsStore.setState(useSpecTicketsStore.getInitialState(), true);
    useSignalsStore.setState(useSignalsStore.getInitialState(), true);
    useNavigationStore.setState({ activeView: 'dashboard' });
  });

  it('status bar counts new critical and attention signals and opens the dashboard (AC-5)', async () => {
    const api = await renderShell();
    // Entries present at the first load (including the failed verify run) are not counted.
    expect(screen.queryByRole('button', { name: /new signal/ })).toBeNull();

    api.list.mockResolvedValue({ user: 'Alice', tickets: [ticket([...BASE, '2026-10-30 08:05 — verify run: pass', '2026-10-30 08:06 — plan → implement'])], errors: [] });
    changed();
    await waitFor(() => expect(useSignalsStore.getState().fresh.size).toBe(2));
    expect(screen.queryByRole('button', { name: /new signal/ })).toBeNull();

    api.list.mockResolvedValue({
      user: 'Alice',
      tickets: [ticket([...BASE, '2026-10-30 08:05 — verify run: pass', '2026-10-30 08:06 — plan → implement',
        '2026-10-30 08:07 — blocked: needs input', '2026-10-30 08:08 — implement gate passed; awaiting human approval'])],
      errors: [],
    });
    changed();
    const indicator = await screen.findByRole('button', { name: '2 new signals' });
    expect(indicator.textContent).toContain('2');
    expect(indicator.textContent).toContain('SPEC-0007 implement gate passed; awaiting human approval');

    fireEvent.click(indicator);
    expect(useNavigationStore.getState().activeView).toBe('dashboard');
    expect(screen.queryByRole('button', { name: /new signal/ })).toBeNull();
  });

  it('toast for a new critical or attention signal, not for good or info (AC-6)', async () => {
    const api = await renderShell();
    expect(screen.queryAllByRole('status')).toHaveLength(0);

    api.list.mockResolvedValue({ user: 'Alice', tickets: [ticket([...BASE, '2026-10-30 08:05 — verify run: pass', '2026-10-30 08:06 — plan → implement'])], errors: [] });
    changed();
    await waitFor(() => expect(useSignalsStore.getState().fresh.size).toBe(2));
    expect(screen.queryAllByRole('status')).toHaveLength(0);

    api.list.mockResolvedValue({
      user: 'Alice',
      tickets: [ticket([...BASE, '2026-10-30 08:05 — verify run: pass', '2026-10-30 08:06 — plan → implement', '2026-10-30 08:07 — verify run: fail'])],
      errors: [],
    });
    changed();
    const toast = await screen.findByRole('status');
    expect(toast.textContent).toContain('SPEC-0007');
    expect(toast.textContent).toContain('verify run: fail');
    expect(toast.querySelector('[data-icon="critical"]')).toBeTruthy();

    fireEvent.click(within(toast).getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0007'));
    expect(useNavigationStore.getState().activeView).toBe('spec-tickets');
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });
});
