import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { stringify } from 'yaml';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'storyboards');

/** Whether this OS lets the test process create file symlinks (Windows needs Developer Mode). */
export const FILE_SYMLINKS: boolean = (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-symlink-probe-'));
  try {
    fs.writeFileSync(path.join(dir, 'a'), '');
    fs.symlinkSync(path.join(dir, 'a'), path.join(dir, 'b'), 'file');
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();

/** A real SVG exported by Excalidraw 0.18 (embedded scene, inlined data:font). */
export const EXCALIDRAW_SVG = fs.readFileSync(path.join(FIXTURES, 'excalidraw-export.excalidraw.svg'), 'utf8');

/** Markdown with YAML front matter, written the way an author would. */
export function md(frontMatter: Record<string, unknown>, body = ''): string {
  return `---\n${stringify(frontMatter)}---\n${body}`;
}

export const STEP_BODY = '\n## What happens\n\nSomething happens.\n\n## Business rules\n\n- A rule.\n\n## Notes\n\n- A note.\n';

export const EXAMPLE_LANES = [
  { id: 'customer', label: 'Customer', kind: 'actor' },
  { id: 'app', label: 'Mobile App', kind: 'channel' },
  { id: 'oms', label: 'OMS', kind: 'system' },
  { id: 'market', label: 'Market', kind: 'external' },
];

export interface StoryboardWorkspace {
  /** Workspace root (what `general.workspaceRoot` points at). */
  root: string;
  /** `<root>/oms-knowledge-base/storyboards`, the default storyboard root. */
  storyboards: string;
  /** Whether this OS lets the test process create file symlinks (Windows needs Developer Mode). */
  symlinks: boolean;
  /** Writes files relative to the workspace root, creating folders. */
  write(files: Record<string, string | Buffer>): void;
  read(rel: string): string;
  /**
   * Creates `link` (relative to root) pointing at `target` (relative to root). Folder links always
   * work (a junction on Windows, which needs no privilege); returns false when a file symlink is not
   * allowed here.
   */
  symlink(target: string, link: string, type?: 'file' | 'dir'): boolean;
  /** Writes the source-spec example story `buy-gold-mobile` under `<storyboards>/<domain>/<id>`. */
  writeExample(opts?: { id?: string; domain?: string; title?: string; root?: string }): string;
  git(...args: string[]): string;
  cleanup(): void;
}

export function createStoryboardWorkspace(opts: { git?: boolean } = {}): StoryboardWorkspace {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-storyboards-')));
  const storyboards = path.join(root, 'oms-knowledge-base', 'storyboards');
  fs.mkdirSync(storyboards, { recursive: true });

  const write = (files: Record<string, string | Buffer>) => {
    for (const [rel, content] of Object.entries(files)) {
      const file = path.join(root, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
  };

  const git = (...args: string[]): string => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
    return r.stdout.trim();
  };

  const symlinks = FILE_SYMLINKS;

  const ws: StoryboardWorkspace = {
    root,
    storyboards,
    symlinks,
    write,
    read: (rel) => fs.readFileSync(path.join(root, rel), 'utf8'),
    symlink(target, link, type = 'file') {
      fs.mkdirSync(path.dirname(path.join(root, link)), { recursive: true });
      if (type === 'dir') {
        fs.symlinkSync(path.join(root, target), path.join(root, link), process.platform === 'win32' ? 'junction' : 'dir');
        return true;
      }
      if (!symlinks) return false;
      fs.symlinkSync(path.join(root, target), path.join(root, link), 'file');
      return true;
    },
    writeExample({ id = 'buy-gold-mobile', domain = 'precious-metals', title = 'Buy gold via mobile app', root: sbRoot = 'oms-knowledge-base/storyboards' } = {}) {
      const dir = `${sbRoot}/${domain}/${id}`;
      write({
        [`${dir}/story.md`]: md(
          { id, title, domain, status: 'draft', owner: 'analyst-id', tags: ['retail', 'mobile'], lanes: EXAMPLE_LANES, steps: ['request-quote', 'accept-quote', 'route-to-market'] },
          '\n## Summary\n\nThe customer requests and accepts a quote, after which OMS routes the order to market.\n\n## Scope and assumptions\n\n- The customer is onboarded.\n',
        ),
        [`${dir}/steps/request-quote.md`]: md(
          { id: 'request-quote', title: 'Request quote', kind: 'user', from: 'customer', to: 'app', out: [{ name: 'Quote', shape: '{ price, expiry }' }] },
          STEP_BODY,
        ),
        [`${dir}/steps/accept-quote.md`]: md(
          {
            id: 'accept-quote', title: 'Accept quote', kind: 'user', from: 'customer', to: 'app',
            illustrations: [{ src: 'accept-quote.excalidraw.svg', caption: 'Customer taps Buy' }],
            in: [{ name: 'Quote', origin: { kind: 'step', ref: 'request-quote' } }],
            out: [{ name: 'Order', shape: '{ id, side, quantity, price }' }],
          },
          STEP_BODY,
        ),
        [`${dir}/steps/route-to-market.md`]: md(
          {
            id: 'route-to-market', title: 'Route order to market', kind: 'system', from: 'oms', to: 'market',
            links: { api: ['oms-cmd-api#executeCommand'], events: ['OrderMessage'], states: ['NEW -> UNACK'], requirements: ['FR-001'] },
            in: [{ name: 'Order', origin: { kind: 'step', ref: 'accept-quote' } }],
            out: [{ name: 'Market instruction', final: true }],
            extensions: [
              {
                id: 'venue-rejects', when: 'The venue rejects the instruction', then: 'OMS records the rejection and notifies operations.',
                continueAt: { kind: 'end' }, out: [{ name: 'Operations alert', final: true }],
              },
            ],
          },
          STEP_BODY,
        ),
        [`${dir}/assets/accept-quote.excalidraw.svg`]: EXCALIDRAW_SVG,
      });
      return dir;
    },
    git,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };

  if (opts.git) {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'core.autocrlf', 'false');
  }
  return ws;
}

/** Hash of every file under a folder, to prove that a rejected operation changed nothing. */
export function treeSnapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p).replace(/\\/g, '/')] = `${fs.statSync(p).mtimeMs}:${fs.readFileSync(p).toString('base64')}`;
    }
  };
  walk(dir);
  return out;
}
