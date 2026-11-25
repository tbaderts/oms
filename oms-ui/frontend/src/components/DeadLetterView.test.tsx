// SPEC-0075: the Dead letters tab - what the command listener could not process.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DeadLetterView from './DeadLetterView';

const mockTopics = jest.fn();
const mockRecords = jest.fn();

jest.mock('../services/OMSApiService', () => ({
  OMSApiService: {
    getInstance: async () => ({
      getDeadLetterTopics: (...args: any[]) => mockTopics(...args),
      getDeadLetterRecords: (...args: any[]) => mockRecords(...args),
    }),
  },
}));

const avro = {
  topic: 'commands.DLT', partition: 0, offset: 4, timestamp: '2026-11-25T09:05:00Z', key: 'ORD-1',
  originalTopic: 'commands', originalPartition: 0, originalOffset: 41, originalTimestamp: '2026-11-25T09:04:59Z',
  exceptionClass: 'org.springframework.kafka.listener.ListenerExecutionFailedException',
  exceptionMessage: 'Unknown command type org.example.common.model.msg.FutureCmd',
  payloadFormat: 'AVRO', payload: { orderId: 'ORD-1', header: { version: '1.0.0' } },
  headers: { 'kafka_dlt-original-topic': 'commands', 'kafka_dlt-exception-message': 'Unknown command type' },
};
const text = {
  ...avro, offset: 5, key: 'ORD-2', payloadFormat: 'TEXT', payload: null, payloadText: 'not a command, just text',
  exceptionMessage: 'Not Avro',
};

const rows = () => screen.getAllByRole('row').filter((r) => r.classList.contains('dlt-row'));

beforeEach(() => {
  mockTopics.mockReset().mockResolvedValue([
    { topic: 'commands.DLT', partitions: 3, records: 2 },
    { topic: 'other.DLT', partitions: 1, records: 0 },
  ]);
  mockRecords.mockReset().mockResolvedValue([text, avro]);
});

describe('DeadLetterView (SPEC-0075)', () => {
  it('lists the dead-letter topics with their counts (AC-6)', async () => {
    render(<DeadLetterView />);

    const commands = await screen.findByRole('button', { name: /commands\.DLT/ });
    expect(commands.textContent).toMatch(/2 records/);
    expect(screen.getByRole('button', { name: /other\.DLT/ }).textContent).toMatch(/0 records/);
  });

  it("shows the first topic's latest records with the failure details (AC-7)", async () => {
    render(<DeadLetterView />);

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(mockRecords).toHaveBeenCalledWith('commands.DLT', 50);
    expect(screen.getByRole('button', { name: /commands\.DLT/ }).getAttribute('aria-pressed')).toBe('true');
    const second = within(rows()[1]);
    expect(second.getByText('ORD-1')).toBeInTheDocument();
    expect(second.getByText('commands 0@41')).toBeInTheDocument();
    expect(second.getByText('ListenerExecutionFailedException')).toBeInTheDocument();
    expect(second.getByText('Unknown command type org.example.common.model.msg.FutureCmd')).toBeInTheDocument();
  });

  it("opens a record with its decoded payload and headers (AC-7)", async () => {
    render(<DeadLetterView />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Open record 0/4' }));

    const detail = screen.getByRole('region', { name: 'Dead letter 0/4' });
    expect(within(detail).getByText('org.springframework.kafka.listener.ListenerExecutionFailedException')).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: /Payload/ }).getAttribute('aria-expanded')).toBe('true');
    expect(within(detail).getByText('"ORD-1"')).toBeInTheDocument();
    expect(within(detail).getByText('kafka_dlt-original-topic')).toBeInTheDocument();
  });

  it('shows a text payload as text', async () => {
    render(<DeadLetterView />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Open record 0/5' }));

    const detail = screen.getByRole('region', { name: 'Dead letter 0/5' });
    expect(within(detail).getByText('not a command, just text')).toBeInTheDocument();
    expect(within(detail).getByText(/TEXT/)).toBeInTheDocument();
  });

  it('reads another topic when selected', async () => {
    render(<DeadLetterView />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    mockRecords.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: /other\.DLT/ }));

    expect(await screen.findByText('No records on other.DLT')).toBeInTheDocument();
    expect(mockRecords).toHaveBeenLastCalledWith('other.DLT', 50);
  });

  it('shows an error with retry when Kafka is unavailable (AC-9)', async () => {
    mockTopics.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 503'), {
      response: { status: 503, data: { detail: 'Could not list dead-letter topics on kafka:9092: TimeoutException' } },
    }));
    render(<DeadLetterView />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Could not load the dead letters: Could not list dead-letter topics on kafka:9092/);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an empty state without dead-letter topics (AC-10)', async () => {
    mockTopics.mockResolvedValue([]);
    render(<DeadLetterView />);

    expect(await screen.findByText('No dead-letter topics: nothing has been dead-lettered')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(mockRecords).not.toHaveBeenCalled();
  });

  it('refresh reloads the topics and the records', async () => {
    render(<DeadLetterView />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh dead letters' }));

    await waitFor(() => expect(mockTopics).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockRecords).toHaveBeenCalledTimes(2));
  });
});
