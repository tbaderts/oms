import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  DRIFT_ORDER,
  type DriftStatus,
  type Evidence,
  type EvidenceIssue,
  type EvidenceRepo,
  type EvidenceSource,
} from '../../shared/types/storyboards';
import type { CardEvaluator } from './StoryboardService';

export interface EvidenceOptions {
  /** The git repository that `evidence.repos[].module` folders live in (this monorepo). */
  workspaceRoot: string;
  kbPath: string;
  gitTimeoutMs?: number;
  log?: Pick<Console, 'warn'>;
}

export function worstDrift(statuses: DriftStatus[], fallback: DriftStatus = 'none'): DriftStatus {
  return statuses.reduce((worst, s) => (DRIFT_ORDER.indexOf(s) > DRIFT_ORDER.indexOf(worst) ? s : worst), fallback);
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);
const posInt = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined);

/**
 * Evaluates `story.card.yaml` during a scan (source-spec §6): trust tier from `verified`, drift per
 * pinned module by comparing the cited lines between the pinned commit and HEAD (committed history
 * only), and whether every `kb_links` target exists. Git results are cached per HEAD.
 */
export class EvidenceService {
  private cache = new Map<string, DriftStatus>();
  private objects = new Map<string, 'yes' | 'no'>();
  private head = '';

  constructor(private readonly opts: EvidenceOptions) {}

  evaluator(): CardEvaluator {
    return (card) => {
      this.refreshHead();
      return this.evaluate(card);
    };
  }

  evaluate(card: Record<string, unknown>): ReturnType<CardEvaluator> {
    const issues: EvidenceIssue[] = [];
    const evidence = obj(card.evidence);

    const repos: EvidenceRepo[] = [];
    const commits = new Map<string, string | null>();
    for (const raw of list(evidence.repos)) {
      const module = text(obj(raw).module);
      const commit = text(obj(raw).commit);
      if (!module || !commit || !/^[\w./-]+$/.test(module) || !/^[0-9a-f]{4,40}$/i.test(commit)) {
        issues.push({ kind: 'malformed-source', message: `evidence.repos entry needs "module" and a hex "commit" (found ${JSON.stringify(raw)}).` });
        continue;
      }
      const known = this.exists(`${commit}^{commit}`);
      if (known !== 'yes') {
        // Only a definite "no" is broken evidence; a git failure or timeout just leaves drift unknown.
        if (known === 'no') issues.push({ kind: 'unknown-commit', message: `Commit ${commit} pinned for ${module} is not in this repository.` });
        commits.set(module, null);
        repos.push({ module, commit, drift: 'unknown' });
        continue;
      }
      if (this.exists(`HEAD:${module}`) === 'no') {
        issues.push({ kind: 'unknown-module', message: `Module folder ${module} does not exist at HEAD.` });
      }
      commits.set(module, commit);
      repos.push({ module, commit, drift: 'current' });
    }

    const sources: EvidenceSource[] = [];
    for (const raw of list(evidence.sources)) {
      const o = obj(raw);
      const module = text(o.module);
      const file = text(o.path);
      if (!module || !file || file.includes('..') || path.isAbsolute(file)) {
        issues.push({ kind: 'malformed-source', message: `evidence.sources entry needs "module" and a relative "path" (found ${JSON.stringify(raw)}).` });
        continue;
      }
      const line = posInt(o.line);
      const endLine = posInt(o.end_line) ?? line;
      const commit = commits.get(module);
      let drift: DriftStatus;
      if (commit === undefined) {
        issues.push({ kind: 'malformed-source', message: `Source ${module}/${file} has no pinned commit for module ${module}.` });
        drift = 'unknown';
      } else if (commit === null) {
        drift = 'unknown';
      } else {
        drift = this.sourceDrift(commit, `${module}/${file}`, line, endLine);
      }
      sources.push({ module, path: file, ...(line && { line }), ...(endLine && { endLine }), ...(text(o.label) && { label: text(o.label) }), drift });
    }
    for (const repo of repos) {
      if (repo.drift === 'unknown') continue;
      repo.drift = worstDrift(sources.filter((s) => s.module === repo.module).map((s) => s.drift), 'current');
    }

    const kbLinks = list(card.kb_links).flatMap((raw) => {
      const link = text(raw);
      if (!link) return [];
      const exists = this.kbDocExists(link);
      if (!exists) issues.push({ kind: 'kb-link-missing', message: `kb_links target ${link} does not exist in the knowledge base.` });
      return [{ path: link, exists }];
    });

    const verified = list(card.verified).flatMap((raw) => {
      const by = text(obj(raw).by);
      const at = text(obj(raw).at) ?? (obj(raw).at instanceof Date ? (obj(raw).at as Date).toISOString() : undefined);
      return by ? [{ by, at: at ?? '' }] : [];
    });

    const result: Evidence = { repos, sources, kbLinks, verified, issues };
    return {
      trust: verified.some((v) => v.by.startsWith('human:')) ? 'human-verified' : 'evidenced',
      drift: repos.length ? worstDrift(repos.map((r) => r.drift)) : 'none',
      brokenEvidence: issues.length > 0,
      evidence: result,
    };
  }

  private kbDocExists(link: string): boolean {
    const rel = link.replace(/^\/+/, '');
    if (!rel || rel.split('/').includes('..')) return false;
    const file = path.join(this.opts.kbPath, rel);
    try {
      const st = fs.lstatSync(file);
      return st.isFile() && !st.isSymbolicLink();
    } catch {
      return false;
    }
  }

  private sourceDrift(commit: string, repoPath: string, line: number | undefined, endLine: number | undefined): DriftStatus {
    const key = `${this.head}|${commit}|${repoPath}|${line ?? ''}-${endLine ?? ''}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    let drift: DriftStatus;
    const atHead = this.exists(`HEAD:${repoPath}`);
    const atCommit = this.exists(`${commit}:${repoPath}`);
    if (atHead === 'error' || atCommit === 'error') {
      drift = 'unknown';
    } else if (atHead === 'no' || atCommit === 'no') {
      drift = 'missing';
    } else {
      const diff = this.git(['diff', '--unified=0', '--no-color', '--no-ext-diff', commit, 'HEAD', '--', repoPath]);
      if (diff === null) drift = 'unknown';
      else if (!diff.trim()) drift = 'current';
      else if (line === undefined || endLine === undefined) drift = 'drifted';
      else drift = hunksTouch(diff, line, endLine) ? 'drifted' : 'current';
    }
    this.cache.set(key, drift);
    return drift;
  }

  private refreshHead(): void {
    const head = this.git(['rev-parse', 'HEAD'])?.trim() ?? '';
    if (head !== this.head) {
      this.head = head;
      this.cache.clear();
      this.objects.clear();
    }
  }

  /**
   * Whether a git object exists: 'yes', 'no' (git answered "missing"), or 'error' (git failed or
   * timed out, which must never be mistaken for a missing commit). Answers are cached per HEAD.
   */
  private exists(object: string): 'yes' | 'no' | 'error' {
    const cached = this.objects.get(object);
    if (cached) return cached;
    const r = spawnSync('git', ['cat-file', '-e', object], { cwd: this.opts.workspaceRoot, timeout: this.timeoutMs, stdio: 'ignore' });
    const answer = r.status === 0 ? 'yes' : r.status === 128 || r.status === 1 ? 'no' : 'error';
    if (answer === 'error') this.opts.log?.warn?.(`[storyboards] git cat-file ${object} failed (${r.error?.message ?? r.signal ?? r.status})`);
    else this.objects.set(object, answer);
    return answer;
  }

  private get timeoutMs(): number {
    return this.opts.gitTimeoutMs ?? 15_000;
  }

  private git(args: string[]): string | null {
    const r = spawnSync('git', args, { cwd: this.opts.workspaceRoot, timeout: this.timeoutMs, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (r.status !== 0) {
      this.opts.log?.warn?.(`[storyboards] git ${args[0]} failed: ${(r.stderr ?? '').trim() || r.error?.message}`);
      return null;
    }
    return r.stdout;
  }
}

/** True when an old-side hunk range of a `--unified=0` diff overlaps [line, endLine]. */
export function hunksTouch(diff: string, line: number, endLine: number): boolean {
  for (const m of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count === 0) {
      // pure insertion after old line `start`: it lands inside the range when start ∈ [line, endLine)
      if (start >= line && start < endLine) return true;
    } else if (start <= endLine && start + count - 1 >= line) {
      return true;
    }
  }
  return false;
}
