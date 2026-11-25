import * as fs from 'fs';
import * as path from 'path';
import { PROJECT_CONFIG_FILE, absentProjectConfig, parseProjectConfig, type ProjectConfigResult } from '../../shared/projectConfig';

/**
 * Reads the project's `cockpit.yaml` from the workspace root (SPEC-0076). The file is re-read when
 * its modification time or size changes, so an edit applies to the next call without a restart.
 * Never throws: a missing file is the defaults, an unreadable or invalid one is the defaults plus
 * `errors`.
 */
export class ProjectConfigService {
  private cache: { file: string; stamp: string; result: ProjectConfigResult } | null = null;

  constructor(
    private getWorkspaceRoot: () => string,
    private log: (line: string) => void = (line) => console.info(line),
  ) {}

  get(): ProjectConfigResult {
    const file = path.join(this.getWorkspaceRoot() || '.', PROJECT_CONFIG_FILE);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      if (this.cache?.file !== file || this.cache.stamp !== 'absent') {
        this.cache = { file, stamp: 'absent', result: absentProjectConfig(file) };
      }
      return this.cache.result;
    }
    const stamp = `${stat.mtimeMs}:${stat.size}`;
    if (this.cache?.file === file && this.cache.stamp === stamp) return this.cache.result;

    let result: ProjectConfigResult;
    try {
      result = parseProjectConfig(fs.readFileSync(file, 'utf-8'), file);
    } catch (err) {
      result = { ...absentProjectConfig(file), present: true, errors: [{ path: '', message: `Cannot read the file: ${(err as Error).message}` }] };
    }
    this.log(`[config] ${PROJECT_CONFIG_FILE} ${result.errors.length ? `${result.errors.length} error(s)` : 'valid'}: ${file}`);
    this.cache = { file, stamp, result };
    return result;
  }
}
