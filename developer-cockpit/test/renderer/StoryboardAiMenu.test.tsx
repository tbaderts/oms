// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StoryboardsView } from '../../src/renderer/views/storyboards/StoryboardsView';
import { CommandPalette } from '../../src/renderer/components/CommandPalette';
import { StoryboardBacklinks } from '../../src/renderer/views/storyboards/StoryboardBacklinks';
import { useStoryboardsStore } from '../../src/renderer/stores/storyboards';
import { useNavigationStore } from '../../src/renderer/stores/navigation';
import { exampleDetail, mockStoryboards, resetStoryboardsStore } from './storyboard-fixtures';

vi.mock('@monaco-editor/react', () => ({
  loader: { config: () => {} },
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Markdown source" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

async function openEditor(aiAvailable: boolean) {
  const api = mockStoryboards([exampleDetail()]);
  api.aiAvailable.mockResolvedValue(aiAvailable);
  render(<StoryboardsView />);
  fireEvent.click(await screen.findByRole('button', { name: /Buy gold via mobile app/ }));
  await screen.findByRole('heading', { level: 1, name: 'Buy gold via mobile app' });
  act(() => useStoryboardsStore.getState().setEditing({ kind: 'step', stepId: 'route-to-market' }));
  const editor = await screen.findByRole('region', { name: 'Editing step 3' });
  return { api, editor };
}

describe('AI assists in the step editor', () => {
  afterEach(() => {
    cleanup();
    resetStoryboardsStore();
  });

  it('are hidden when no provider is configured', async () => {
    const { editor } = await openEditor(false);
    expect(within(editor).queryByRole('button', { name: 'Draft prose' })).toBeNull();
    expect(within(editor).queryByRole('button', { name: 'Suggest links' })).toBeNull();
  });

  it('apply a proposal to the draft only; nothing is saved until Save', async () => {
    const { api, editor } = await openEditor(true);
    api.aiAssist.mockResolvedValueOnce({ ok: true, proposal: { kind: 'draftProse', markdown: '## What happens\n\nDrafted by AI.\n' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Draft prose' }));
    const proposal = await screen.findByRole('dialog', { name: 'AI proposal' });
    expect(api.aiAssist).toHaveBeenCalledWith('draftProse', 'buy-gold-mobile', 'route-to-market');
    fireEvent.click(within(proposal).getByRole('button', { name: 'Replace prose in draft' }));
    expect((within(editor).getByRole('textbox', { name: 'Markdown source' }) as HTMLTextAreaElement).value).toBe('## What happens\n\nDrafted by AI.\n');
    expect(api.saveStep).not.toHaveBeenCalled();

    api.aiAssist.mockResolvedValueOnce({ ok: true, proposal: { kind: 'suggestLinks', links: { api: [], events: ['OrderMessage'], states: [], requirements: ['FR-002'] } } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Suggest links' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'AI proposal' })).getByRole('button', { name: 'Add to draft' }));
    api.aiAssist.mockResolvedValueOnce({ ok: true, proposal: { kind: 'reviewExtensions', extensions: [{ when: 'Venue is closed', then: 'Order waits', continueAt: { kind: 'stay' } }] } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Review alternate paths' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'AI proposal' })).getByRole('button', { name: 'Add as draft' }));
    expect(api.saveStep).not.toHaveBeenCalled();

    fireEvent.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveStep).toHaveBeenCalledTimes(1));
    const patch = api.saveStep.mock.calls[0][2];
    expect(patch.links.requirements).toEqual(['FR-001', 'FR-002']);
    expect(patch.extensions.map((e: { when: string }) => e.when)).toEqual(['The venue rejects', 'Venue is closed']);
  });

  it('shows the error when an assist fails', async () => {
    const { api, editor } = await openEditor(true);
    api.aiAssist.mockResolvedValueOnce({ ok: false, code: 'invalid', message: 'The AI assist failed: 401' });
    fireEvent.click(within(editor).getByRole('button', { name: 'Suggest links' }));
    expect(within(await screen.findByRole('dialog', { name: 'AI proposal' })).getByText(/401/)).toBeTruthy();
  });
});

describe('Command palette and backlinks', () => {
  afterEach(() => {
    cleanup();
    resetStoryboardsStore();
    useNavigationStore.setState({ activeView: 'dashboard' });
  });

  it('offers Open storyboard and New storyboard, and Present only while one is open', async () => {
    mockStoryboards([exampleDetail()]);
    const { rerender } = render(<CommandPalette open onOpenChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Open storyboard…/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Present storyboard/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /New storyboard/ }));
    expect(useNavigationStore.getState().activeView).toBe('storyboards');
    expect(useStoryboardsStore.getState().editing).toEqual({ kind: 'new' });
    act(() => useStoryboardsStore.setState({ detail: exampleDetail(), editing: null }));
    rerender(<CommandPalette open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Present storyboard/ }));
    expect(useStoryboardsStore.getState().presenting).toBe(true);
  });

  it('lists the storyboards that reference a requirement and opens one', async () => {
    const api = mockStoryboards([exampleDetail()]);
    api.backlinks.mockResolvedValue([{ id: 'buy-gold-mobile', title: 'Buy gold via mobile app' }]);
    render(<StoryboardBacklinks target="FR-001" />);
    const chip = await screen.findByRole('button', { name: 'Buy gold via mobile app' });
    expect(api.backlinks).toHaveBeenCalledWith('FR-001');
    fireEvent.click(chip);
    expect(useNavigationStore.getState().activeView).toBe('storyboards');
    await waitFor(() => expect(useStoryboardsStore.getState().selectedId).toBe('buy-gold-mobile'));
  });
});
