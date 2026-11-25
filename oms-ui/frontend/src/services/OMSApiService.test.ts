// OMSApiService.test.ts - Tests for REST endpoint usage and page-shape normalization
import { OMSApiService } from './OMSApiService';
import { ApiClient } from './ApiClient';
import { ConfigService } from './ConfigService';

// Mock ApiClient (axios wrapper)
jest.mock('./ApiClient');
const MockedApiClient = ApiClient as jest.MockedClass<typeof ApiClient>;

// Mock ConfigService so OMSApiService.initialize() does not hit the network
jest.mock('./ConfigService', () => ({
  ConfigService: {
    getConfig: jest.fn(),
  },
}));

const mockedGetConfig = ConfigService.getConfig as jest.Mock;

describe('OMSApiService', () => {
  let apiService: OMSApiService;
  let mockGet: jest.Mock;
  let mockPost: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockedGetConfig.mockResolvedValue({
      appName: 'OMS Admin Tool',
      apiBaseUrl: 'http://localhost:8090',
    });
    (OMSApiService as any).instance = null;
    (OMSApiService as any).initPromise = null;

    mockGet = jest.fn();
    mockPost = jest.fn();
    MockedApiClient.mockImplementation(() => ({ get: mockGet, post: mockPost }) as unknown as ApiClient);

    apiService = await OMSApiService.getInstance();
  });

  describe('getOrders', () => {
    it('calls the /api/query/search endpoint', async () => {
      mockGet.mockResolvedValue({
        content: [{ orderId: 'O-1', symbol: 'BTCUSD' }],
        page: { totalElements: 1, totalPages: 1, size: 100, number: 0 },
      });

      await apiService.getOrders();

      expect(mockGet).toHaveBeenCalledWith('/api/query/search', expect.anything());
    });

    it('passes PagedOrderDto responses through unchanged', async () => {
      const pagedDto = {
        content: [{ orderId: 'O-1', symbol: 'BTCUSD' }],
        page: { totalElements: 1, totalPages: 1, size: 100, number: 0 },
      };
      mockGet.mockResolvedValue(pagedDto);

      const result = await apiService.getOrders();

      expect(result).toEqual(pagedDto);
    });

    it('builds filter, sort, and pagination query params', async () => {
      mockGet.mockResolvedValue({ content: [], page: { totalElements: 0, totalPages: 0, size: 0, number: 0 } });

      await apiService.getOrders(
        [{ field: 'symbol', operation: '__like', value: '%BTC%' }],
        { field: 'transactTime', direction: 'desc' },
        2,
        50
      );

      const [, config] = mockGet.mock.calls[0];
      expect(config.params).toEqual({
        page: 2,
        size: 50,
        sort: 'transactTime,DESC',
        symbol__like: '%BTC%',
      });
    });
  });

  // SPEC-0070 AC-6: the REST execution blotter reads the specified execution search, with its
  // filters in the order search's language, and shows the content of the paged response.
  describe('getExecutions', () => {
    it('calls the execution search with the filters, paging and sort', async () => {
      mockGet.mockResolvedValue({
        content: [{ id: 7, execId: 'E-1', orderId: 'O-1', symbol: 'AAPL' }],
        page: { totalElements: 42, totalPages: 9, size: 5, number: 1 },
      });

      const result = await apiService.getExecutions(
        [OMSApiService.like('symbol', 'AA'), OMSApiService.greaterThanOrEqual('lastQty', 10)],
        { field: 'transactTime', direction: 'desc' },
        1,
        5
      );

      expect(mockGet).toHaveBeenCalledWith('/api/query/executions/search', {
        params: { page: 1, size: 5, sort: 'transactTime,DESC', symbol__like: '%AA%', lastQty__gte: 10 },
      });
      expect(result.content).toEqual([{ id: 7, execId: 'E-1', orderId: 'O-1', symbol: 'AAPL' }]);
      expect(result.page).toEqual({ totalElements: 42, totalPages: 9, size: 5, number: 1 });
    });

    it('no longer calls the retired /api/executions', async () => {
      mockGet.mockResolvedValue({ content: [], page: { totalElements: 0, totalPages: 0, size: 100, number: 0 } });

      await apiService.getExecutions();

      expect(mockGet).not.toHaveBeenCalledWith('/api/executions', expect.anything());
    });
  });

  // SPEC-0072 AC-1, AC-3: order entry sends one command and reads oms-core's answer.
  describe('createOrder', () => {
    const cmd = { type: 'OrderCreateCmd', version: '1.0.0', order: { clOrdId: 'UI-1' } };

    it('posts the command and returns the new order id', async () => {
      mockPost.mockResolvedValue({ id: 'ORD-9', status: 'SUCCESS', eventVersion: 1 });

      expect(await apiService.createOrder(cmd)).toEqual({ kind: 'created', orderId: 'ORD-9' });
      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith('/api/command/execute', cmd);
    });

    it('returns the refusal of oms-core with its body', async () => {
      const body = { status: 'FAILED', message: 'Limit orders must have a price' };
      mockPost.mockRejectedValue({ response: { status: 400, data: body } });

      expect(await apiService.createOrder(cmd)).toEqual({ kind: 'refused', status: 400, body });
    });

    it('reports a network failure separately, so the same ticket can be retried', async () => {
      mockPost.mockRejectedValue(new Error('Network Error'));

      expect(await apiService.createOrder(cmd)).toEqual({ kind: 'network', message: 'Network Error' });
    });
  });

  // SPEC-0072 AC-4: an order created by an earlier attempt of the same ticket is found by its clOrdId.
  describe('findOrderByClOrdId', () => {
    it('searches by clOrdId', async () => {
      mockGet.mockResolvedValue({ content: [{ orderId: 'ORD-9', clOrdId: 'UI-1' }], page: { totalElements: 1, totalPages: 1, size: 1, number: 0 } });

      expect(await apiService.findOrderByClOrdId('UI-1')).toEqual({ orderId: 'ORD-9', clOrdId: 'UI-1' });
      expect(mockGet).toHaveBeenCalledWith('/api/query/search', { params: { clOrdId: 'UI-1', size: 1 } });
    });
  });

  describe('getOrderById', () => {
    it('queries via /api/query/search with an orderId filter', async () => {
      mockGet.mockResolvedValue({
        content: [{ orderId: 'O-1', symbol: 'BTCUSD' }],
        page: { totalElements: 1, totalPages: 1, size: 1, number: 0 },
      });

      const order = await apiService.getOrderById('O-1');

      expect(mockGet).toHaveBeenCalledWith('/api/query/search', {
        params: { orderId: 'O-1', size: 1 },
      });
      expect(order).toEqual({ orderId: 'O-1', symbol: 'BTCUSD' });
    });

    it('returns null when no order matches', async () => {
      mockGet.mockResolvedValue({
        content: [],
        page: { totalElements: 0, totalPages: 0, size: 1, number: 0 },
      });

      const order = await apiService.getOrderById('missing');

      expect(order).toBeNull();
    });
  });

  // SPEC-0074 AC-1: the order history comes from the two existing per-order query endpoints.
  describe('order history (SPEC-0074)', () => {
    it('getOrderEvents calls the events endpoint with the encoded order id', async () => {
      mockGet.mockResolvedValue([{ orderId: 'ORD 1/x', version: 1, event: 'NEW_ORDER' }]);

      const events = await apiService.getOrderEvents('ORD 1/x');

      expect(mockGet).toHaveBeenCalledWith('/api/query/orders/ORD%201%2Fx/events');
      expect(events).toEqual([{ orderId: 'ORD 1/x', version: 1, event: 'NEW_ORDER' }]);
    });

    it('getOrderCommands calls the commands endpoint with the encoded order id', async () => {
      mockGet.mockResolvedValue([{ type: 'OrderCreateCmd', outcome: 'APPLIED', eventVersion: 1 }]);

      const commands = await apiService.getOrderCommands('ORD-1');

      expect(mockGet).toHaveBeenCalledWith('/api/query/orders/ORD-1/commands');
      expect(commands).toEqual([{ type: 'OrderCreateCmd', outcome: 'APPLIED', eventVersion: 1 }]);
    });

    it('answers an empty list for a null body', async () => {
      mockGet.mockResolvedValue(null);

      expect(await apiService.getOrderEvents('ORD-1')).toEqual([]);
      expect(await apiService.getOrderCommands('ORD-1')).toEqual([]);
    });

    it('lets a failed request reject, so the view can show it', async () => {
      mockGet.mockRejectedValue(new Error('Request failed with status code 500'));

      await expect(apiService.getOrderEvents('ORD-1')).rejects.toThrow('500');
    });
  });

  // SPEC-0075: the operator API - outbox and dead letters.
  describe('operations (SPEC-0075)', () => {
    it('getOutboxSummary calls the summary endpoint', async () => {
      mockGet.mockResolvedValue({ pending: 1, stuck: 2, held: 3, maxAttempts: 10 });

      expect(await apiService.getOutboxSummary()).toEqual({ pending: 1, stuck: 2, held: 3, maxAttempts: 10 });
      expect(mockGet).toHaveBeenCalledWith('/api/query/admin/outbox/summary');
    });

    it('getOutboxMessages passes state, page and size, and leaves out an absent state', async () => {
      mockGet.mockResolvedValue({ content: [], page: { size: 50, totalElements: 0, totalPages: 0, number: 0 } });

      await apiService.getOutboxMessages('STUCK', 2, 25);
      expect(mockGet).toHaveBeenCalledWith('/api/query/admin/outbox/messages', { params: { state: 'STUCK', page: 2, size: 25 } });

      await apiService.getOutboxMessages(undefined, 0, 50);
      expect(mockGet).toHaveBeenLastCalledWith('/api/query/admin/outbox/messages', { params: { page: 0, size: 50 } });
    });

    it('getOutboxMessage calls the message endpoint', async () => {
      mockGet.mockResolvedValue({ id: 7, state: 'STUCK' });

      expect(await apiService.getOutboxMessage(7)).toEqual({ id: 7, state: 'STUCK' });
      expect(mockGet).toHaveBeenCalledWith('/api/query/admin/outbox/messages/7');
    });

    it('getDeadLetterTopics calls the topics endpoint; a null body is no topics', async () => {
      mockGet.mockResolvedValue(null);

      expect(await apiService.getDeadLetterTopics()).toEqual([]);
      expect(mockGet).toHaveBeenCalledWith('/api/query/admin/dead-letters');
    });

    it('getDeadLetterRecords calls the records endpoint with the encoded topic and limit', async () => {
      mockGet.mockResolvedValue([{ topic: 'commands.DLT', offset: 4 }]);

      expect(await apiService.getDeadLetterRecords('commands.DLT', 50)).toEqual([{ topic: 'commands.DLT', offset: 4 }]);
      expect(mockGet).toHaveBeenCalledWith('/api/query/admin/dead-letters/commands.DLT/records', { params: { limit: 50 } });
    });
  });
});
