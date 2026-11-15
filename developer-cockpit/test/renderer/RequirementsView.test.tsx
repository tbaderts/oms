// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RequirementsView } from '../../src/renderer/views/requirements/RequirementsView';
import { useRequirementsStore } from '../../src/renderer/stores/requirements';
import type { Actor, Capability, FunctionalRequirement, NonFunctionalRequirement, UseCase } from '../../src/shared/types/requirements';

const capabilities: Capability[] = [
  {
    id: 'order-capture', title: 'Order Capture', description: 'Taking new orders in.', maturity: 'implemented',
    commands: ['OrderCreateCmd'], useCases: ['UC-001'], requirements: ['FR-001', 'NFR-001'], status: 'draft', source: 'x',
  },
  {
    id: 'quotes', title: 'Quotes', description: 'RFQ.', maturity: 'planned',
    commands: [], useCases: ['UC-020'], requirements: ['FR-037'], status: 'draft', source: 'y',
  },
];
const useCases: UseCase[] = [
  {
    id: 'UC-001', title: 'Submit an order', description: 'A trader submits an order.', actors: ['Trader'], capability: 'order-capture',
    preconditions: [], postconditions: [], mainFlow: ['Send'], alternativeFlows: ['Validation fails: refused'], requirements: ['FR-001'], source: 'u',
  },
];
const functionalReqs: FunctionalRequirement[] = [
  { id: 'FR-001', title: 'Accept new orders', description: 'd', priority: 'must', status: 'draft', implementation: 'partial', capability: 'order-capture', source: 'f' },
];
const nonFunctionalReqs: NonFunctionalRequirement[] = [
  { id: 'NFR-010', title: 'Backward-compatible contracts', description: 'd', category: 'compatibility', metric: 'm', target: '0', implementation: 'partial', capability: 'event-publication', source: 'n' },
];
const actors: Actor[] = [{ id: 'trader', name: 'Trader', kind: 'human', description: 'd', responsibilities: [], source: 'a' }];

function mockApi() {
  (window as unknown as { cockpit: Record<string, unknown> }).cockpit = {
    requirements: {
      getCapabilities: vi.fn(async () => capabilities),
      getUseCases: vi.fn(async () => useCases),
      getFunctionalRequirements: vi.fn(async () => functionalReqs),
      getNonFunctionalRequirements: vi.fn(async () => nonFunctionalReqs),
      getActors: vi.fn(async () => actors),
    },
  };
}

describe('Requirements view (SPEC-0061)', () => {
  afterEach(() => {
    cleanup();
    useRequirementsStore.setState(useRequirementsStore.getInitialState(), true);
  });

  it('opens on a Capabilities tab listing each capability with its maturity', async () => {
    mockApi();
    render(<RequirementsView />);
    const tab = await screen.findByRole('tab', { name: 'Capabilities' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    const capture = (await screen.findByText('Order Capture')).closest('tr')!;
    expect(within(capture).getByText('implemented')).toBeTruthy();
    expect(within(capture).getByText('1')).toBeTruthy(); // one use case
    expect(within(capture).getByText('2')).toBeTruthy(); // two requirements
    const quotes = screen.getByText('Quotes').closest('tr')!;
    expect(within(quotes).getByText('planned')).toBeTruthy();
  });

  it('selecting a capability lists its use cases and requirements', async () => {
    mockApi();
    render(<RequirementsView />);
    fireEvent.click(await screen.findByText('Order Capture'));
    const detail = await screen.findByLabelText('Capability details');
    expect(within(detail).getByText('UC-001')).toBeTruthy();
    expect(within(detail).getByText(/Submit an order/)).toBeTruthy();
    expect(within(detail).getByText('FR-001')).toBeTruthy();
    expect(within(detail).getByText('OrderCreateCmd')).toBeTruthy();
  });

  it('shows the implementation of functional requirements', async () => {
    mockApi();
    render(<RequirementsView />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Functional Requirements' }));
    const row = (await screen.findByText('Accept new orders')).closest('tr')!;
    expect(within(row).getByText('partial')).toBeTruthy();
  });

  it('shows a use case with its capability, alternative flows and requirements', async () => {
    mockApi();
    render(<RequirementsView />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Use Cases' }));
    fireEvent.click(await screen.findByText('UC-001'));
    expect(await screen.findByText('Validation fails: refused')).toBeTruthy();
    expect(screen.getByText('Order Capture')).toBeTruthy(); // capability title, not its id
    expect(screen.getByText('FR-001')).toBeTruthy();
    expect(screen.getByText(/Accept new orders/)).toBeTruthy();
  });

  it('shows the implementation of non-functional requirements', async () => {
    mockApi();
    render(<RequirementsView />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Non-Functional Requirements' }));
    const row = (await screen.findByText('Backward-compatible contracts')).closest('tr')!;
    expect(within(row).getByText('partial')).toBeTruthy();
  });
});
