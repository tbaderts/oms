// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsView } from '../../src/renderer/views/settings/SettingsView';
import { useConfigStore } from '../../src/renderer/stores/config';
import { DEFAULT_CONFIG, type CockpitConfig } from '../../src/shared/types/config';
import { defaultProjectConfig, type ProjectConfigResult } from '../../src/shared/projectConfig';

describe('Settings', () => {
  afterEach(() => {
    cleanup();
    useConfigStore.setState(useConfigStore.getInitialState(), true);
  });

  const project = (over: Partial<ProjectConfigResult>): ProjectConfigResult => ({
    file: '/work/acme/cockpit.yaml',
    present: true,
    config: defaultProjectConfig(),
    errors: [],
    declared: { knowledgeBaseRoot: false, openApiPaths: false, avroPaths: false, storyboardRoots: false, templateSources: false },
    ...over,
  });
  const mount = (p: ProjectConfigResult) => {
    window.matchMedia ??= (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = {
      config: { save: vi.fn(async () => {}), load: vi.fn(async () => DEFAULT_CONFIG), project: vi.fn(async () => p) },
    };
    render(<SettingsView />);
  };

  it('projectCard_showsValidationErrors', async () => {
    mount(project({ errors: [{ path: 'monitoring.services[1].check.kind', message: 'Invalid input' }] }));
    expect((await screen.findByTestId('project-status')).textContent).toBe('1 error');
    expect(screen.getByTestId('project-card').textContent).toContain('/work/acme/cockpit.yaml');
    expect(screen.getByTestId('project-errors').textContent).toContain('monitoring.services[1].check.kind: Invalid input');
    expect(screen.getByTestId('project-errors-effect').textContent).toMatch(/none of the file applies/);
  });

  it('project card summarises a valid file and locks the settings it states', async () => {
    const config = { ...defaultProjectConfig(), project: { name: 'Acme Shop', description: '' }, knowledgeBase: { root: 'handbook', checkScript: 'x.mjs' } };
    mount(project({ config, declared: { knowledgeBaseRoot: true, openApiPaths: false, avroPaths: false, storyboardRoots: true, templateSources: false } }));
    expect((await screen.findByTestId('project-status')).textContent).toBe('valid');
    expect(screen.getByTestId('project-card').textContent).toContain('Acme Shop');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Knowledge Base' }));
    expect(((await screen.findByLabelText('Root Path')) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Storyboard roots') as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('a missing project file is reported as not found', async () => {
    mount(project({ present: false }));
    expect((await screen.findByTestId('project-status')).textContent).toBe('not found');
    expect(screen.queryByLabelText('oms-core URL')).toBeNull();
  });

  it('edits the storyboard roots, write access and size limits', async () => {
    window.matchMedia ??= (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    const save = vi.fn(async (_c: CockpitConfig) => {});
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { config: { save, load: vi.fn(async () => DEFAULT_CONFIG) } };
    render(<SettingsView />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Knowledge Base' }));
    const roots = (await screen.findByLabelText('Storyboard roots')) as HTMLTextAreaElement;
    expect(roots.value).toBe('knowledge-base/storyboards');
    fireEvent.change(roots, { target: { value: 'knowledge-base/storyboards\n  */handbook/storyboards  \n' } });
    fireEvent.click(screen.getByLabelText('Storyboards writable'));
    fireEvent.change(screen.getByLabelText('Max source file size (bytes)'), { target: { value: '2048' } });
    fireEvent.change(screen.getByLabelText('Max illustration size (bytes)'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].storyboards).toEqual({
      ...DEFAULT_CONFIG.storyboards,
      roots: ['knowledge-base/storyboards', '*/handbook/storyboards'],
      writable: false,
      maxSourceBytes: 2048,
    });
  });

  it('edits the API Explorer template files', async () => {
    window.matchMedia ??= (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    const save = vi.fn(async (_c: CockpitConfig) => {});
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { config: { save, load: vi.fn(async () => DEFAULT_CONFIG) } };
    render(<SettingsView />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Infrastructure' }));
    const area = (await screen.findByLabelText('API Explorer template files')) as HTMLTextAreaElement;
    expect(area.value).toBe('');
    fireEvent.change(area, { target: { value: 'requests/shop.http\nC:/tmp/mine.http' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].infrastructure.apiTemplateSources).toEqual(['requests/shop.http', 'C:/tmp/mine.http']);
  });

  it('shows the AI usage summary on the AI tab', async () => {
    window.matchMedia ??= (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    const usage = vi.fn(async () => ({ entries: 5, totalInput: 1000, totalOutput: 400 }));
    const save = vi.fn(async (_c: CockpitConfig) => {});
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = {
      config: { save, load: vi.fn(async () => DEFAULT_CONFIG) },
      ai: { usage },
    };
    render(<SettingsView />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'AI' }));
    const summary = await screen.findByTestId('ai-usage-summary');
    expect(summary.textContent).toContain('AI usage');
    expect(summary.textContent).toContain('5');
    expect(summary.textContent).toContain('1000');
    expect(summary.textContent).toContain('400');
    expect(usage).toHaveBeenCalled();
  });

  it('does not crash when the AI namespace is missing (stale preload)', async () => {
    window.matchMedia ??= (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    const save = vi.fn(async (_c: CockpitConfig) => {});
    // Simulate a stale build where preload.ts has not been rebuilt and the `ai` key is absent.
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { config: { save, load: vi.fn(async () => DEFAULT_CONFIG) } };
    render(<SettingsView />);

    // Opening the AI tab must not throw; the usage summary simply stays hidden.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'AI' }));
    await waitFor(() => expect(screen.queryByTestId('ai-usage-summary')).toBeNull());
  });
});
