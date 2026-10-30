import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService, migrateConfig, resolveStoryboardsConfig } from '../../src/main/services/ConfigService';
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

describe('ConfigService storyboards', () => {
  it('defaults: enabled, KB root, 1 MiB sources, 512 KiB assets, writable', () => {
    expect(DEFAULT_CONFIG.storyboards).toEqual({
      enabled: true,
      roots: ['oms-knowledge-base/storyboards'],
      maxSourceBytes: 1_048_576,
      maxAssetBytes: 524_288,
      writable: true,
    });
  });

  it('a saved config without a storyboards section gets the defaults', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-config-'));
    const { storyboards: _omit, ...legacy } = DEFAULT_CONFIG;
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(legacy));
    const config = await new ConfigService(dir).load();
    expect(config.storyboards).toEqual(DEFAULT_CONFIG.storyboards);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('environment overrides win over the saved config', () => {
    const resolved = resolveStoryboardsConfig(
      { ...DEFAULT_CONFIG.storyboards, roots: ['saved/root'] },
      {
        COCKPIT_STORYBOARDS_ENABLED: 'false',
        COCKPIT_STORYBOARDS_ROOTS: 'a/storyboards;b/*/docs/storyboards',
        COCKPIT_STORYBOARDS_MAX_SOURCE_BYTES: '2048',
        COCKPIT_STORYBOARDS_MAX_ASSET_BYTES: '4096',
        COCKPIT_STORYBOARDS_WRITABLE: '0',
      },
    );
    expect(resolved).toEqual({
      enabled: false,
      roots: ['a/storyboards', 'b/*/docs/storyboards'],
      maxSourceBytes: 2048,
      maxAssetBytes: 4096,
      writable: false,
    });
  });

  it('ignores malformed numeric overrides', () => {
    const resolved = resolveStoryboardsConfig(DEFAULT_CONFIG.storyboards, { COCKPIT_STORYBOARDS_MAX_SOURCE_BYTES: 'lots' });
    expect(resolved.maxSourceBytes).toBe(1_048_576);
  });
});
