import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService, resolveStoryboardsConfig } from '../../src/main/services/ConfigService';
import { DEFAULT_CONFIG } from '../../src/shared/types/config';
import { REPO_ROOT } from '../fixtures/workspace';
import { KeyStore } from '../../src/main/ai/KeyStore';
import { migrateAiKeys } from '../../src/main/ai/keyMigration';
import { fakeCrypto } from './keyTestUtils';

const getWorkspaceRoot = (service: ConfigService) => service.getConfig().general.workspaceRoot;

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

  it('defaults name no project paths', () => {
    expect(DEFAULT_CONFIG.specs.openApiPaths).toEqual([]);
    expect(DEFAULT_CONFIG.specs.avroPaths).toEqual([]);
    expect(DEFAULT_CONFIG.knowledgeBase.rootPath).toBe('knowledge-base');
  });

  it('keeps custom contract paths and drops the removed API URL setting', async () => {
    const custom = { openApiPaths: ['api/openapi', 'extra/openapi'], avroPaths: ['my/avro'], autoGenerate: false };
    writeSaved({ ...DEFAULT_CONFIG, specs: custom, infrastructure: { ...DEFAULT_CONFIG.infrastructure, omsCoreUrl: 'http://localhost:8090' } });

    const config = await new ConfigService(dir).load();

    expect(config.specs).toEqual(custom);
    expect(config.infrastructure).not.toHaveProperty('omsCoreUrl');
    expect(readSaved().infrastructure).not.toHaveProperty('omsCoreUrl');
  });

  it.skipIf(!fs.existsSync(path.join(REPO_ROOT, '.git')))('an empty workspace root is filled from the repo the app runs inside (needs the cockpit inside a git repository)', async () => {
    const saved = { ...DEFAULT_CONFIG, general: { ...DEFAULT_CONFIG.general, workspaceRoot: '' } };
    writeSaved(saved);
    const before = fs.readFileSync(path.join(dir!, 'config.json'), 'utf8');

    const service = new ConfigService(dir);
    await service.load();

    // The effective root is the repository this checkout runs inside.
    expect(getWorkspaceRoot(service)).toBe(REPO_ROOT);
    // Auto-detection is resolved at read time and never persisted: the file is untouched.
    expect(fs.readFileSync(path.join(dir!, 'config.json'), 'utf8')).toBe(before);
  });

  it('a saved foreign-platform path is left as-is (downstream guards make it non-fatal)', async () => {
    writeSaved({ ...DEFAULT_CONFIG, general: { ...DEFAULT_CONFIG.general, workspaceRoot: 'C:\\data\\workspace\\acme' } });
    const service = new ConfigService(dir);
    await service.load();
    expect(getWorkspaceRoot(service)).toBe('C:\\data\\workspace\\acme');
  });

  it('the COCKPIT_WORKSPACE_ROOT environment variable wins over the saved value', async () => {
    writeSaved({ ...DEFAULT_CONFIG, general: { ...DEFAULT_CONFIG.general, workspaceRoot: '/somewhere/saved' } });
    process.env.COCKPIT_WORKSPACE_ROOT = '/somewhere/env';
    try {
      const service = new ConfigService(dir);
      await service.load();
      expect(getWorkspaceRoot(service)).toBe('/somewhere/env');
    } finally {
      delete process.env.COCKPIT_WORKSPACE_ROOT;
    }
  });

});

describe('ConfigService storyboards', () => {
  it('defaults: enabled, KB root, 1 MiB sources, 512 KiB assets, writable', () => {
    expect(DEFAULT_CONFIG.storyboards).toEqual({
      enabled: true,
      roots: ['knowledge-base/storyboards'],
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

describe('ConfigService key migration (SPEC-0063 AC-7)', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('load runs the key migration before saving', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-config-keys-'));
    const LEGACY_LOCAL = 'vllm-legacy-key-in-config';
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ ...DEFAULT_CONFIG, infrastructure: { ...DEFAULT_CONFIG.infrastructure, omsCoreUrl: 'http://localhost:8090' }, ai: { ...DEFAULT_CONFIG.ai, provider: 'anthropic', apiKey: LEGACY_LOCAL } }, null, 2),
    );
    const store = new KeyStore(dir, fakeCrypto(), () => {});

    const config = await new ConfigService(dir).load({ migrateKeys: (c) => migrateAiKeys(c, store, () => {}) });

    const onDisk = fs.readFileSync(path.join(dir, 'config.json'), 'utf8');
    expect(onDisk).not.toContain(LEGACY_LOCAL);
    expect(JSON.parse(onDisk).ai).not.toHaveProperty('apiKey');
    expect(JSON.parse(onDisk).infrastructure).not.toHaveProperty('omsCoreUrl'); // the removed setting is dropped in the same save
    expect(config.ai).not.toHaveProperty('apiKey');
    expect(store.get('local')).toBe(LEGACY_LOCAL);
  });

  it('a key migration alone also saves', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-config-keys-'));
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, apiKey: 'k-only' } }, null, 2));
    const store = new KeyStore(dir, fakeCrypto(), () => {});
    await new ConfigService(dir).load({ migrateKeys: (c) => migrateAiKeys(c, store, () => {}) });
    expect(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).not.toContain('k-only');
  });
});

describe('ConfigService project file (SPEC-0076)', () => {
  let dir: string | undefined;
  let ws: string | undefined;
  afterEach(() => {
    for (const d of [dir, ws]) if (d) fs.rmSync(d, { recursive: true, force: true });
    dir = ws = undefined;
  });

  /** A user config that still holds another project's paths, as files saved by older versions do. */
  const setup = (cockpitYaml?: string) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-config-'));
    ws = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-ws-'));
    if (cockpitYaml !== undefined) fs.writeFileSync(path.join(ws, 'cockpit.yaml'), cockpitYaml);
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({
        ...DEFAULT_CONFIG,
        general: { ...DEFAULT_CONFIG.general, workspaceRoot: ws, theme: 'light' },
        knowledgeBase: { ...DEFAULT_CONFIG.knowledgeBase, rootPath: 'old-kb' },
        specs: { ...DEFAULT_CONFIG.specs, openApiPaths: ['old/openapi'], avroPaths: ['old/avro'] },
        storyboards: { ...DEFAULT_CONFIG.storyboards, roots: ['old-kb/storyboards'] },
        infrastructure: { ...DEFAULT_CONFIG.infrastructure, apiTemplateSources: ['old.http'] },
      }),
    );
  };

  it('projectFileOverridesUserProjectSettings', async () => {
    setup(`
project: { name: Acme Shop }
knowledgeBase: { root: handbook }
specs: { openApiPaths: [api/openapi], avroPaths: [api/avro] }
apiExplorer: { templateSources: [requests/shop.http] }
`);
    const service = new ConfigService(dir);
    await service.load();
    const config = service.getConfig();

    expect(config.knowledgeBase.rootPath).toBe('handbook');
    expect(config.specs.openApiPaths).toEqual(['api/openapi']);
    expect(config.specs.avroPaths).toEqual(['api/avro']);
    expect(config.storyboards.roots).toEqual(['handbook/storyboards']);
    expect(config.infrastructure.apiTemplateSources).toEqual(['requests/shop.http']);
    // Personal settings stay the user's.
    expect(config.general.theme).toBe('light');
    expect(service.getProject()).toMatchObject({ present: true, errors: [], config: { project: { name: 'Acme Shop' } } });
  });

  it('settings the project file does not state stay the user values', async () => {
    setup('monitoring:\n  services: []\n');
    const service = new ConfigService(dir);
    await service.load();
    const config = service.getConfig();
    expect(config.knowledgeBase.rootPath).toBe('old-kb');
    expect(config.specs.openApiPaths).toEqual(['old/openapi']);
    expect(config.storyboards.roots).toEqual(['old-kb/storyboards']);
  });

  it('an invalid project file changes nothing and reports its errors', async () => {
    setup('knowledgeBase: { root: handbook }\nmonitoring:\n  services:\n    - name: api\n      check: { kind: http }\n');
    const service = new ConfigService(dir);
    await service.load();
    expect(service.getConfig().knowledgeBase.rootPath).toBe('old-kb');
    expect(service.getProject().errors.map((e) => e.path)).toEqual(['monitoring.services[0].check.url']);
  });

  it('an edited project file applies to the next read', async () => {
    setup('knowledgeBase: { root: first }\n');
    const service = new ConfigService(dir);
    await service.load();
    expect(service.getConfig().knowledgeBase.rootPath).toBe('first');
    fs.writeFileSync(path.join(ws!, 'cockpit.yaml'), 'knowledgeBase: { root: second-longer }\n');
    expect(service.getConfig().knowledgeBase.rootPath).toBe('second-longer');
  });
});
