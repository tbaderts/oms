// OMSApiService.ts - Query domain objects from OMS backend
import { ApiClient } from './ApiClient';
import { ConfigService } from './ConfigService';
import { FilterCondition, PageResponse, Order, Execution } from '../types/types';

/** What became of an order sent from order entry (SPEC-0072). */
export type CreateOrderOutcome =
  | { kind: 'created'; orderId: string }
  | { kind: 'refused'; status: number; body: any }
  | { kind: 'network'; message: string };

/**
 * Normalizes a paged response to the shape the UI expects ({ content, page }).
 *
 * oms-core's searches (`/api/query/search` for orders, `/api/query/executions/search` for
 * executions, SPEC-0070) return `{ content, page }` natively.
 */
function normalizePage<T>(raw: any): PageResponse<T> {
  if (!raw) {
    return { content: [], page: { totalElements: 0, totalPages: 0, size: 0, number: 0 } };
  }

  if (raw.page && Array.isArray(raw.content)) {
    return raw as PageResponse<T>;
  }

  // Unexpected shape — surface an empty page rather than crash the grid
  return { content: [], page: { totalElements: 0, totalPages: 0, size: 0, number: 0 } };
}

export class OMSApiService {
  private static instance: OMSApiService | null = null;
  private static initPromise: Promise<OMSApiService> | null = null;
  private apiClient: ApiClient | null = null;

  private constructor() {}

  public static async getInstance(): Promise<OMSApiService> {
    // Use a single initialization promise to prevent race conditions
    if (!OMSApiService.initPromise) {
      OMSApiService.initPromise = (async () => {
        if (!OMSApiService.instance) {
          OMSApiService.instance = new OMSApiService();
          await OMSApiService.instance.initialize();
        }
        return OMSApiService.instance;
      })();
    }
    return OMSApiService.initPromise;
  }

  private async initialize(): Promise<void> {
    const config = await ConfigService.getConfig();
    this.apiClient = new ApiClient({
      baseURL: config.apiBaseUrl,
    });
  }

  // Query orders
  public async getOrders(
    filters?: FilterCondition[],
    sort?: { field: string; direction: 'asc' | 'desc' },
    page: number = 0,
    size: number = 100
  ): Promise<PageResponse<Order>> {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }

    const params = this.buildQueryParams(filters, sort, page, size);

    try {
      const raw = await this.apiClient.get<any>('/api/query/search', { params });
      return normalizePage<Order>(raw);
    } catch (error) {
      console.error('[OMSApiService] getOrders - Error:', error);
      throw error;
    }
  }

  // Get order by ID (uses the query search endpoint with an orderId filter,
  // since oms-core does not expose a single-order query path)
  public async getOrderById(id: string): Promise<Order | null> {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }
    const response = await this.apiClient.get<PageResponse<Order>>('/api/query/search', {
      params: { orderId: id, size: 1 },
    });
    const page = normalizePage<Order>(response);
    return page.content.length > 0 ? page.content[0] : null;
  }

  /**
   * Sends an OrderCreateCmd to oms-core (SPEC-0072). Never throws: the outcome says whether the order
   * was created, refused (with oms-core's answer, to show) or not sent at all (network), in which case
   * the same ticket, with the same clOrdId, may be sent again.
   */
  public async createOrder(command: unknown): Promise<CreateOrderOutcome> {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }
    try {
      const result = await this.apiClient.post<{ id?: string }>('/api/command/execute', command);
      return { kind: 'created', orderId: result?.id ?? '' };
    } catch (error: any) {
      if (error?.response) {
        return { kind: 'refused', status: error.response.status, body: error.response.data };
      }
      return { kind: 'network', message: error?.message ?? 'Network error' };
    }
  }

  /** The order with this client order id, or null (SPEC-0072: resolves a ticket's own duplicate). */
  public async findOrderByClOrdId(clOrdId: string): Promise<Order | null> {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }
    const response = await this.apiClient.get<PageResponse<Order>>('/api/query/search', {
      params: { clOrdId, size: 1 },
    });
    const page = normalizePage<Order>(response);
    return page.content.length > 0 ? page.content[0] : null;
  }

  // Query executions
  public async getExecutions(
    filters?: FilterCondition[],
    sort?: { field: string; direction: 'asc' | 'desc' },
    page: number = 0,
    size: number = 100
  ): Promise<PageResponse<Execution>> {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }

    const params = this.buildQueryParams(filters, sort, page, size);
    // The specified execution search over stored fills, filtered like orders (SPEC-0070)
    const raw = await this.apiClient.get<any>('/api/query/executions/search', { params });
    return normalizePage<Execution>(raw);
  }

  // Build query parameters from filters
  private buildQueryParams(
    filters?: FilterCondition[],
    sort?: { field: string; direction: 'asc' | 'desc' },
    page: number = 0,
    size: number = 100
  ): any {
    const params: any = {
      page,
      size,
    };

    if (sort) {
      params.sort = `${sort.field},${sort.direction.toUpperCase()}`;
    }

    if (filters) {
      filters.forEach(filter => {
        const paramKey = `${filter.field}${filter.operation}`;
        
        if (filter.operation === '__between' && filter.value2) {
          params[paramKey] = `${filter.value},${filter.value2}`;
        } else {
          params[paramKey] = filter.value;
        }
      });
    }

    return params;
  }

  // Helper methods for creating filters
  public static equals(field: string, value: any): FilterCondition {
    return { field, operation: '', value };
  }

  public static like(field: string, pattern: string): FilterCondition {
    return { field, operation: '__like', value: `%${pattern}%` };
  }

  public static greaterThan(field: string, value: any): FilterCondition {
    return { field, operation: '__gt', value };
  }

  public static greaterThanOrEqual(field: string, value: any): FilterCondition {
    return { field, operation: '__gte', value };
  }

  public static lessThan(field: string, value: any): FilterCondition {
    return { field, operation: '__lt', value };
  }

  public static lessThanOrEqual(field: string, value: any): FilterCondition {
    return { field, operation: '__lte', value };
  }

  public static between(field: string, min: any, max: any): FilterCondition {
    return { field, operation: '__between', value: min, value2: max };
  }

  public static startsWith(field: string, prefix: string): FilterCondition {
    return { field, operation: '__like', value: `${prefix}%` };
  }

  public static endsWith(field: string, suffix: string): FilterCondition {
    return { field, operation: '__like', value: `%${suffix}` };
  }

  public static contains(field: string, text: string): FilterCondition {
    return { field, operation: '__like', value: `%${text}%` };
  }
}
