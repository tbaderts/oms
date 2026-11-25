import { describe, expect, it } from 'vitest';
import { defaultProjectConfig, parseProjectConfig, storyboardRoots } from '../../src/shared/projectConfig';

const FILE = '/work/acme/cockpit.yaml';

describe('parseProjectConfig', () => {
  it('validConfig_parsedWithDefaults', () => {
    const r = parseProjectConfig(
      `
project: { name: Acme Shop, description: An online shop }
monitoring:
  prometheusUrl: http://localhost:9090
  services:
    - name: api
      check: { kind: http, url: http://localhost:8000/health }
    - name: db
      group: Data
      check: { kind: tcp, host: localhost, port: 5432 }
  panels:
    - title: Requests
      type: stat
      source: { kind: promql, query: 'sum(rate(http_requests_total[1m]))' }
`,
      FILE,
    );
    expect(r.errors).toEqual([]);
    expect(r.present).toBe(true);
    expect(r.config.project.name).toBe('Acme Shop');
    expect(r.config.monitoring.intervalSeconds).toBe(10);
    expect(r.config.monitoring.services[0]).toMatchObject({ name: 'api', group: 'Services', check: { kind: 'http', timeoutMs: 3000 } });
    expect(r.config.monitoring.services[1].group).toBe('Data');
    expect(r.config.monitoring.panels[0].unit).toBe('count');
    expect(r.config.knowledgeBase.root).toBe('knowledge-base');
  });

  it('invalidEntries_reportedWithPath', () => {
    const r = parseProjectConfig(
      `
monitoring:
  services:
    - name: api
      check: { kind: http }
    - name: queue
      check: { kind: smoke-signal, url: http://localhost:1 }
    - name: api
      check: { kind: tcp, host: localhost, port: 99999 }
  panels:
    - title: Orders
      type: stat
      source: { kind: scrape, service: nope, metric: x }
`,
      FILE,
    );
    expect(r.file).toBe(FILE);
    const paths = r.errors.map((e) => e.path);
    expect(paths).toContain('monitoring.services[0].check.url');
    expect(paths).toContain('monitoring.services[1].check.kind');
    expect(paths).toContain('monitoring.services[2].check.port');
    // The config falls back to the defaults, so the rest of the app keeps working.
    expect(r.config).toEqual(defaultProjectConfig());
  });

  it('crossFieldRules_reportedWithPath', () => {
    const r = parseProjectConfig(
      `
monitoring:
  services:
    - { name: api, check: { kind: http, url: http://localhost:1/ } }
    - { name: api, check: { kind: http, url: http://localhost:2/ } }
  panels:
    - { title: A, type: stat, source: { kind: scrape, service: api, metric: up } }
    - { title: B, type: stat, source: { kind: scrape, service: nope, metric: up } }
    - { title: C, type: stat, source: { kind: promql, query: up } }
`,
      FILE,
    );
    expect(r.errors).toEqual(
      expect.arrayContaining([
        { path: 'monitoring.services[1].name', message: 'Duplicate service name "api"' },
        { path: 'monitoring.panels[0].source.service', message: 'Service "api" has no metricsUrl' },
        { path: 'monitoring.panels[1].source.service', message: 'Unknown service "nope"' },
        { path: 'monitoring.panels[2].source', message: 'A promql panel needs monitoring.prometheusUrl' },
      ]),
    );
  });

  it('yamlSyntaxError_reportedWithLine', () => {
    const r = parseProjectConfig('project:\n  name: [unclosed\nmonitoring: {}\n', FILE);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/^YAML syntax error at line \d+/);
    expect(r.config).toEqual(defaultProjectConfig());
  });

  it('nonMapping_reported', () => {
    expect(parseProjectConfig('- a\n- b\n', FILE).errors[0].message).toMatch(/mapping/);
  });

  it('emptyFile_isDefaults', () => {
    const r = parseProjectConfig('', FILE);
    expect(r.errors).toEqual([]);
    expect(r.config).toEqual(defaultProjectConfig());
  });

  it('storyboardRoots_defaultUnderKnowledgeBase', () => {
    expect(storyboardRoots(defaultProjectConfig())).toEqual(['knowledge-base/storyboards']);
    const r = parseProjectConfig('knowledgeBase: { root: kb }\n', FILE);
    expect(storyboardRoots(r.config)).toEqual(['kb/storyboards']);
  });
});

describe('examples/cockpit.yaml (SPEC-0076)', () => {
  it('exampleConfigIsValid', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const file = path.resolve(__dirname, '..', '..', 'examples', 'cockpit.yaml');
    const text = fs.readFileSync(file, 'utf8');
    const r = parseProjectConfig(text, file);
    expect(r.errors).toEqual([]);
    expect(r.config.monitoring.services.length).toBeGreaterThan(0);
    expect(r.config.monitoring.panels.map((p) => p.source.kind)).toEqual(expect.arrayContaining(['promql', 'scrape']));
    expect(text).not.toMatch(/(?<![a-z0-9])oms(?![a-z0-9])/i);
  });
});
