// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsView } from '../../src/renderer/views/settings/SettingsView';
import { useConfigStore } from '../../src/renderer/stores/config';
import { DEFAULT_CONFIG, type CockpitConfig } from '../../src/shared/types/config';

describe('Settings', () => {
  afterEach(() => {
    cleanup();
    useConfigStore.setState(useConfigStore.getInitialState(), true);
  });

  it('edits the oms-core URL', async () => {
    window.matchMedia ??= (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    const save = vi.fn(async (_c: CockpitConfig) => {});
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { config: { save, load: vi.fn(async () => DEFAULT_CONFIG) } };
    render(<SettingsView />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Infrastructure' }));
    const input = (await screen.findByLabelText('oms-core URL')) as HTMLInputElement;
    expect(input.value).toBe('http://localhost:8090');

    fireEvent.change(input, { target: { value: 'http://localhost:18090' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].infrastructure.omsCoreUrl).toBe('http://localhost:18090');
    expect(save.mock.calls[0][0].infrastructure.lokiUrl).toBe(DEFAULT_CONFIG.infrastructure.lokiUrl);
  });

  it('edits the API Explorer template files', async () => {
    window.matchMedia ??= (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    const save = vi.fn(async (_c: CockpitConfig) => {});
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { config: { save, load: vi.fn(async () => DEFAULT_CONFIG) } };
    render(<SettingsView />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Infrastructure' }));
    const area = (await screen.findByLabelText('API Explorer template files')) as HTMLTextAreaElement;
    expect(area.value).toBe('');
    fireEvent.change(area, { target: { value: 'oms-core/rest.http\nC:/tmp/mine.http' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].infrastructure.apiTemplateSources).toEqual(['oms-core/rest.http', 'C:/tmp/mine.http']);
  });
});
