// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AiKeysSection } from '../../src/renderer/views/settings/AiKeysSection';
import { useAiKeysStore } from '../../src/renderer/stores/aiKeys';
import type { AiKeyStatus } from '../../src/shared/types/ai';

const KEY = 'sk-ant-typed-in-settings';

function status(over: Partial<AiKeyStatus> = {}): AiKeyStatus {
  return {
    available: true,
    saved: { anthropic: false, openai: false, local: false },
    active: { provider: 'anthropic', source: 'none', envVar: 'ANTHROPIC_API_KEY' },
    ...over,
  };
}

function install(initial: AiKeyStatus, setResult: unknown = { ok: true }) {
  let current = initial;
  const keys = {
    status: vi.fn(async () => current),
    set: vi.fn(async (provider: string) => {
      if ((setResult as { ok: boolean }).ok) current = { ...current, saved: { ...current.saved, [provider]: true }, active: { ...current.active, source: 'saved' } };
      return setResult;
    }),
    clear: vi.fn(async (provider: string) => {
      current = { ...current, saved: { ...current.saved, [provider]: false }, active: { ...current.active, source: 'none' } };
      return { ok: true };
    }),
  };
  (window as unknown as { cockpit: unknown }).cockpit = { ai: { keys } };
  return keys;
}

function renderSection(envVar = 'ANTHROPIC_API_KEY') {
  const onEnvVarChange = vi.fn();
  const onValidityChange = vi.fn();
  render(<AiKeysSection envVar={envVar} onEnvVarChange={onEnvVarChange} onValidityChange={onValidityChange} />);
  return { onEnvVarChange, onValidityChange };
}

const keyInput = (provider: string) => screen.getByLabelText(`${provider} API key`) as HTMLInputElement;

afterEach(() => {
  cleanup();
  useAiKeysStore.setState(useAiKeysStore.getInitialState(), true);
  delete (window as unknown as { cockpit?: unknown }).cockpit;
});

describe('Settings → AI keys (SPEC-0063)', () => {
  it('key inputs are write-only (AC-3)', async () => {
    install(status({ saved: { anthropic: true, openai: false, local: false }, active: { provider: 'anthropic', source: 'saved', envVar: 'ANTHROPIC_API_KEY' } }));
    renderSection();
    expect(await screen.findByTestId('key-status-anthropic')).toHaveProperty('textContent', 'Saved');
    expect(screen.getByTestId('key-status-openai').textContent).toBe('Not set');
    for (const p of ['Anthropic', 'OpenAI', 'Local']) {
      expect(keyInput(p).type).toBe('password');
      expect(keyInput(p).value).toBe('');
    }
    expect(document.body.textContent).toMatch(/uses: saved key/i);
  });

  it('save and clear call the key channels (AC-6)', async () => {
    const keys = install(status());
    renderSection();
    await screen.findByTestId('key-status-anthropic');

    fireEvent.change(keyInput('Anthropic'), { target: { value: KEY } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Anthropic key' }));
    });
    expect(keys.set).toHaveBeenCalledWith('anthropic', KEY);
    expect(keyInput('Anthropic').value).toBe(''); // never kept in the form
    expect(screen.getByTestId('key-status-anthropic').textContent).toBe('Saved');
    expect(document.body.textContent).not.toContain(KEY);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear Anthropic key' }));
    });
    expect(keys.clear).toHaveBeenCalledWith('anthropic');
    expect(screen.getByTestId('key-status-anthropic').textContent).toBe('Not set');
  });

  it('shows a refusal message (AC-8)', async () => {
    install(status({ available: false }), { ok: false, code: 'encryption-unavailable', message: 'OS encryption is unavailable, so the key cannot be stored safely.' });
    renderSection();
    await screen.findByTestId('key-status-anthropic');
    expect(document.body.textContent).toMatch(/OS encryption is unavailable/);
    fireEvent.change(keyInput('Anthropic'), { target: { value: KEY } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Anthropic key' }));
    });
    expect(screen.getByTestId('key-error-anthropic').textContent).toMatch(/cannot be stored safely/);
    expect(screen.getByTestId('key-status-anthropic').textContent).toBe('Not set');
  });

  it('an IPC failure is shown as the row error, not an unhandled rejection (review finding 7)', async () => {
    const keys = install(status());
    keys.set.mockRejectedValueOnce(new Error('IPC channel failed'));
    renderSection();
    await screen.findByTestId('key-status-anthropic');
    fireEvent.change(keyInput('Anthropic'), { target: { value: KEY } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Anthropic key' }));
    });
    expect(screen.getByTestId('key-error-anthropic').textContent).toMatch(/not saved/i);
    expect(screen.getByTestId('key-status-anthropic').textContent).toBe('Not set');
    expect(document.body.textContent).not.toContain(KEY);
  });

  it('flags an invalid variable name and blocks save (AC-9)', async () => {
    install(status());
    const { onEnvVarChange } = renderSection('ANTHROPIC_API_KEY');
    await screen.findByTestId('key-status-anthropic');
    const field = screen.getByLabelText(/Environment variable name/) as HTMLInputElement;

    fireEvent.change(field, { target: { value: 'sk-ant-pasted-key' } });
    expect(onEnvVarChange).toHaveBeenLastCalledWith('sk-ant-pasted-key');
    cleanup();
    const bad = renderSection('sk-ant-pasted-key');
    expect((await screen.findByTestId('env-var-error')).textContent).toMatch(/variable name/);
    expect(bad.onValidityChange).toHaveBeenLastCalledWith(false);

    cleanup();
    const ok = renderSection('MY_KEY');
    await screen.findByTestId('key-status-anthropic');
    expect(screen.queryByTestId('env-var-error')).toBeNull();
    expect(ok.onValidityChange).toHaveBeenLastCalledWith(true);
  });
});

describe('SettingsView Save with an invalid variable name (SPEC-0063 AC-9)', () => {
  it('is disabled from any tab while the draft holds an invalid name', async () => {
    install(status());
    const { SettingsView } = await import('../../src/renderer/views/settings/SettingsView');
    const { useConfigStore } = await import('../../src/renderer/stores/config');
    const { DEFAULT_CONFIG } = await import('../../src/shared/types/config');
    useConfigStore.setState({ config: { ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, apiKeyEnvVar: 'sk-ant-pasted-key' } }, loaded: true });
    render(<SettingsView />);
    const save = screen.getByRole('button', { name: /^Save$/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId('settings-invalid').textContent).toMatch(/environment variable name/i);

    cleanup();
    useConfigStore.setState({ config: { ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, apiKeyEnvVar: 'ANTHROPIC_API_KEY' } }, loaded: true });
    render(<SettingsView />);
    expect((screen.getByRole('button', { name: /^Save$/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
