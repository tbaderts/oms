// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AssistantView } from '../../src/renderer/views/assistant/AssistantView';
import { useAssistantStore } from '../../src/renderer/stores/assistant';
import { eventBus } from '../../src/renderer/lib/event-bus';
import type { AiEvent } from '../../src/shared/types/ai';
import type { CockpitEvent } from '../../src/shared/types/events';

const ai = () => (window as unknown as { cockpit: { ai: Record<string, unknown> } }).cockpit.ai;

function installCockpit(overrides: { available?: () => Promise<unknown> } = {}) {
  (window as unknown as { cockpit: unknown }).cockpit = {
    ai: {
      available: overrides.available ?? (async () => ({ available: true, provider: 'anthropic', model: 'test-model' })),
      run: vi.fn(async () => ({ ok: true })),
      stop: vi.fn(async () => {}),
      usage: vi.fn(async () => ({ entries: 0, totalInput: 0, totalOutput: 0 })),
    },
  };
}

/** Emits an `ai:*` event through the real event bus, as the WebSocket would. */
function emitAi(event: AiEvent) {
  act(() => {
    eventBus.emitForTest({ type: event.type, timestamp: Date.now(), payload: event } as CockpitEvent<AiEvent>);
  });
}

function submitPrompt(prompt: string) {
  const input = screen.getByLabelText('Assistant prompt') as HTMLInputElement;
  fireEvent.change(input, { target: { value: prompt } });
  fireEvent.click(screen.getByRole('button', { name: /Send/ }));
}

describe('AssistantView', () => {
  afterEach(() => {
    cleanup();
    eventBus.disconnect();
    useAssistantStore.setState(useAssistantStore.getInitialState(), true);
  });

  it('shows the configured provider status and an empty transcript hint', async () => {
    installCockpit();
    render(<AssistantView />);
    expect(await screen.findByText('AI Assistant')).toBeTruthy();
    expect(screen.getByText(/anthropic/)).toBeTruthy();
    expect(screen.getByText(/knowledge base/)).toBeTruthy();
  });

  it('shows the not-configured reason and disables the input when no provider is set', async () => {
    installCockpit({ available: async () => ({ available: false, provider: 'anthropic', reason: 'ANTHROPIC_API_KEY is not set.' }) });
    render(<AssistantView />);
    expect(await screen.findByText(/ANTHROPIC_API_KEY/)).toBeTruthy();
    expect((screen.getByLabelText('Assistant prompt') as HTMLInputElement).disabled).toBe(true);
  });

  it('submitting a prompt calls ai.run with a runId and starts the transcript', async () => {
    installCockpit();
    const run = vi.fn(async (runId: string, prompt: string) => ({ ok: true, runId }));
    installCockpit();
    (window as unknown as { cockpit: unknown }).cockpit.ai.run = run;
    render(<AssistantView />);
    await screen.findByText('AI Assistant');

    submitPrompt('How are orders accepted?');
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const [runId, prompt] = run.mock.calls[0] as [string, string];
    expect(runId).toMatch(/^run-/);
    expect(prompt).toBe('How are orders accepted?');
    // The prompt is shown in the transcript and the run is running.
    expect(screen.getAllByText(/How are orders accepted\?/).length).toBeGreaterThan(0);
    expect(screen.getByText('Running…')).toBeTruthy();
  });

  it('renders scripted ai:* events in order: message, tool-call, tool-result, then done', async () => {
    installCockpit();
    render(<AssistantView />);
    await screen.findByText('AI Assistant');
    submitPrompt('trace a bug');
    await vi.waitFor(() => expect(ai().run).toHaveBeenCalled());
    const runId = (ai().run as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string;

    emitAi({ type: 'ai:message', runId, text: 'Let me search the KB. ' });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText(/Let me search the KB/)).toBeTruthy();

    emitAi({ type: 'ai:tool-call', runId, toolCallId: 'c1', name: 'search_knowledge_base', input: { query: 'order acceptance' } });
    expect(screen.getByText(/search_knowledge_base/)).toBeTruthy();

    emitAi({ type: 'ai:tool-result', runId, toolCallId: 'c1', name: 'search_knowledge_base', output: 'Found 3 documents.' });
    expect(screen.getByText(/Found 3 documents/)).toBeTruthy();

    emitAi({ type: 'ai:message', runId, text: 'Orders are accepted by the OMS.' });
    expect(screen.getByText(/Orders are accepted/)).toBeTruthy();

    emitAi({ type: 'ai:done', runId, aborted: false, incomplete: false });
    await vi.waitFor(() => expect(screen.queryByText('Running…')).toBeNull());
    expect(screen.queryByRole('button', { name: /Stop/ })).toBeNull();
  });

  it('an ai:error for the current run shows an error state and stops the run', async () => {
    installCockpit();
    render(<AssistantView />);
    await screen.findByText('AI Assistant');
    submitPrompt('boom');
    await vi.waitFor(() => expect(ai().run).toHaveBeenCalled());
    const runId = (ai().run as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string;

    emitAi({ type: 'ai:error', runId, message: 'AI not configured: the ANTHROPIC_API_KEY environment variable is not set.' });
    expect(screen.getByTestId('assistant-error')).toBeTruthy();
    await vi.waitFor(() => expect(screen.queryByText('Running…')).toBeNull());
  });

  it('clicking Stop calls ai.stop with the same runId', async () => {
    installCockpit();
    const stop = vi.fn(async () => {});
    installCockpit();
    (window as unknown as { cockpit: unknown }).cockpit.ai.stop = stop;
    render(<AssistantView />);
    await screen.findByText('AI Assistant');
    submitPrompt('long question');
    await vi.waitFor(() => expect(ai().run).toHaveBeenCalled());
    const runId = (ai().run as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string;

    // The run is in flight; Stop appears.
    fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
    await vi.waitFor(() => expect(stop).toHaveBeenCalledWith(runId));
  });

  it('ignores ai:* events from other runIds', async () => {
    installCockpit();
    render(<AssistantView />);
    await screen.findByText('AI Assistant');
    submitPrompt('scoped question');
    await vi.waitFor(() => expect(ai().run).toHaveBeenCalled());
    const runId = (ai().run as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string;

    emitAi({ type: 'ai:message', runId: 'other-run', text: 'SHOULD NOT APPEAR' });
    expect(screen.queryByText(/SHOULD NOT APPEAR/)).toBeNull();
    emitAi({ type: 'ai:message', runId, text: 'This one is in scope.' });
    expect(screen.getByText(/This one is in scope/)).toBeTruthy();
  });
});
