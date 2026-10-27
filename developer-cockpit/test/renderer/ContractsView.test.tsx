// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Sidebar } from '../../src/renderer/components/layout/Sidebar';
import { DashboardView } from '../../src/renderer/views/dashboard/DashboardView';
import { ContractsView } from '../../src/renderer/views/contracts/ContractsView';
import { NAV_ITEMS, useNavigationStore } from '../../src/renderer/stores/navigation';
import { useSpecsStore } from '../../src/renderer/stores/specs';
import { mockCockpit } from './ticket-fixtures';

vi.mock('@monaco-editor/react', () => ({ loader: { config: () => {} }, default: () => <textarea aria-label="Document text" /> }));

const OLD_LABELS = ['Specs Editor', 'Domain Model', 'Code Generator'];

function mockSpecs() {
  const specs = {
    discoverFiles: vi.fn(async () => [{
      path: '/ws/oms-contracts/src/main/openapi/oms-cmd-api.yml', relativePath: 'oms-contracts/src/main/openapi/oms-cmd-api.yml',
      name: 'oms-cmd-api.yml', type: 'openapi', extension: '.yml',
    }]),
    parseEntities: vi.fn(async () => [{ name: 'OrderCreateCmd', source: 'avro', kind: 'record', fields: [], references: [] }]),
    getCodeGenTasks: vi.fn(async () => [{
      id: 'contracts', name: 'Contract models', description: 'Generate models', inputSpec: 'in', outputPackage: 'out',
      module: 'oms-contracts', gradleTasks: ['generateAvroJava'],
    }]),
  };
  const ticketApi = mockCockpit();
  (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { specTickets: ticketApi, specs };
  return specs;
}

describe('Contracts view', () => {
  afterEach(() => {
    cleanup();
    useSpecsStore.setState(useSpecsStore.getInitialState(), true);
    useNavigationStore.setState({ activeView: 'dashboard' });
  });

  it('sidebar and palette offer one Contracts entry', () => {
    // The command palette searches NAV_ITEMS, the same list the sidebar renders.
    expect(NAV_ITEMS.filter((i) => i.id === 'contracts')).toEqual([
      { id: 'contracts', label: 'Contracts', group: 'Development', icon: 'FileCode' },
    ]);
    expect(NAV_ITEMS.map((i) => i.label)).not.toEqual(expect.arrayContaining([expect.stringMatching(/Specs Editor|Domain Model|Code Generator/)]));

    render(<Sidebar />);
    expect(screen.getAllByText('Contracts')).toHaveLength(1);
    for (const label of OLD_LABELS) expect(screen.queryByText(label)).toBeNull();
    fireEvent.click(screen.getByText('Contracts'));
    expect(useNavigationStore.getState().activeView).toBe('contracts');
  });

  it('Contracts shows Editor, Domain Model and Code Generation tabs with their content', async () => {
    const specs = mockSpecs();
    render(<ContractsView />);

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Editor', 'Domain Model', 'Code Generation']);
    expect(await screen.findByText('oms-cmd-api.yml')).toBeTruthy();
    expect(specs.discoverFiles).toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Domain Model' }));
    expect(await screen.findByText('OrderCreateCmd')).toBeTruthy();
    // The tab is the title; no second "Domain Model" heading inside it.
    expect(screen.getAllByText('Domain Model')).toHaveLength(1);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Code Generation' }));
    expect(await screen.findByText('Contract models')).toBeTruthy();
    expect(screen.queryByText('Code Generator')).toBeNull();
  });

  // Since SPEC-0006 the Dashboard has no quick links; it must not point at the removed views either.
  it('Dashboard does not link to the removed views', () => {
    mockSpecs();
    render(<DashboardView />);
    for (const label of OLD_LABELS) expect(screen.queryByText(label)).toBeNull();
  });
});
