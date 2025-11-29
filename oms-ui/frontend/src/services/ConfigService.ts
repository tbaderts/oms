// ConfigService.ts - Fetch runtime configuration from Spring Boot backend

export interface AppConfig {
  appName: string;
  apiBaseUrl: string;
  streamingUrl?: string; // WebSocket URL for RSocket streaming
}

export class ConfigService {
  private static config: AppConfig | null = null;
  private static loading: Promise<AppConfig> | null = null;

  public static async getConfig(): Promise<AppConfig> {
    if (this.config) {
      return this.config;
    }

    if (this.loading) {
      return this.loading;
    }

    this.loading = this.fetchConfig();
    this.config = await this.loading;
    this.loading = null;
    return this.config;
  }

  private static async fetchConfig(): Promise<AppConfig> {
    try {
      // Auto-detect context path
      const contextPath = this.getContextPath();
      const configUrl = `${contextPath}/api/config`;

      const response = await fetch(configUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.statusText}`);
      }

      const config: AppConfig = await response.json();
      return config;
    } catch (error) {
      console.warn('Failed to fetch config from backend, using defaults:', error);
      // Fallback to development defaults - use empty base URL to go through React dev proxy
      // In production, the config endpoint will provide the correct URL
      return {
        appName: 'OMS Admin Tool',
        apiBaseUrl: '',  // Empty = use relative URLs via proxy in dev
        streamingUrl: 'ws://localhost:7000/rsocket',
      };
    }
  }

  private static getContextPath(): string {
    const path = window.location.pathname;
    // Extract context path (e.g., /ri-oms/ from /ri-oms/index.html)
    const match = path.match(/^(\/[^/]+)\//);
    return match ? match[1] : '';
  }

  public static getCachedConfig(): AppConfig | null {
    return this.config;
  }
}
