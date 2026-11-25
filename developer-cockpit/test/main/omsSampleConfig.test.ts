import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { parseProjectConfig } from '../../src/shared/projectConfig';
import { parseHttpFile } from '../../src/shared/httpFile';

// The sample project file of the repository the cockpit was developed in (SPEC-0076 AC-7). It lives
// next to this folder only while the cockpit sits inside that repository; elsewhere (a clone of the
// cockpit's own repository) there is nothing to check.
const HOST = path.resolve(__dirname, '..', '..', '..');
const SAMPLE = path.join(HOST, 'cockpit.yaml');
const COMPOSE = path.join(HOST, 'docker-compose.yml');
const present = fs.existsSync(SAMPLE) && fs.existsSync(COMPOSE);

describe.skipIf(!present)('the host repository sample cockpit.yaml (needs cockpit.yaml and docker-compose.yml next to the cockpit)', () => {
  const result = present ? parseProjectConfig(fs.readFileSync(SAMPLE, 'utf8'), SAMPLE) : null;

  it('omsCockpitYaml_validCoversComposeAndFormerTiles', () => {
    expect(result!.errors).toEqual([]);
    const config = result!.config;

    const compose = parseYaml(fs.readFileSync(COMPOSE, 'utf8')) as { services: Record<string, unknown> };
    const composeServices = Object.keys(compose.services).sort();
    expect(config.monitoring.services.map((s) => s.name).sort()).toEqual(composeServices);

    const panels = config.monitoring.panels.map((p) => p.title);
    for (const tile of ['Orders by state', 'Order events / min', 'Time to ack p99', 'Time to market p99', 'Outbox pending', 'Outbox stuck', 'Outbox oldest age']) {
      expect(panels).toContain(tile);
    }
  });

  it('every path it names exists', () => {
    const config = result!.config;
    const paths = [
      config.knowledgeBase.root,
      config.knowledgeBase.checkScript,
      path.join(config.knowledgeBase.root, config.knowledgeBase.stateDiagramDoc ?? ''),
      config.specs.cli,
      ...config.specs.openApiPaths,
      ...config.specs.avroPaths,
      ...config.codegen.map((t) => t.cwd),
      ...config.watch,
      ...config.apiExplorer.templateSources,
      ...config.apiExplorer.apis.map((a) => a.spec),
    ];
    expect(paths.filter((p) => !fs.existsSync(path.join(HOST, p)))).toEqual([]);
  });

  it('its template files parse into named requests', () => {
    for (const source of result!.config.apiExplorer.templateSources) {
      const file = parseHttpFile(fs.readFileSync(path.join(HOST, source), 'utf8'));
      expect(file.requests.length, source).toBeGreaterThan(0);
    }
  });
});
