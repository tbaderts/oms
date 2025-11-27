// MetamodelService.ts - Main metamodel service with caching and fallback
import { DomainObjectType, DomainObjectMetadata, FieldMetadata } from '../types/types';
import { BackendMetamodelApiService } from './BackendMetamodelApiService';
import { MetamodelMappingService } from './MetamodelMappingService';
import { MetamodelCacheService } from './MetamodelCacheService';
import { StaticMetamodel } from './StaticMetamodel';

export class MetamodelService {
  private static instance: MetamodelService;
  private cacheService: MetamodelCacheService;

  private constructor() {
    this.cacheService = MetamodelCacheService.getInstance();
  }

  public static getInstance(): MetamodelService {
    if (!MetamodelService.instance) {
      MetamodelService.instance = new MetamodelService();
    }
    return MetamodelService.instance;
  }

  // Synchronous method - uses cached or static fallback
  public getMetamodel(domainObject: DomainObjectType): DomainObjectMetadata {
    const cacheKey = `${domainObject}-metadata`;
    const cached = this.cacheService.get<DomainObjectMetadata>(cacheKey);
    
    if (cached) {
      return cached;
    }

    // Fallback to static metamodel
    const staticMetadata = StaticMetamodel.getMetadata(domainObject);
    if (staticMetadata) {
      return staticMetadata;
    }

    throw new Error(`Metamodel not found for ${domainObject}`);
  }

  // Asynchronous method - fetches from backend
  public async getMetamodelAsync(domainObject: DomainObjectType): Promise<DomainObjectMetadata> {
    const cacheKey = `${domainObject}-metadata`;
    const cached = this.cacheService.get<DomainObjectMetadata>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const backendService = await BackendMetamodelApiService.getInstance();
      const backendMetadata = await backendService.getEntityMetadata(domainObject);
      const metadata = MetamodelMappingService.mapBackendMetadataToFrontend(backendMetadata);
      
      this.cacheService.set(cacheKey, metadata);
      return metadata;
    } catch (error) {
      console.warn(`Failed to fetch metamodel from backend for ${domainObject}, using static fallback:`, error);
      
      const staticMetadata = StaticMetamodel.getMetadata(domainObject);
      if (staticMetadata) {
        return staticMetadata;
      }
      
      throw new Error(`Metamodel not found for ${domainObject}`);
    }
  }

  public getField(domainObject: DomainObjectType, fieldName: string): FieldMetadata | null {
    const metadata = this.getMetamodel(domainObject);
    return metadata.fields.find(f => f.name === fieldName) || null;
  }

  public getFilterableFields(domainObject: DomainObjectType): FieldMetadata[] {
    const metadata = this.getMetamodel(domainObject);
    return metadata.fields.filter(f => f.filterable !== false);
  }

  public getSortableFields(domainObject: DomainObjectType): FieldMetadata[] {
    const metadata = this.getMetamodel(domainObject);
    return metadata.fields.filter(f => f.sortable !== false);
  }

  public async refreshCache(): Promise<void> {
    this.cacheService.clear();
  }
}
