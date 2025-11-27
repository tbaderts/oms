// BackendMetamodelApiService.ts - Communicates with OMS backend MetaModel API
import { ApiClient } from './ApiClient';
import { ConfigService } from './ConfigService';

export class BackendMetamodelApiService {
  private static instance: BackendMetamodelApiService | null = null;
  private apiClient: ApiClient | null = null;

  private constructor() {}

  public static async getInstance(): Promise<BackendMetamodelApiService> {
    if (!BackendMetamodelApiService.instance) {
      BackendMetamodelApiService.instance = new BackendMetamodelApiService();
      await BackendMetamodelApiService.instance.initialize();
    }
    return BackendMetamodelApiService.instance;
  }

  private async initialize(): Promise<void> {
    const config = await ConfigService.getConfig();
    this.apiClient = new ApiClient({
      baseURL: config.apiBaseUrl,
    });
  }

  public async getAllMetadata(): Promise<any> {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }
    return this.apiClient.get('/api/v1/metamodel');
  }

  public async getEntityMetadata(entityName: string): Promise<any> {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }
    return this.apiClient.get(`/api/v1/metamodel/${entityName}`);
  }

  public async listEntities(): Promise<string[]> {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }
    return this.apiClient.get('/api/v1/metamodel/entities');
  }

  public async healthCheck(): Promise<any> {
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }
    return this.apiClient.get('/api/v1/metamodel/health');
  }
}
