import { MetamodelService } from './MetamodelService';
import { MetamodelCacheService } from './MetamodelCacheService';
import { BackendMetamodelApiService } from './BackendMetamodelApiService';
import { MetamodelMappingService } from './MetamodelMappingService';

jest.mock('./BackendMetamodelApiService');
jest.mock('./MetamodelMappingService');

describe('MetamodelService', () => {
  const metadata = { displayName: 'Orders', fields: [], defaultColumns: [] } as any;

  beforeEach(() => {
    MetamodelCacheService.getInstance().clear();
    (BackendMetamodelApiService.getInstance as jest.Mock).mockResolvedValue({
      getEntityMetadata: jest.fn().mockResolvedValue({}),
    });
    (MetamodelMappingService.mapBackendMetadataToFrontend as jest.Mock).mockReturnValue(metadata);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // A streaming blotter re-renders on every update and reads the metamodel synchronously; if the
  // cached entry expired, the first update after the TTL crashed the blotter.
  it('keeps a loaded metamodel available long after loading', async () => {
    const service = MetamodelService.getInstance();
    await service.getMetamodelAsync('Order' as any);

    const later = Date.now() + 24 * 60 * 60 * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(later);

    expect(service.getMetamodel('Order' as any)).toBe(metadata);
  });

  it('still throws when the metamodel was never loaded', () => {
    expect(() => MetamodelService.getInstance().getMetamodel('Execution' as any)).toThrow(
      /Metamodel not found for Execution/
    );
  });
});
