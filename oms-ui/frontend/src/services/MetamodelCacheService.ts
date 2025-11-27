// MetamodelCacheService.ts - In-memory caching for metamodel data

export interface CacheEntry<T> {
  data: T;
  expiry: number;
}

export class MetamodelCacheService {
  private static instance: MetamodelCacheService;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL: number = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  public static getInstance(): MetamodelCacheService {
    if (!MetamodelCacheService.instance) {
      MetamodelCacheService.instance = new MetamodelCacheService();
    }
    return MetamodelCacheService.instance;
  }

  public set<T>(key: string, data: T, ttl?: number): void {
    const expiry = Date.now() + (ttl || this.defaultTTL);
    this.cache.set(key, { data, expiry });
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  public has(key: string): boolean {
    return this.get(key) !== null;
  }

  public clear(): void {
    this.cache.clear();
  }

  public getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
