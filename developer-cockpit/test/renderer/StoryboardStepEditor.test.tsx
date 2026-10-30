// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StoryboardsView } from '../../src/renderer/views/storyboards/StoryboardsView';
import { useStoryboardsStore } from '../../src/renderer/stores/storyboards';
import { draftKey } from '../../src/renderer/views/storyboards/StepEditor';
import type { StoryboardDetail } from '../../src/shared/types/storyboards';
import { exampleDetail, mockStoryboards, resetStoryboardsStore } from './storyboard-fixtures';

vi.mock('@monaco-editor/react', () => ({
  loader: { config: () => {} },
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Markdown source" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../../src/renderer/views/storyboards/IllustrationEditor', () => ({
  default: ({ onSave, onCancel }: { onSave: (svg: string) => void; onCancel: () => void }) => (
    <div data-testid="illustration-editor">
      <button type="button" onClick={() => onSave('<svg xmlns="http://www.w3.org/2000/svg"/>')}>Save sketch</button>
      <button type="button" onClick={onCancel}>Cancel sketch</button>
    </div>
  ),
}));

async function openEditor(d: StoryboardDetail = exampleDetail(), stepIndex = 2) {
  const api = mockStoryboards([d]);
  render(<StoryboardsView />);
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(d.title) }));
  await screen.findByRole('heading', { level: 1, name: d.title });
  act(() => {
    useStoryboardsStore.getState().selectStep(d.steps[stepIndex].id);
    useStoryboardsStore.getState().setEditing({ kind: 'step', stepId: d.steps[stepIndex].id });
  });
  const editor = await screen.findByRole('region', { name: `Editing step ${stepIndex + 1}` });
  return { api, editor, d };
}

describe('Step editor', () => {
  afterEach(() => {
    cleanup();
    resetStoryboardsStore();
  });

  it('saves the edited front matter and body with the step revision, then closes', async () => {
    const { api, editor } = await openEditor();
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Title' }), { target: { value: 'Route to the venue' } });
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Markdown source' }), { target: { value: '## What happens\n\nNew text.\n' } });
    expect(within(editor).getByRole('region', { name: 'Preview' }).textContent).toContain('New text.');
    fireEvent.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveStep).toHaveBeenCalledTimes(1));
    const [id, stepId, patch, body, revision] = api.saveStep.mock.calls[0];
    expect([id, stepId, revision, body]).toEqual(['buy-gold-mobile', 'route-to-market', 'r-route-to-market', '## What happens\n\nNew text.\n']);
    // only what changed: untouched keys are not sent, so the file diff stays minimal
    expect(patch).toEqual({ title: 'Route to the venue' });
    await waitFor(() => expect(useStoryboardsStore.getState().editing).toBeNull());
  });

  it('on a stale revision, Overwrite resends the same patch with the latest revision', async () => {
    const { api, editor } = await openEditor();
    api.saveStep.mockResolvedValueOnce({ ok: false, code: 'conflict', message: 'changed', latestRevision: 'r-latest' });
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Title' }), { target: { value: 'Mine' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/since you opened it/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Overwrite' }));
    await waitFor(() => expect(api.saveStep).toHaveBeenCalledTimes(2));
    expect(api.saveStep.mock.calls[1][2]).toEqual(api.saveStep.mock.calls[0][2]);
    expect(api.saveStep.mock.calls[1][4]).toBe('r-latest');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('on a stale revision, Reload drops the draft and shows the version on disk', async () => {
    const { api, editor, d } = await openEditor();
    api.saveStep.mockResolvedValueOnce({ ok: false, code: 'conflict', message: 'changed', latestRevision: 'r-latest' });
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Title' }), { target: { value: 'Mine' } });
    await new Promise((r) => setTimeout(r, 600));
    expect(sessionStorage.getItem(draftKey(d.id, 'route-to-market'))).toContain('Mine');
    fireEvent.click(within(editor).getByRole('button', { name: 'Save' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(api.detail).toHaveBeenCalledTimes(2));
    expect(sessionStorage.getItem(draftKey(d.id, 'route-to-market'))).toBeNull();
    expect(api.saveStep).toHaveBeenCalledTimes(1);
  });

  it('keeps an unsaved draft in session storage and restores it when the editor reopens', async () => {
    const { editor, d } = await openEditor();
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Title' }), { target: { value: 'Draft title' } });
    await new Promise((r) => setTimeout(r, 600));
    act(() => useStoryboardsStore.getState().setEditing(null));
    act(() => useStoryboardsStore.getState().setEditing({ kind: 'step', stepId: 'route-to-market' }));
    const reopened = await screen.findByRole('region', { name: 'Editing step 3' });
    expect((within(reopened).getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Draft title');
    expect(d).toBeTruthy();
  });

  it('limits the continuation of an alternate path to later steps plus retry and end, and flags duplicate ids', async () => {
    const { editor } = await openEditor(exampleDetail(), 1);
    fireEvent.click(within(editor).getByRole('button', { name: 'Add alternate path' }));
    const alt = within(editor).getByRole('group', { name: 'Alternate path 1' });
    const options = within(within(alt).getByRole('combobox', { name: 'Continues at' })).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Retry this step', 'End of journey', 'Continue at 3. Route order to market']);
    fireEvent.click(within(editor).getByRole('button', { name: 'Add alternate path' }));
    const second = within(editor).getByRole('group', { name: 'Alternate path 2' });
    fireEvent.change(within(second).getByRole('textbox', { name: 'Alternate path id' }), { target: { value: (within(alt).getByRole('textbox', { name: 'Alternate path id' }) as HTMLInputElement).value } });
    expect(within(editor).getByRole('alert').textContent).toMatch(/used twice/);
    expect((within(editor).getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds an input from an earlier output with its origin', async () => {
    const { api, editor } = await openEditor(exampleDetail(), 2);
    const data = within(editor).getByRole('region', { name: 'Data editor' });
    fireEvent.change(within(data).getByRole('combobox', { name: 'Add input from an earlier output' }), { target: { value: '0' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveStep).toHaveBeenCalled());
    expect(api.saveStep.mock.calls[0][2].in).toContainEqual({ name: 'Quote', origin: { kind: 'step', ref: 'request-quote' } });
  });

  it('a drawn sketch is saved as an asset at once and referenced only on step save', async () => {
    const { api, editor } = await openEditor(exampleDetail(), 0);
    fireEvent.click(within(within(editor).getByRole('region', { name: 'Illustrations' })).getByRole('button', { name: /Draw sketch/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save sketch' }));
    await waitFor(() => expect(api.saveIllustration).toHaveBeenCalledWith('buy-gold-mobile', 'request-quote.excalidraw.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'));
    expect(api.saveStep).not.toHaveBeenCalled();
    const back = await screen.findByRole('region', { name: 'Editing step 1' });
    fireEvent.click(within(back).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveStep).toHaveBeenCalled());
    expect(api.saveStep.mock.calls[0][2].illustrations).toEqual([{ src: 'request-quote.excalidraw.svg' }]);
  });
});

describe('Structure: wizard, reorder, insert, remove', () => {
  afterEach(() => {
    cleanup();
    resetStoryboardsStore();
  });

  it('the wizard creates a storyboard from a scanned root, domain, title, lanes and step titles', async () => {
    const api = mockStoryboards([exampleDetail()]);
    render(<StoryboardsView />);
    fireEvent.click(await screen.findByRole('button', { name: 'New storyboard' }));
    const wizard = await screen.findByRole('region', { name: 'New storyboard' });
    const create = within(wizard).getByRole('button', { name: 'Create' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect((within(wizard).getByRole('combobox', { name: 'Root' }) as HTMLSelectElement).value).toBe('abcdef123456');
    fireEvent.change(within(wizard).getByRole('textbox', { name: 'Domain' }), { target: { value: 'order-lifecycle' } });
    fireEvent.change(within(wizard).getByRole('textbox', { name: 'Title' }), { target: { value: 'Place an order' } });
    fireEvent.change(within(wizard).getByRole('textbox', { name: 'Lane 2 label' }), { target: { value: 'Exchange' } });
    fireEvent.change(within(wizard).getByRole('combobox', { name: 'Lane 2 kind' }), { target: { value: 'external' } });
    fireEvent.change(within(wizard).getByRole('textbox', { name: 'Step 1 title' }), { target: { value: 'Submit order' } });
    fireEvent.click(within(wizard).getByRole('button', { name: 'Add step' }));
    fireEvent.change(within(wizard).getByRole('textbox', { name: 'Step 2 title' }), { target: { value: 'Fill arrives' } });
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0][0]).toEqual({
      rootId: 'abcdef123456',
      domain: 'order-lifecycle',
      title: 'Place an order',
      lanes: [{ id: 'customer', label: 'Customer', kind: 'actor' }, { id: 'exchange', label: 'Exchange', kind: 'external' }],
      stepTitles: ['Submit order', 'Fill arrives'],
    });
  });

  it('dragging a strip panel reorders the complete step list with the story revision', async () => {
    const api = mockStoryboards([exampleDetail()]);
    render(<StoryboardsView />);
    fireEvent.click(await screen.findByRole('button', { name: /Buy gold via mobile app/ }));
    const strip = await screen.findByRole('list', { name: 'Journey strip' });
    const panel = (n: number) => within(strip).getByRole('button', { name: new RegExp(`^Step ${n}:`) });
    fireEvent.dragStart(panel(1));
    fireEvent.dragOver(panel(3));
    fireEvent.drop(panel(3));
    await waitFor(() => expect(api.reorder).toHaveBeenCalledTimes(1));
    expect(api.reorder.mock.calls[0]).toEqual(['buy-gold-mobile', ['accept-quote', 'route-to-market', 'request-quote'], 'r-story']);
  });

  it('lanes mode has no drag reorder', async () => {
    mockStoryboards([exampleDetail()]);
    render(<StoryboardsView />);
    fireEvent.click(await screen.findByRole('button', { name: /Buy gold via mobile app/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Lanes' }));
    const lanes = screen.getByRole('group', { name: 'Journey lanes' });
    expect(within(lanes).getAllByRole('button').every((b) => b.getAttribute('draggable') !== 'true')).toBe(true);
  });

  it('inserting between panels creates a step after that one and opens its editor', async () => {
    const api = mockStoryboards([exampleDetail()]);
    render(<StoryboardsView />);
    fireEvent.click(await screen.findByRole('button', { name: /Buy gold via mobile app/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Insert a step after step 1' }));
    await waitFor(() => expect(api.createStep).toHaveBeenCalledWith('buy-gold-mobile', 'New step', 'request-quote', 'r-story'));
    await waitFor(() => expect(useStoryboardsStore.getState().editing).toEqual({ kind: 'step', stepId: 'new-step' }));
  });

  it('removing a step keeps its files unless the user explicitly chooses to delete them', async () => {
    const { api, editor } = await openEditor();
    fireEvent.click(within(editor).getByRole('button', { name: /Remove step/ }));
    const confirm = within(editor).getByRole('group', { name: 'Remove step' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.deleteStep).toHaveBeenCalledWith('buy-gold-mobile', 'route-to-market', false, 'r-story'));
    cleanup();
    resetStoryboardsStore();
    const second = await openEditor();
    fireEvent.click(within(second.editor).getByRole('button', { name: /Remove step/ }));
    const confirm2 = within(second.editor).getByRole('group', { name: 'Remove step' });
    fireEvent.click(within(confirm2).getByRole('checkbox'));
    fireEvent.click(within(confirm2).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(second.api.deleteStep).toHaveBeenCalledWith('buy-gold-mobile', 'route-to-market', true, 'r-story'));
  });
});

describe('Quick fixes', () => {
  afterEach(() => {
    cleanup();
    resetStoryboardsStore();
  });

  it('mark an unsourced input as external and an unread output as final, through saveStep', async () => {
    const base = exampleDetail();
    base.steps[1].in = [{ name: 'Quote', origin: { kind: 'unknown' } }];
    const d: StoryboardDetail = {
      ...base,
      problems: [
        { code: 'data-no-source', severity: 'warning', stepId: 'accept-quote', subject: 'Quote', message: 'Input "Quote" has no known source.' },
        { code: 'data-never-read', severity: 'warning', stepId: 'accept-quote', subject: 'Order', message: 'Output "Order" is not read.' },
        { code: 'data-never-read', severity: 'warning', stepId: 'route-to-market', extensionId: 'venue-rejects', subject: 'Alert', message: 'Output "Alert" of extension.' },
      ],
    };
    const api = mockStoryboards([d]);
    render(<StoryboardsView />);
    fireEvent.click(await screen.findByRole('button', { name: /Buy gold via mobile app/ }));
    const checks = await screen.findByRole('region', { name: 'Checks' });
    // only a normal step's own data gets a quick fix, never an alternate path's
    expect(within(checks).getAllByRole('button', { name: /Mark as/ })).toHaveLength(2);

    fireEvent.click(within(checks).getByRole('button', { name: /Mark as external/ }));
    await waitFor(() => expect(api.saveStep).toHaveBeenCalledTimes(1));
    expect(api.saveStep.mock.calls[0].slice(0, 2)).toEqual(['buy-gold-mobile', 'accept-quote']);
    expect(api.saveStep.mock.calls[0][2]).toEqual({ in: [{ name: 'Quote', origin: { kind: 'external', label: 'unspecified' } }] });
    expect(api.saveStep.mock.calls[0][4]).toBe('r-accept-quote');

    fireEvent.click(within(checks).getByRole('button', { name: /Mark as final/ }));
    await waitFor(() => expect(api.saveStep).toHaveBeenCalledTimes(2));
    expect(api.saveStep.mock.calls[1][2]).toEqual({ out: [{ name: 'Order', final: true }] });
  });

  it('a quick fix on a stale revision opens the conflict dialog', async () => {
    const base = exampleDetail();
    const d: StoryboardDetail = { ...base, problems: [{ code: 'data-never-read', severity: 'warning', stepId: 'accept-quote', subject: 'Order', message: 'Output "Order" is not read.' }] };
    const api = mockStoryboards([d]);
    api.saveStep.mockResolvedValueOnce({ ok: false, code: 'conflict', message: 'x', latestRevision: 'r9' });
    render(<StoryboardsView />);
    fireEvent.click(await screen.findByRole('button', { name: /Buy gold via mobile app/ }));
    fireEvent.click(within(await screen.findByRole('region', { name: 'Checks' })).getByRole('button', { name: /Mark as final/ }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Overwrite' }));
    await waitFor(() => expect(api.saveStep).toHaveBeenCalledTimes(2));
    expect(api.saveStep.mock.calls[1][4]).toBe('r9');
  });
});
