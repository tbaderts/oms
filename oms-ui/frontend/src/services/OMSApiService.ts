// OMSApiService.ts - Query domain objects from OMS backend
import { ApiClient } from './ApiClient';
import { ConfigService } from './ConfigService';
import { FilterCondition, PageResponse, Order, Execution } from '../types/types';

/**
 * Normalizes a paged response to the shape the UI expects ({ content, page }).
 *
 * - oms-core `/api/query/search` returns `PagedOrderDto` ({ content, page }) natively.
 * - oms-core `/api/executions` returns a raw Spring Data `Page` where the
 *   metadata (totalElements, totalPages, size, number) sits at the top level.
 */
function normalizePage<T>(raw: any): PageResponse<T> {
  if (!raw) {
    return { content: [], page: { totalElements: 0, totalPages: 0, size: 0, number: 0 } };
  }

  // Already in PagedOrderDto shape
  if (raw.page && Array.isArray(raw.content)) {
    return raw as PageResponse<T>;
  }

  // Raw Spring Data Page shape
  if (Array.isArray(raw.content)) {
    return {
      content: raw.content,
      page: {
        totalElements: raw.totalElements ?? raw.content.length,
        totalPages: raw.totalPages ?? 1,
        size: raw.size ?? raw.content.length,
        number: raw.number ?? 0,
      },
    };
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
    const raw = await this.apiClient.get<any>('/api/executions', { params });
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
