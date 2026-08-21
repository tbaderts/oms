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

  beforeEach(async () => {
    jest.clearAllMocks();
    mockedGetConfig.mockResolvedValue({
      appName: 'OMS Admin Tool',
      apiBaseUrl: 'http://localhost:8090',
    });
    (OMSApiService as any).instance = null;
    (OMSApiService as any).initPromise = null;

    mockGet = jest.fn();
    MockedApiClient.mockImplementation(() => ({ get: mockGet }) as unknown as ApiClient);

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

  describe('getExecutions', () => {
    it('calls the /api/executions endpoint', async () => {
      mockGet.mockResolvedValue({
        content: [],
        totalElements: 0,
        totalPages: 1,
        size: 100,
        number: 0,
      });

      await apiService.getExecutions();

      expect(mockGet).toHaveBeenCalledWith('/api/executions', expect.anything());
    });

    it('normalizes a raw Spring Data Page response to the UI page shape', async () => {
      mockGet.mockResolvedValue({
        content: [{ id: 1, execId: 'E-1', orderId: 'O-1' }],
        totalElements: 42,
        totalPages: 1,
        size: 100,
        number: 0,
      });

      const result = await apiService.getExecutions();

      expect(result.content).toHaveLength(1);
      expect(result.page).toEqual({
        totalElements: 42,
        totalPages: 1,
        size: 100,
        number: 0,
      });
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
});
