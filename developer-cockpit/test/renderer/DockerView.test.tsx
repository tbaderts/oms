// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { DockerView } from '../../src/renderer/views/docker/DockerView';
import { useDockerStore } from '../../src/renderer/stores/docker';
import type { CockpitConfig } from '../../src/shared/types/config';
import { DEFAULT_CONFIG } from '../../src/shared/types/config';

function setConfig(overrides: Partial<CockpitConfig['infrastructure']> = {}) {
  const config = { ...DEFAULT_CONFIG, infrastructure: { ...DEFAULT_CONFIG.infrastructure, ...overrides } };
  (window as unknown as { cockpit: Record<string, unknown> }).cockpit = {
    config: { load: vi.fn(async () => config) },
    docker: {
      list: vi.fn(async () => ({ ok: true, containers: [] })),
      logs: vi.fn(async () => ({ ok: true, logs: '' })),
    },
  };
}

const CONTAINERS = [
  { id: 'abc', name: 'oms-core', image: 'oms-core:latest', status: 'running', health: 'healthy', state: 'Up 5 minutes', cpu: '0.42%', memory: '128MiB / 8GiB', ports: '0.0.0.0:8090->8090/tcp' },
  { id: 'def', name: 'exchange-simulator', image: 'oms-exchange-simulator:latest', status: 'restarting', health: '', state: 'Restarting (1) 10s ago', cpu: '0%', memory: '64MiB / 8GiB', ports: '' },
  { id: 'ghi', name: 'old-container', image: 'test:1.0', status: 'exited', health: '', state: 'Exited (1) 2h ago', cpu: '', memory: '', ports: '' },
];

describe('DockerView', () => {
  afterEach(() => {
    cleanup();
    useDockerStore.setState(useDockerStore.getInitialState(), true);
  });

  it('AC-4: shows disabled notice when dockerEnabled is false', async () => {
    setConfig({ dockerEnabled: false });
    render(<DockerView />);
    await waitFor(() => {
      expect(screen.getByText(/Docker monitoring is disabled/i)).toBeTruthy();
    });
    // The docker.list IPC should NOT have been called.
    const listFn = (window.cockpit as { docker: { list: ReturnType<typeof vi.fn> } }).docker.list;
    expect(listFn).not.toHaveBeenCalled();
  });

  it('AC-6: updates container status on refresh without full reload', async () => {
    let callCount = 0;
    const config = { ...DEFAULT_CONFIG, infrastructure: { ...DEFAULT_CONFIG.infrastructure, dockerEnabled: true, dockerRefreshIntervalSeconds: 1 } };
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = {
      config: { load: vi.fn(async () => config) },
      docker: {
        list: vi.fn(async () => {
          callCount++;
          if (callCount === 1) return { ok: true, containers: CONTAINERS };
          const updated = CONTAINERS.map((c) =>
            c.name === 'oms-core' ? { ...c, status: 'exited', state: 'Exited (1) 30s ago' } : c
          );
          return { ok: true, containers: updated };
        }),
        logs: vi.fn(async () => ({ ok: true, logs: '' })),
      },
    };

    render(<DockerView />);

    // Wait for the first render
    await waitFor(() => {
      expect(screen.getByText('oms-core')).toBeTruthy();
    });
    // Initially running
    expect(screen.getByTestId('docker-status-running')).toBeTruthy();

    // Wait for the second refresh (1s interval): oms-core's running dot should be gone.
    // (There are 3 containers; only oms-core was running, so the running dot disappears.)
    await waitFor(() => {
      expect(screen.queryByTestId('docker-status-running')).toBeNull();
    }, { timeout: 3000 });

    // oms-core's row now shows an exited status (find it by the container's name button)
    const omsCoreBtn = screen.getByTestId('docker-container-oms-core');
    const row = omsCoreBtn.closest('tr');
    expect(row?.querySelector('[data-testid="docker-status-exited"]')).toBeTruthy();
  });

  it('AC-8: retains last known list on transient failure', async () => {
    let callCount = 0;
    const config = { ...DEFAULT_CONFIG, infrastructure: { ...DEFAULT_CONFIG.infrastructure, dockerEnabled: true, dockerRefreshIntervalSeconds: 1 } };
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = {
      config: { load: vi.fn(async () => config) },
      docker: {
        list: vi.fn(async () => {
          callCount++;
          if (callCount === 1) return { ok: true, containers: CONTAINERS };
          return { ok: false, code: 'unavailable', message: 'Docker daemon not reachable' };
        }),
        logs: vi.fn(async () => ({ ok: true, logs: '' })),
      },
    };

    render(<DockerView />);

    // First render shows the containers
    await waitFor(() => {
      expect(screen.getByText('oms-core')).toBeTruthy();
    });

    // Wait for the second refresh to fail
    await waitFor(() => {
      expect(screen.getByText(/Connection lost/i)).toBeTruthy();
    }, { timeout: 3000 });

    // The last known containers are still shown
    expect(screen.getByText('oms-core')).toBeTruthy();
    expect(screen.getByText('exchange-simulator')).toBeTruthy();
  });
});
