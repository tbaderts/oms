// MetamodelService.ts - Main metamodel service with caching
import { DomainObjectType, DomainObjectMetadata, FieldMetadata } from '../types/types';
import { BackendMetamodelApiService } from './BackendMetamodelApiService';
import { MetamodelMappingService } from './MetamodelMappingService';
import { MetamodelCacheService } from './MetamodelCacheService';

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

  // Synchronous method - uses cached metadata (must be preloaded via getMetamodelAsync)
  public getMetamodel(domainObject: DomainObjectType): DomainObjectMetadata {
    const cacheKey = `${domainObject}-metadata`;
    const cached = this.cacheService.get<DomainObjectMetadata>(cacheKey);
    
    if (cached) {
      return cached;
    }

    throw new Error(`Metamodel not found for ${domainObject}. Ensure getMetamodelAsync() was called first.`);
  }

  // Asynchronous method - fetches from backend
  public async getMetamodelAsync(domainObject: DomainObjectType): Promise<DomainObjectMetadata> {
    const cacheKey = `${domainObject}-metadata`;
    const cached = this.cacheService.get<DomainObjectMetadata>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const backendService = await BackendMetamodelApiService.getInstance();
    const backendMetadata = await backendService.getEntityMetadata(domainObject);
    const metadata = MetamodelMappingService.mapBackendMetadataToFrontend(backendMetadata);
    
    // No expiry: the metamodel only changes on deploy, and blotters read it synchronously on every
    // render, so an expired entry crashed the first streamed update after the TTL.
    this.cacheService.set(cacheKey, metadata, Number.POSITIVE_INFINITY);
    return metadata;
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
