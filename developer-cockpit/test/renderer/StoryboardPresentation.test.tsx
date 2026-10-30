// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StoryboardsView } from '../../src/renderer/views/storyboards/StoryboardsView';
import { useStoryboardsStore } from '../../src/renderer/stores/storyboards';
import { exampleDetail, mockStoryboards, resetStoryboardsStore } from './storyboard-fixtures';

const key = (k: string) => act(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
});

async function present() {
  mockStoryboards([exampleDetail()]);
  render(<StoryboardsView />);
  fireEvent.click(await screen.findByRole('button', { name: /Buy gold via mobile app/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Present' }));
  return screen.findByRole('dialog', { name: 'Presenting Buy gold via mobile app' });
}

describe('Presentation mode', () => {
  afterEach(() => {
    cleanup();
    resetStoryboardsStore();
  });

  it('shows the title, the illustration or a placeholder, only "What happens" and a progress indicator', async () => {
    const overlay = await present();
    expect(within(overlay).getByRole('heading', { level: 1, name: 'Buy gold via mobile app' })).toBeTruthy();
    expect(within(overlay).getByRole('heading', { level: 2, name: 'Request quote' })).toBeTruthy();
    const text = within(overlay).getByTestId('what-happens');
    expect(text.textContent).toContain('The customer asks for a price.');
    expect(text.textContent).not.toContain('Quotes last 10 s.'); // Business rules stay out
    expect(within(overlay).getByTestId('placeholder-panel')).toBeTruthy();
    const progress = within(overlay).getByRole('navigation', { name: 'Progress' });
    expect(within(progress).getAllByRole('button')).toHaveLength(3);
    expect(within(progress).getByRole('button', { name: 'Go to step 1' }).getAttribute('aria-current')).toBe('step');
  });

  it('moves with the arrow keys and shows an illustration when the step has one', async () => {
    const overlay = await present();
    key('ArrowRight');
    expect(within(overlay).getByRole('heading', { level: 2, name: 'Accept quote' })).toBeTruthy();
    expect(within(overlay).getByRole('img').getAttribute('src')).toBe('storyboard-asset://s/accept-quote.excalidraw.svg');
    key('ArrowRight');
    key('ArrowRight');
    expect(within(overlay).getByRole('heading', { level: 2, name: 'Route order to market' })).toBeTruthy();
    key('ArrowLeft');
    expect(within(overlay).getByRole('heading', { level: 2, name: 'Accept quote' })).toBeTruthy();
  });

  it('can overlay the alternate paths of a step', async () => {
    const overlay = await present();
    key('End');
    expect(within(overlay).queryByTestId('presentation-extensions')).toBeNull();
    key('a');
    expect(within(overlay).getByTestId('presentation-extensions').textContent).toContain('3a');
  });

  it('shows each alternate path with its own sketch', async () => {
    const d = exampleDetail();
    d.steps[2].extensions[0].illustrations = [{ src: 'reject.excalidraw.svg', caption: 'Venue says no', url: 'storyboard-asset://s/reject.excalidraw.svg', missing: false, editable: true }];
    mockStoryboards([d]);
    render(<StoryboardsView />);
    fireEvent.click(await screen.findByRole('button', { name: /Buy gold via mobile app/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Present' }));
    const overlay = await screen.findByRole('dialog', { name: /Presenting/ });
    key('End');
    fireEvent.click(within(overlay).getByRole('button', { name: 'Alternate paths (A)' }));
    const paths = within(overlay).getByTestId('presentation-extensions');
    expect(within(paths).getByRole('img', { name: 'Venue says no' }).getAttribute('src')).toBe('storyboard-asset://s/reject.excalidraw.svg');
    expect(paths.textContent).toContain('Ops are notified.');
    key('Home');
    expect(within(overlay).getByTestId('presentation-extensions').textContent).toContain('No alternate paths on this step');
  });

  it('shows the step data with D or the Data button, and starts from the reader layers', async () => {
    const overlay = await present();
    expect(within(overlay).queryByTestId('presentation-data')).toBeNull();
    key('d');
    const data = within(overlay).getByTestId('presentation-data');
    expect(data.textContent).toContain('Quote');
    expect(data.textContent).toContain('out');
    key('ArrowRight');
    expect(within(overlay).getByTestId('presentation-data').textContent).toMatch(/in.*Quote.*from step 1/);
    fireEvent.click(within(overlay).getByRole('button', { name: 'Data (D)' }));
    expect(within(overlay).queryByTestId('presentation-data')).toBeNull();
    cleanup();
    resetStoryboardsStore();
    mockStoryboards([exampleDetail()]);
    act(() => useStoryboardsStore.setState({ layers: { data: true, extensions: true } }));
    render(<StoryboardsView />);
    fireEvent.click(await screen.findByRole('button', { name: /Buy gold via mobile app/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Present' }));
    const again = await screen.findByRole('dialog', { name: /Presenting/ });
    expect(within(again).getByRole('button', { name: 'Data (D)' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(again).getByTestId('presentation-data')).toBeTruthy();
  });

  it('exits with Escape and leaves the reader in place, on the same step', async () => {
    await present();
    key('ArrowRight');
    key('Escape');
    expect(useStoryboardsStore.getState().selectedStepId).toBe('accept-quote');
    expect(screen.queryByRole('dialog', { name: /Presenting/ })).toBeNull();
    expect(useStoryboardsStore.getState().presenting).toBe(false);
    expect(screen.getByRole('heading', { level: 1, name: 'Buy gold via mobile app' })).toBeTruthy();
  });
});
