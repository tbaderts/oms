import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SpecsService } from '../../src/main/services/SpecsService';
import { DEFAULT_CONFIG } from '../../src/shared/types/config';
import { REPO_ROOT } from '../fixtures/workspace';

/** A workspace with a few contract files under oms-contracts and a decoy under the old oms-core path. */
function contractsWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-contracts-'));
  const put = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  put('oms-contracts/src/main/openapi/oms-cmd-api.yml', 'openapi: 3.0.0\n');
  put('oms-contracts/src/main/openapi/schema.yaml', 'openapi: 3.0.0\n');
  put('oms-contracts/src/main/openapi/README.md', '# not a contract\n');
  put('oms-contracts/src/main/avro/Side.avsc', '{"type":"enum","name":"Side","symbols":["BUY"]}');
  put('oms-contracts/src/main/avro-old/Old.avsc', '{}');
  put('oms-core/src/main/openapi/stale.yml', 'openapi: 3.0.0\n');
  put('oms-core/src/main/avro/Stale.avsc', '{}');
  return root;
}

describe('SpecsService on oms-contracts', () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it('discovers oms-contracts files with the default paths', () => {
    root = contractsWorkspace();
    const files = new SpecsService(root, DEFAULT_CONFIG.specs).discoverFiles();

    expect(files.map((f) => [f.relativePath, f.type]).sort()).toEqual([
      ['oms-contracts/src/main/avro/Side.avsc', 'avro'],
      ['oms-contracts/src/main/openapi/oms-cmd-api.yml', 'openapi'],
      ['oms-contracts/src/main/openapi/schema.yaml', 'openapi'],
    ]);
    expect(files.some((f) => f.relativePath.startsWith('oms-core/'))).toBe(false);
  });

  it("parses domain entities from the repository's oms-contracts", () => {
    const entities = new SpecsService(REPO_ROOT, DEFAULT_CONFIG.specs).parseEntities();

    expect(new Set(entities.map((e) => e.source))).toEqual(new Set(['openapi', 'avro']));
    expect(entities.some((e) => e.name === 'OrderCreateCmd')).toBe(true);
    expect(entities.find((e) => e.name === 'Side')).toMatchObject({ kind: 'enum' });
  });

  it('refuses to save outside the contract folders', () => {
    root = contractsWorkspace();
    const svc = new SpecsService(root, DEFAULT_CONFIG.specs);
    const abs = (rel: string) => path.join(root!, rel);
    const before = (rel: string) => fs.readFileSync(abs(rel), 'utf8');

    const refused = [
      'oms-contracts/src/main/avro-old/Old.avsc',          // sibling folder sharing the prefix
      'oms-core/src/main/openapi/stale.yml',               // another workspace folder
      'oms-contracts/src/main/openapi/README.md',          // not a contract file
    ];
    for (const rel of refused) {
      const content = before(rel);
      expect(() => svc.writeFile(abs(rel), 'changed'), rel).toThrow();
      expect(before(rel), rel).toBe(content);
    }
    const outside = path.join(os.tmpdir(), `cockpit-outside-${process.pid}.yml`);
    expect(() => svc.writeFile(outside, 'changed')).toThrow();
    expect(fs.existsSync(outside)).toBe(false);

    // A contract folder configured outside the workspace is not a way out of it.
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-outside-dir-'));
    fs.writeFileSync(path.join(outsideDir, 'x.yml'), 'orig');
    const escaping = new SpecsService(root!, { ...DEFAULT_CONFIG.specs, openApiPaths: [outsideDir] });
    expect(() => escaping.writeFile(path.join(outsideDir, 'x.yml'), 'changed')).toThrow(/outside workspace/);
    expect(fs.readFileSync(path.join(outsideDir, 'x.yml'), 'utf8')).toBe('orig');
    fs.rmSync(outsideDir, { recursive: true, force: true });

    svc.writeFile(abs('oms-contracts/src/main/openapi/oms-cmd-api.yml'), 'openapi: 3.1.0\n');
    expect(before('oms-contracts/src/main/openapi/oms-cmd-api.yml')).toBe('openapi: 3.1.0\n');
  });
});
