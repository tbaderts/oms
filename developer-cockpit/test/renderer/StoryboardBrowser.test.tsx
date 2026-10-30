// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StoryboardsView } from '../../src/renderer/views/storyboards/StoryboardsView';
import { NAV_ITEMS } from '../../src/renderer/stores/navigation';
import { exampleDetail, mockStoryboards, plainDetail, resetStoryboardsStore } from './storyboard-fixtures';

function stories() {
  const gold = exampleDetail({ tags: ['retail'], trust: 'human-verified', drift: 'drifted', hasCard: true, status: 'stable' });
  const fx = { ...plainDetail(), id: 'spot-fx', title: 'Spot FX trade', domain: 'fx', description: 'Currency swap at spot', tags: ['fx'] };
  const care = { ...plainDetail(), id: 'care-order', title: 'Care order via desk', domain: 'equities', stepTitles: ['Phone the desk', 'Work the order'] };
  return [gold, fx, care];
}

describe('Storyboards browser', () => {
  afterEach(() => {
    cleanup();
    resetStoryboardsStore();
  });

  it('is a Knowledge navigation entry after Requirements', () => {
    const ids = NAV_ITEMS.map((n) => n.id);
    expect(ids.indexOf('storyboards')).toBe(ids.indexOf('requirements') + 1);
    expect(NAV_ITEMS.find((n) => n.id === 'storyboards')).toMatchObject({ label: 'Storyboards', group: 'Knowledge' });
  });

  it('groups by domain and shows step count, status, trust and drift badges and a thumbnail strip', async () => {
    mockStoryboards(stories());
    render(<StoryboardsView />);
    const list = await screen.findByRole('navigation', { name: 'Storyboard catalogue' });
    const groups = within(list).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(['equities', 'fx', 'precious-metals']);
    const card = within(list).getByRole('button', { name: /Buy gold via mobile app/ });
    expect(within(card).getByText('3 steps')).toBeTruthy();
    expect(within(card).getByText('stable')).toBeTruthy();
    expect(within(card).getByText('human-verified')).toBeTruthy();
    expect(within(card).getByText('drifted')).toBeTruthy();
    expect(within(card).getAllByTestId('thumb')).toHaveLength(3);
  });

  it('filters by substring over title, summary and step titles, and by domain, status and tag', async () => {
    mockStoryboards(stories());
    render(<StoryboardsView />);
    const list = await screen.findByRole('navigation', { name: 'Storyboard catalogue' });
    const search = screen.getByRole('searchbox', { name: 'Filter storyboards' });
    const shown = () => within(list).queryAllByRole('button').map((b) => b.getAttribute('data-id'));

    fireEvent.change(search, { target: { value: 'CURRENCY' } });
    expect(shown()).toEqual(['spot-fx']);
    fireEvent.change(search, { target: { value: 'phone the' } });
    expect(shown()).toEqual(['care-order']);
    fireEvent.change(search, { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'stable' } });
    expect(shown()).toEqual(['buy-gold-mobile']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Tag' }), { target: { value: 'fx' } });
    expect(shown()).toEqual(['spot-fx']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Tag' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Domain' }), { target: { value: 'equities' } });
    expect(shown()).toEqual(['care-order']);
  });

  it('shows scan diagnostics without hiding valid entries, and rescans on demand', async () => {
    const api = mockStoryboards(stories(), { errors: [{ code: 'duplicate-id', path: 'x/story.md', message: 'Storyboard id "dup" is used by 2 folders.' }] });
    render(<StoryboardsView />);
    expect(await screen.findByText(/used by 2 folders/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Buy gold via mobile app/ })).toBeTruthy();
    expect(api.scan).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }));
    await waitFor(() => expect(api.scan).toHaveBeenCalledTimes(2));
  });

  it('offers New only when writable and a root exists', async () => {
    mockStoryboards(stories());
    const { unmount } = render(<StoryboardsView />);
    expect(await screen.findByRole('button', { name: 'New storyboard' })).toBeTruthy();
    unmount();
    resetStoryboardsStore();
    mockStoryboards(stories(), { writable: false });
    render(<StoryboardsView />);
    await screen.findByRole('navigation', { name: 'Storyboard catalogue' });
    expect(screen.queryByRole('button', { name: 'New storyboard' })).toBeNull();
    cleanup();
    resetStoryboardsStore();
    mockStoryboards(stories(), { roots: [] });
    render(<StoryboardsView />);
    await screen.findByRole('navigation', { name: 'Storyboard catalogue' });
    expect(screen.queryByRole('button', { name: 'New storyboard' })).toBeNull();
  });

  it('opens a storyboard in the detail pane when a card is clicked', async () => {
    const api = mockStoryboards(stories());
    render(<StoryboardsView />);
    fireEvent.click(await screen.findByRole('button', { name: /Buy gold via mobile app/ }));
    await waitFor(() => expect(api.detail).toHaveBeenCalledWith('buy-gold-mobile'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Buy gold via mobile app' })).toBeTruthy();
  });
});
