// OMSApiService.ts - Query domain objects from OMS backend
import { ApiClient } from './ApiClient';
import { ConfigService } from './ConfigService';
import { FilterCondition, PageResponse, Order, Execution } from '../types/types';

export class OMSApiService {
  private static instance: OMSApiService | null = null;
  private apiClient: ApiClient | null = null;

  private constructor() {}

  public static async getInstance(): Promise<OMSApiService> {
    if (!OMSApiService.instance) {
      OMSApiService.instance = new OMSApiService();
      await OMSApiService.instance.initialize();
    }
    return OMSApiService.instance;
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
    console.log('[OMSApiService] getOrders - Request params:', params);
    console.log('[OMSApiService] getOrders - Filters:', filters);
    console.log('[OMSApiService] getOrders - Sort:', sort);
    console.log('[OMSApiService] getOrders - Page:', page, 'Size:', size);
    
    try {
      const response = await this.apiClient.get<PageResponse<Order>>('/api/query/search', { params });
      console.log('[OMSApiService] getOrders - Response:', response);
      console.log('[OMSApiService] getOrders - Content length:', response?.content?.length);
      console.log('[OMSApiService] getOrders - Page metadata:', response?.page);
      console.log('[OMSApiService] getOrders - Total elements:', response?.page?.totalElements);
      return response;
    } catch (error) {
      console.error('[OMSApiService] getOrders - Error:', error);
      throw error;
    }
  }

  // Get order by ID
  public async getOrderById(id: string): Promise<Order> {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }
    return this.apiClient.get<Order>(`/api/query/search/${id}`);
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
    return this.apiClient.get<PageResponse<Execution>>('/api/v1/queries/executions', { params });
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

    console.log('[OMSApiService] buildQueryParams - Input filters:', filters);
    console.log('[OMSApiService] buildQueryParams - Input sort:', sort);

    if (sort) {
      params.sort = `${sort.field},${sort.direction.toUpperCase()}`;
      console.log('[OMSApiService] buildQueryParams - Sort param:', params.sort);
    }

    if (filters) {
      filters.forEach(filter => {
        const paramKey = `${filter.field}${filter.operation}`;
        
        if (filter.operation === '__between' && filter.value2) {
          params[paramKey] = `${filter.value},${filter.value2}`;
        } else {
          params[paramKey] = filter.value;
        }
        console.log('[OMSApiService] buildQueryParams - Added param:', paramKey, '=', params[paramKey]);
      });
    }

    console.log('[OMSApiService] buildQueryParams - Final params:', params);
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
