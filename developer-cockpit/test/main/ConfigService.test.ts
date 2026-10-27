import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService, migrateConfig } from '../../src/main/services/ConfigService';
import { DEFAULT_CONFIG } from '../../src/shared/types/config';

const LEGACY = { openApiPaths: ['oms-core/src/main/openapi'], avroPaths: ['oms-core/src/main/avro'] };

describe('ConfigService contract paths', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  const writeSaved = (config: unknown) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-config-'));
    fs.writeFileSync(path.join(dir!, 'config.json'), JSON.stringify(config, null, 2));
  };
  const readSaved = () => JSON.parse(fs.readFileSync(path.join(dir!, 'config.json'), 'utf8'));

  it('defaults point at oms-contracts', () => {
    expect(DEFAULT_CONFIG.specs.openApiPaths).toEqual(['oms-contracts/src/main/openapi']);
    expect(DEFAULT_CONFIG.specs.avroPaths).toEqual(['oms-contracts/src/main/avro']);
  });

  it('migrates the legacy oms-core contract paths and saves', async () => {
    const saved = {
      ...DEFAULT_CONFIG,
      general: { ...DEFAULT_CONFIG.general, workspaceRoot: 'D:\\somewhere', theme: 'light' },
      specs: { ...LEGACY, autoGenerate: true },
    };
    writeSaved(saved);

    const config = await new ConfigService(dir).load();

    expect(config.specs).toEqual({ ...DEFAULT_CONFIG.specs, autoGenerate: true });
    const onDisk = readSaved();
    expect(onDisk.specs).toEqual({ ...DEFAULT_CONFIG.specs, autoGenerate: true });
    // Everything else is written back unchanged.
    expect({ ...onDisk, specs: null }).toEqual({ ...saved, specs: null });
  });

  it('keeps custom contract paths', async () => {
    const custom = { openApiPaths: ['oms-core/src/main/openapi', 'extra/openapi'], avroPaths: ['my/avro'], autoGenerate: false };
    writeSaved({ ...DEFAULT_CONFIG, specs: custom });
    const before = fs.readFileSync(path.join(dir!, 'config.json'), 'utf8');

    const config = await new ConfigService(dir).load();

    expect(config.specs).toEqual(custom);
    expect(fs.readFileSync(path.join(dir!, 'config.json'), 'utf8')).toBe(before);
  });

  it('migrateConfig is a no-op for current paths', () => {
    const r = migrateConfig(DEFAULT_CONFIG);
    expect(r.migrated).toBe(false);
    expect(r.config.specs).toEqual(DEFAULT_CONFIG.specs);
    // Only the exact legacy array is replaced; the other may already be current.
    const half = migrateConfig({ ...DEFAULT_CONFIG, specs: { ...DEFAULT_CONFIG.specs, avroPaths: LEGACY.avroPaths } });
    expect(half.migrated).toBe(true);
    expect(half.config.specs).toEqual(DEFAULT_CONFIG.specs);
  });
});
