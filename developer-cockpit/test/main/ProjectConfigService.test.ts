import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProjectConfigService } from '../../src/main/services/ProjectConfigService';
import { defaultProjectConfig } from '../../src/shared/projectConfig';

describe('ProjectConfigService', () => {
  let ws: string | undefined;
  afterEach(() => {
    if (ws) fs.rmSync(ws, { recursive: true, force: true });
    ws = undefined;
  });
  const service = (log: string[] = []) => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-project-'));
    return new ProjectConfigService(() => ws!, (l) => log.push(l));
  };

  it('absentFile_defaultsWithoutError', () => {
    const s = service();
    const r = s.get();
    expect(r).toMatchObject({ present: false, errors: [], file: path.join(ws!, 'cockpit.yaml') });
    expect(r.config).toEqual(defaultProjectConfig());
  });

  it('reads, validates and logs the file once until it changes', () => {
    const log: string[] = [];
    const s = service(log);
    fs.writeFileSync(path.join(ws!, 'cockpit.yaml'), 'project: { name: Acme Shop }\n');
    expect(s.get().config.project.name).toBe('Acme Shop');
    s.get();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatch(/^\[config\] cockpit\.yaml valid: /);

    fs.writeFileSync(path.join(ws!, 'cockpit.yaml'), 'monitoring: { intervalSeconds: 1 }\n');
    const bad = s.get();
    expect(bad.errors.map((e) => e.path)).toEqual(['monitoring.intervalSeconds']);
    expect(log[1]).toMatch(/1 error\(s\)/);
  });

  it('a file that disappears goes back to the defaults', () => {
    const s = service();
    fs.writeFileSync(path.join(ws!, 'cockpit.yaml'), 'project: { name: Acme Shop }\n');
    expect(s.get().present).toBe(true);
    fs.rmSync(path.join(ws!, 'cockpit.yaml'));
    expect(s.get().present).toBe(false);
  });
});
