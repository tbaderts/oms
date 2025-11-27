// ApiClient.ts - Low-level HTTP client with OAuth token injection
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { AuthTokenService } from './AuthTokenService';

export interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  maxRetries?: number;
}

export class ApiClient {
  private axiosInstance: AxiosInstance;
  private authTokenService: AuthTokenService;

  constructor(config: ApiClientConfig) {
    this.authTokenService = AuthTokenService.getInstance();

    this.axiosInstance = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor - inject OAuth token
    this.axiosInstance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        console.log('[ApiClient] Request:', config.method?.toUpperCase(), config.url);
        console.log('[ApiClient] Request params:', config.params);
        console.log('[ApiClient] Request headers:', config.headers);
        
        const token = this.authTokenService.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          console.log('[ApiClient] Token injected (length:', token.length, ')');
        } else {
          console.log('[ApiClient] No token available');
        }
        return config;
      },
      (error: any) => {
        console.error('[ApiClient] Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor - handle errors
    this.axiosInstance.interceptors.response.use(
      (response: any) => {
        console.log('[ApiClient] Response:', response.status, response.statusText);
        console.log('[ApiClient] Response data:', response.data);
        return response;
      },
      (error: any) => {
        console.error('[ApiClient] Error:', error.message);
        console.error('[ApiClient] Error response status:', error.response?.status);
        console.error('[ApiClient] Error response data:', error.response?.data);
        console.error('[ApiClient] Error config:', error.config?.url, error.config?.params);
        return Promise.reject(error);
      }
    );
  }

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.get(url, config);
    return response.data;
  }

  public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.post(url, data, config);
    return response.data;
  }

  public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.put(url, data, config);
    return response.data;
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.delete(url, config);
    return response.data;
  }
}
