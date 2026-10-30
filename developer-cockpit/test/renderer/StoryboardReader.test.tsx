// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StoryboardsView } from '../../src/renderer/views/storyboards/StoryboardsView';
import { useStoryboardsStore } from '../../src/renderer/stores/storyboards';
import type { StoryboardDetail } from '../../src/shared/types/storyboards';
import { exampleDetail, mockStoryboards, plainDetail, resetStoryboardsStore } from './storyboard-fixtures';

vi.mock('../../src/renderer/components/MermaidDiagram', () => ({
  MermaidDiagram: ({ source }: { source: string }) => <pre data-testid="mermaid">{source}</pre>,
  renderMermaidSvg: async () => '<svg/>',
}));

async function openStory(d: StoryboardDetail, scan = {}) {
  const api = mockStoryboards([d], scan);
  render(<StoryboardsView />);
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(d.title) }));
  await screen.findByRole('heading', { level: 1, name: d.title });
  return api;
}

const key = (k: string, target: EventTarget = window) => act(() => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
});
const selected = () => useStoryboardsStore.getState().selectedStepId;
const stripButton = (n: number) => within(screen.getByRole('list', { name: 'Journey strip' })).getByRole('button', { name: new RegExp(`^Step ${n}:`) });

describe('Storyboard reader', () => {
  afterEach(() => {
    cleanup();
    resetStoryboardsStore();
  });

  it('walks the journey with the keyboard and stops at the boundaries', async () => {
    await openStory(exampleDetail());
    expect(selected()).toBeNull();
    key('ArrowRight');
    expect(selected()).toBe('request-quote');
    expect(await screen.findByRole('article', { name: 'Step 1' })).toBeTruthy();
    key('ArrowLeft');
    expect(selected()).toBe('request-quote');
    key('j');
    expect(selected()).toBe('accept-quote');
    key('End');
    expect(selected()).toBe('route-to-market');
    key('ArrowRight');
    expect(selected()).toBe('route-to-market');
    key('k');
    expect(selected()).toBe('accept-quote');
    key('Home');
    expect(selected()).toBe('request-quote');
    key('Escape');
    expect(selected()).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
    // the overview stays visible the whole time
    expect(screen.getByTestId('overview')).toBeTruthy();
  });

  it('e opens the step editor and p opens presentation mode', async () => {
    await openStory(exampleDetail());
    key('ArrowRight');
    key('e');
    expect(useStoryboardsStore.getState().editing).toEqual({ kind: 'step', stepId: 'request-quote' });
    act(() => useStoryboardsStore.getState().setEditing(null));
    key('p');
    expect(useStoryboardsStore.getState().presenting).toBe(true);
    expect(await screen.findByRole('dialog', { name: /Presenting/ })).toBeTruthy();
  });

  it('e does nothing when the storyboards are read-only', async () => {
    await openStory(exampleDetail(), { writable: false });
    key('ArrowRight');
    key('e');
    expect(useStoryboardsStore.getState().editing).toBeNull();
  });

  it('ignores keys typed into text fields', async () => {
    await openStory(exampleDetail());
    const search = screen.getByRole('searchbox', { name: 'Filter storyboards' });
    key('ArrowRight', search);
    key('j', search);
    expect(selected()).toBeNull();
  });

  it('keeps selection and hover in sync between Strip and Lanes', async () => {
    await openStory(exampleDetail());
    fireEvent.click(stripButton(2));
    fireEvent.mouseEnter(stripButton(3));
    expect(stripButton(2).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Lanes' }));
    const lanes = screen.getByRole('group', { name: 'Journey lanes' });
    expect(within(lanes).getByRole('button', { name: /^Step 2:/ }).getAttribute('aria-pressed')).toBe('true');
    expect(within(lanes).getByRole('button', { name: /^Step 3:/ }).getAttribute('data-hovered')).toBe('true');
    // each step sits in the lane responsible for it, with an arrow between consecutive steps
    expect(within(lanes).getAllByTestId('lane-label').map((l) => l.textContent)).toEqual(['Customer', 'Mobile App', 'OMS', 'Market']);
    expect(within(lanes).getAllByTestId('lane-arrow')).toHaveLength(2);
    fireEvent.click(within(lanes).getByRole('button', { name: /^Step 3:/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Strip' }));
    expect(stripButton(3).getAttribute('aria-pressed')).toBe('true');
  });

  it('draws the same sketch for a step on every render', async () => {
    await openStory(exampleDetail());
    const geometry = (n: number) => [...stripButton(n).querySelectorAll('svg path')].map((p) => p.getAttribute('d')).join('|');
    const before = geometry(1);
    expect(before).not.toBe('');
    expect(geometry(2)).not.toBe(before); // a different step id draws a different sketch
    fireEvent.click(stripButton(2));
    fireEvent.click(stripButton(1)); // re-rendered (now selected): same strokes
    expect(geometry(1)).toBe(before);
  });

  it('shows a placeholder for a missing illustration, in the strip and in the step', async () => {
    await openStory(exampleDetail());
    expect(within(stripButton(3)).getByTestId('placeholder-panel')).toBeTruthy();
    expect(within(stripButton(2)).getByRole('img')).toBeTruthy();
    fireEvent.click(stripButton(3));
    const step = await screen.findByRole('article', { name: 'Step 3' });
    expect(within(step).getByText(/route\.png is not available/)).toBeTruthy();
    expect(within(step).getByText('not editable')).toBeTruthy();
  });

  it('shows step detail: hand-off, prose, links, data and alternate paths', async () => {
    await openStory(exampleDetail());
    fireEvent.click(stripButton(3));
    const step = await screen.findByRole('article', { name: 'Step 3' });
    expect(within(step).getByTestId('handoff').textContent).toBe('OMS → Market · system step');
    expect(within(step).getByText('OMS sends the instruction.')).toBeTruthy();
    expect(within(step).getByRole('button', { name: /Req FR-001/ })).toBeTruthy();
    expect(within(step).getByText('Order')).toBeTruthy();
    const alt = within(step).getByRole('region', { name: 'Alternate paths' });
    expect(within(alt).getByText('3a')).toBeTruthy();
    expect(within(alt).getByText('→ end of journey')).toBeTruthy();
    fireEvent.click(within(step).getByRole('button', { name: 'Previous step' }));
    expect(selected()).toBe('accept-quote');
  });

  it('shows validation findings above the journey without hiding it, and selects the affected step', async () => {
    const d = exampleDetail({
      problems: [
        { code: 'unknown-lane', severity: 'error', stepId: 'accept-quote', message: '"from: nobody" is not a declared lane.' },
        { code: 'data-never-read', severity: 'warning', stepId: 'request-quote', subject: 'Quote', message: 'Output "Quote" is not read.' },
      ],
    });
    await openStory(d);
    const checks = screen.getByRole('region', { name: 'Checks' });
    expect(within(checks).getByText('1 error(s), 1 warning(s)', { exact: false })).toBeTruthy();
    expect(within(checks).getByRole('heading', { name: 'Errors' })).toBeTruthy();
    expect(within(checks).getByRole('heading', { name: 'Warnings' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Journey strip' })).toBeTruthy();
    fireEvent.click(within(checks).getByText(/is not a declared lane/));
    expect(selected()).toBe('accept-quote');
  });

  it('offers data and alternate-path layers only when the story has them, and they reveal the annotations', async () => {
    await openStory(exampleDetail());
    expect(screen.queryByTestId('data-layer')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Data' }));
    expect(screen.getAllByTestId('data-layer').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alternate paths' }));
    expect(screen.getByTestId('extension-layer').textContent).toContain('3a');
    cleanup();
    resetStoryboardsStore();
    await openStory(plainDetail());
    expect(screen.queryByRole('checkbox', { name: 'Data' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Alternate paths' })).toBeNull();
    expect(screen.queryByTestId('data-layer')).toBeNull();
  });

  it('shows the data and alternate-path layers in Lanes too, and D and A toggle them from the keyboard', async () => {
    await openStory(exampleDetail());
    fireEvent.click(screen.getByRole('tab', { name: 'Lanes' }));
    const lanes = () => screen.getByRole('group', { name: 'Journey lanes' });
    expect(within(lanes()).queryByTestId('data-layer')).toBeNull();
    key('d');
    expect(screen.getByRole('checkbox', { name: 'Data' })).toHaveProperty('checked', true);
    expect(within(lanes()).getAllByTestId('data-layer').length).toBeGreaterThan(0);
    key('a');
    expect(within(lanes()).getByTestId('extension-layer').textContent).toContain('3a');
    key('d');
    key('a');
    expect(within(lanes()).queryByTestId('data-layer')).toBeNull();
    expect(within(lanes()).queryByTestId('extension-layer')).toBeNull();
  });

  it('adds data notes to the sequence diagram when the Data layer is on', async () => {
    await openStory(exampleDetail());
    fireEvent.click(screen.getByRole('tab', { name: 'Sequence' }));
    expect(screen.getByTestId('mermaid').textContent).not.toContain('Note right of');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Data' }));
    expect(screen.getByTestId('mermaid').textContent).toContain('Note right of app: in Quote · out Order');
  });

  it('keeps presentation and reader layers in one state', async () => {
    await openStory(exampleDetail());
    key('p');
    key('d');
    key('a');
    key('Escape');
    expect(screen.getByRole('checkbox', { name: 'Data' })).toHaveProperty('checked', true);
    expect(screen.getByRole('checkbox', { name: 'Alternate paths' })).toHaveProperty('checked', true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Data' }));
    key('p');
    const overlay = await screen.findByRole('dialog', { name: /Presenting/ });
    expect(within(overlay).getByRole('button', { name: 'Data (D)' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(overlay).getByRole('button', { name: 'Alternate paths (A)' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the generated sequence diagram read-only, with alternate paths when that layer is on', async () => {
    await openStory(exampleDetail());
    fireEvent.click(screen.getByRole('tab', { name: 'Sequence' }));
    const source = screen.getByTestId('mermaid').textContent!;
    expect(source).toContain('actor customer as Customer');
    expect(source).not.toContain('opt');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alternate paths' }));
    expect(screen.getByTestId('mermaid').textContent).toContain('opt 3a');
  });

  it('rescans when storyboards change on disk', async () => {
    const api = await openStory(exampleDetail());
    expect(api.scan).toHaveBeenCalledTimes(1);
    const { eventBus } = await import('../../src/renderer/lib/event-bus');
    act(() => (eventBus as unknown as { emit: (e: unknown) => void }).emit({ type: 'storyboards:changed', timestamp: 0, payload: { reason: 'external' } }));
    await waitFor(() => expect(api.scan).toHaveBeenCalledTimes(2));
  });
});
