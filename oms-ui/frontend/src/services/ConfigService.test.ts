import { ConfigService, getMaxStreamingRows, DEFAULT_MAX_STREAMING_ROWS } from './ConfigService';

describe('ConfigService maxStreamingRows (SPEC-0054)', () => {
  // Access the private cache through the public API: getConfig caches whatever
  // fetch returns, so we stub global fetch per case.
  const loadConfig = async (body: any) => {
    (global as any).fetch = async () => ({ ok: true, json: async () => body });
    await ConfigService.getConfig();
  };

  afterEach(() => {
    // Reset the singleton cache between cases
    (ConfigService as any).config = null;
    (ConfigService as any).loading = null;
    delete (global as any).fetch;
  });

  it('returns the configured value when it is a positive number', async () => {
    await loadConfig({ appName: 'OMS', apiBaseUrl: '', maxStreamingRows: 1500 });
    expect(getMaxStreamingRows()).toBe(1500);
  });

  it('falls back to the default when maxStreamingRows is missing', async () => {
    await loadConfig({ appName: 'OMS', apiBaseUrl: '' });
    expect(getMaxStreamingRows()).toBe(DEFAULT_MAX_STREAMING_ROWS);
  });

  it('falls back to the default when maxStreamingRows is zero', async () => {
    await loadConfig({ appName: 'OMS', apiBaseUrl: '', maxStreamingRows: 0 });
    expect(getMaxStreamingRows()).toBe(DEFAULT_MAX_STREAMING_ROWS);
  });

  it('falls back to the default when maxStreamingRows is negative', async () => {
    await loadConfig({ appName: 'OMS', apiBaseUrl: '', maxStreamingRows: -5 });
    expect(getMaxStreamingRows()).toBe(DEFAULT_MAX_STREAMING_ROWS);
  });

  it('falls back to the default when maxStreamingRows is not a number', async () => {
    await loadConfig({ appName: 'OMS', apiBaseUrl: '', maxStreamingRows: 'x' });
    expect(getMaxStreamingRows()).toBe(DEFAULT_MAX_STREAMING_ROWS);
  });

  it('falls back to the default when no config has been loaded', () => {
    expect(getMaxStreamingRows()).toBe(DEFAULT_MAX_STREAMING_ROWS);
  });
});
