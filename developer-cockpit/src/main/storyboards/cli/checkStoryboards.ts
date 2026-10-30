// check:storyboards — the CI content gate for storyboards (source-spec §13).
//   node dist/main/storyboards/cli/checkStoryboards.js [--strict] [--workspace <dir>]
// Normal mode fails on scan errors, error-severity problems and broken evidence. --strict also fails
// on warnings, drift and unevidenced storyboards. Uses the default configuration plus the
// COCKPIT_STORYBOARDS_* environment overrides, never the developer's own config file.
import * as path from 'path';
import { DEFAULT_CONFIG } from '../../../shared/types/config';
import { resolveStoryboardsConfig } from '../../services/ConfigService';
import { EvidenceService } from '../EvidenceService';
import { LinkIndexService } from '../LinkIndexService';
import { StoryboardService } from '../StoryboardService';

export interface CheckOptions {
  workspace: string;
  strict: boolean;
  env?: NodeJS.ProcessEnv;
  out?: (line: string) => void;
}

export function runCheck({ workspace, strict, env = process.env, out = console.log }: CheckOptions): number {
  const kbPath = path.join(workspace, DEFAULT_CONFIG.knowledgeBase.rootPath);
  const config = resolveStoryboardsConfig(DEFAULT_CONFIG.storyboards, env);
  const linkIndex = new LinkIndexService({ workspaceRoot: workspace, kbPath, openApiPaths: DEFAULT_CONFIG.specs.openApiPaths, avroPaths: DEFAULT_CONFIG.specs.avroPaths });
  const evidence = new EvidenceService({ workspaceRoot: workspace, kbPath });
  const service = new StoryboardService({ workspaceRoot: workspace, kbPath, config, linkIndex, evaluateCard: evidence.evaluator() });

  const scan = service.scan();
  let failed = scan.errors.length > 0;
  out(`check:storyboards${strict ? ' --strict' : ''}: ${scan.catalogue.length} storyboard(s) in ${config.roots.join(', ')}`);

  for (const summary of scan.catalogue) {
    const r = service.detail(summary.id);
    if (!r.ok) {
      out(`${summary.id}  cannot be read: ${r.message}`);
      failed = true;
      continue;
    }
    const d = r.detail;
    const errors = d.problems.filter((p) => p.severity === 'error');
    const warnings = d.problems.filter((p) => p.severity === 'warning');
    const issues = d.evidence?.issues ?? [];
    out(`${d.id}  ${d.status}  trust=${d.trust}  drift=${d.drift}  ${errors.length} error(s), ${warnings.length} warning(s)  [${d.sourcePath}]`);
    for (const p of d.problems) out(`  ${p.severity.padEnd(7)} ${p.code}${p.stepId ? ` (${p.stepId}${p.extensionId ? `/${p.extensionId}` : ''})` : ''}: ${p.message}`);
    for (const i of issues) out(`  evidence ${i.kind}: ${i.message}`);

    if (errors.length || d.brokenEvidence) failed = true;
    if (strict && (warnings.length || !['none', 'current'].includes(d.drift) || d.trust === 'unevidenced')) failed = true;
  }
  for (const e of scan.errors) out(`scan error ${e.code} ${e.path}: ${e.message}`);
  out(failed ? 'check:storyboards FAILED' : 'check:storyboards passed');
  return failed ? 1 : 0;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--workspace');
  const workspace = at >= 0 && argv[at + 1] ? path.resolve(argv[at + 1]) : path.resolve(process.cwd(), '..');
  process.exitCode = runCheck({ workspace, strict: argv.includes('--strict') });
}
