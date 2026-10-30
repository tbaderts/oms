#!/usr/bin/env node
// Zero-dependency CLI behind the OMS spec-driven workflow: ticket scaffolding, stage gates,
// approvals, policy checks, verification evidence, CI and the Claude Code hooks.
// See specs/README.md for the process. Run `node specs/tools/spec.mjs help` for usage.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SPECS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.dirname(SPECS);
const CHANGES = path.join(SPECS, 'changes');
const ARCHIVE = path.join(SPECS, 'archive');
const TEMPLATES = path.join(SPECS, 'templates');
const POLICIES_MD = path.join(SPECS, 'policies', 'architecture-policies.md');
const RULES_JSON = path.join(SPECS, 'policies', 'rules.json');
const CONFIG = readJson(path.join(SPECS, 'config.json'));
const CLI = 'node specs/tools/spec.mjs';

const STAGES = ['proposal', 'design', 'plan', 'implement', 'verify', 'done'];
const DOCS = { proposal: 'proposal.md', design: 'design.md', plan: 'tasks.md', verify: 'verification.md' };
const TEMPLATE_FILES = ['ticket.md', 'proposal.md', 'design.md', 'tasks.md', 'verification.md'];
const PLACEHOLDER = /<!--\s*FILL|\{\{[A-Z_]+\}\}/;
const SETTABLE = ['title', 'type', 'modules', 'owner'];
const PROPOSAL_SECTIONS = ['Why', 'What Changes', 'Scope', 'Acceptance Criteria', 'Impact', 'Open Questions'];
const DESIGN_SECTIONS = ['Context', 'Approach', 'Contract Changes', 'Data & Persistence', 'Events & Messaging',
  'Domain, State & Orchestration', 'Alternatives & Decisions', 'Risks & Mitigations', 'Test Strategy',
  'Policy Compliance', 'Knowledge Base Updates'];
const VERIFY_SECTIONS = ['Acceptance Criteria Results', 'Goal Assessment', 'Policy Review', 'Independent Review',
  'Automated Evidence', 'Verdict'];

const NEXT = {
  proposal: 'Fill proposal.md (skill: spec-propose), then `spec advance`.',
  design: 'Fill design.md (skill: spec-design), then `spec advance`.',
  plan: 'Fill tasks.md (skill: spec-plan), then `spec advance`.',
  implement: 'Work through tasks.md (skill: spec-implement), then `spec advance`.',
  verify: 'Run `spec verify`, complete verification.md (skill: spec-verify), then `spec advance`.',
  done: 'Archive with `spec archive` (skill: spec-archive).',
  blocked: 'Blocked. A human resolves the reason and runs `spec unblock`.',
};

// ---------------------------------------------------------------------------------------------
// Utilities

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function readJsonSafe(file) { try { return readJson(file); } catch { return null; } }
function read(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null; }
function today() { return new Date().toISOString().slice(0, 10); }
function now() { return new Date().toISOString().slice(0, 16).replace('T', ' '); }
function nonEmptyLines(s) { return s ? s.split(/\r?\n/).filter(Boolean) : []; }
function unique(xs) { return [...new Set(xs)]; }
function sha(...parts) { const h = crypto.createHash('sha256'); parts.forEach(p => h.update(p)); return h.digest('hex').slice(0, 16); }
function clean(cell) { return (cell || '').replace(/[*`_]/g, '').trim(); }

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function git(args, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.error}`);
  }
  return r.stdout;
}

function gitUser() { return (git(['config', 'user.name'], { allowFail: true }) || '').trim(); }

const globCache = new Map();
function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += '(?:' + glob.slice(i + 1, end).split(',').map(escapeRe).join('|') + ')';
      i = end;
    } else if (c === '[') {
      const end = glob.indexOf(']', i);
      re += glob.slice(i, end + 1);
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp('^' + re + '$');
}
function escapeRe(s) { return s.replace(/[.+^${}()|[\]\\*?]/g, '\\$&'); }
function matchAny(globs, file) {
  return globs.some(g => {
    if (!globCache.has(g)) globCache.set(g, globToRegex(g));
    return globCache.get(g).test(file);
  });
}

function parseArgs(argv) {
  const args = [], opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) opts[key] = argv[++i];
      else opts[key] = true;
    } else args.push(a);
  }
  return { args, opts };
}

// ---------------------------------------------------------------------------------------------
// Frontmatter and markdown

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*?)\s*$/);
    if (kv) meta[kv[1]] = parseValue(kv[2]);
  }
  return { meta, body: text.slice(m[0].length) };
}

function parseValue(v) {
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
  if (v === 'true' || v === 'false') return v === 'true';
  return v;
}

function formatFrontmatter(meta) {
  const body = Object.entries(meta)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : (v ?? '')}`.trimEnd())
    .join('\n');
  return `---\n${body}\n---\n`;
}

function stripComments(s) { return (s || '').replace(/<!--[\s\S]*?-->/g, ''); }

function sections(md) {
  const out = new Map();
  let cur = null;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { cur = h[1]; out.set(cur, []); } else if (cur) out.get(cur).push(line);
  }
  return new Map([...out].map(([k, v]) => [k, v.join('\n')]));
}

function section(md, name) {
  for (const [k, v] of sections(md || '')) if (k.toLowerCase().startsWith(name.toLowerCase())) return v;
  return null;
}

function tableRows(text, keyRe) {
  return (text || '').split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.startsWith('|'))
    .map(l => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()))
    .filter(cells => keyRe.test(clean(cells[0])));
}

/** Splits text into blocks that each start at a line matching `re`; headings end a block. */
function blocks(text, re) {
  const out = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(re);
    if (m) { cur = [m[1], line]; out.push(cur); } else if (/^#/.test(line)) cur = null;
    else if (cur) cur[1] += '\n' + line;
  }
  return out;
}

function placeholderLines(md) {
  return md.split(/\r?\n/).map((l, i) => (PLACEHOLDER.test(l) ? i + 1 : 0)).filter(Boolean);
}

// ---------------------------------------------------------------------------------------------
// Tickets

function ticketDirs(includeArchive) {
  return (includeArchive ? [CHANGES, ARCHIVE] : [CHANGES])
    .filter(d => fs.existsSync(d))
    .flatMap(d => fs.readdirSync(d).filter(n => /^SPEC-\d{4}/.test(n)).map(n => path.join(d, n)));
}

function loadTicket(dir) {
  const file = path.join(dir, 'ticket.md');
  const { meta, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(meta.modules)) meta.modules = meta.modules ? [meta.modules] : [];
  if (!Array.isArray(meta.approvals)) meta.approvals = meta.approvals ? [meta.approvals] : [];
  return { dir, file, meta, body, id: meta.id, archived: path.dirname(dir) === ARCHIVE };
}

/** loadTicket that reports a broken folder instead of throwing, so one bad folder cannot break the rest. */
function tryLoadTicket(dir) {
  if (!fs.existsSync(path.join(dir, 'ticket.md'))) return { error: 'ticket.md is missing' };
  try {
    const t = loadTicket(dir);
    return t.id ? { ticket: t } : { error: 'ticket.md has no front-matter or no id' };
  } catch (e) {
    return { error: e.message };
  }
}

function relDir(dir) { return path.relative(ROOT, dir).replace(/\\/g, '/'); }

function ticketJson(t) {
  const tasks = parseTasks(doc(t, 'plan'));
  return {
    id: t.id,
    dir: relDir(t.dir),
    archived: t.archived,
    meta: t.meta,
    tasks: { done: tasks.filter(x => x.done).length, total: tasks.length },
    acs: acceptanceCriteria(t),
  };
}

function saveTicket(t) { fs.writeFileSync(t.file, formatFrontmatter(t.meta) + t.body); }
function logTo(t, msg) { t.body = t.body.replace(/\s*$/, '\n') + `- ${now()} — ${msg}\n`; }
function activeTickets() { return ticketDirs(false).map(tryLoadTicket).filter(r => r.ticket).map(r => r.ticket); }
// `gate --draft <file>`: that document's content comes from stdin instead of disk; nothing is written.
let DRAFT = null;
function doc(t, stage) {
  if (DRAFT && DOCS[stage] === DRAFT.file) return DRAFT.content;
  return read(path.join(t.dir, DOCS[stage]));
}

function resolveTicket(ref, { includeArchive = false } = {}) {
  const all = ticketDirs(includeArchive).map(tryLoadTicket).filter(r => r.ticket).map(r => r.ticket);
  if (!ref) {
    const active = all.filter(t => !t.archived && t.meta.status !== 'done');
    if (active.length === 1) return active[0];
    fail(active.length ? `Several active tickets, name one: ${active.map(t => t.id).join(', ')}` : 'No active ticket.');
  }
  const num = String(ref).match(/^(?:SPEC-)?(\d+)$/i);
  const hits = num
    ? all.filter(t => parseInt(t.id.slice(5), 10) === parseInt(num[1], 10))
    : all.filter(t => path.basename(t.dir).toLowerCase().includes(String(ref).toLowerCase()));
  if (hits.length !== 1) fail(hits.length ? `"${ref}" matches several tickets: ${hits.map(t => t.id).join(', ')}` : `No ticket matches "${ref}".`);
  return hits[0];
}

function acceptanceCriteria(t) {
  const ac = stripComments(section(doc(t, 'proposal'), 'Acceptance Criteria'));
  return [...ac.matchAll(/\*\*(AC-\d+)\*\*/g)].map(m => m[1]);
}

function policies() {
  return [...fs.readFileSync(POLICIES_MD, 'utf8').matchAll(/^###\s+(P-\d+)\s+[—–-]\s+(.+?)\s*$/gm)]
    .map(m => ({ id: m[1], title: m[2] }));
}

function parseTasks(md) {
  return blocks(stripComments(md || ''), /^\s*-\s*\[[ xX]\]\s*\*\*(T-\d+)\*\*/).map(([id, text]) => ({
    id,
    text,
    done: /^\s*-\s*\[[xX]\]/.test(text),
    acs: unique(text.match(/AC-\d+/g) || []),
  }));
}

function designPolicyRows(t) {
  return new Map(tableRows(section(stripComments(doc(t, 'design')), 'Policy Compliance'), /^P-\d+$/)
    .map(c => [clean(c[0]), c]));
}

function designExceptions(t) {
  return [...designPolicyRows(t)].filter(([, c]) => clean(c[2]).toLowerCase() === 'exception').map(([id]) => id);
}

function verifyModules(t) {
  return unique(t.meta.modules.flatMap(m => [m, ...(CONFIG.modules[m]?.impacts || [])]));
}

function unknownModules(mods) { return mods.filter(m => !CONFIG.modules[m]); }

/** Content hash of every tracked or untracked (non-ignored) file in the given modules.
 *  Independent of commits and line endings, so evidence stays valid across `git commit`. */
function fingerprint(mods) {
  const files = nonEmptyLines(git(['ls-files', '-co', '--exclude-standard', '--', ...mods])).sort();
  const h = crypto.createHash('sha256');
  for (const f of unique(files)) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
    h.update(f + '\0');
    h.update(fs.readFileSync(p).toString('latin1').replace(/\r/g, ''));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------------------------
// Gates

function checkDoc(r, t, stage, required) {
  const md = doc(t, stage);
  if (md == null) { r.errors.push(`${DOCS[stage]} is missing`); return null; }
  const ph = placeholderLines(md);
  if (ph.length) r.errors.push(`${DOCS[stage]}: template placeholders left on line(s) ${ph.slice(0, 8).join(', ')}${ph.length > 8 ? ', …' : ''}`);
  for (const name of required) {
    const s = section(md, name);
    if (s == null) r.errors.push(`${DOCS[stage]}: section "## ${name}" is missing`);
    else if (!stripComments(s).trim()) r.errors.push(`${DOCS[stage]}: section "## ${name}" is empty`);
  }
  return md;
}

function dupes(xs) { return unique(xs.filter((x, i) => xs.indexOf(x) !== i)); }

const GATES = {
  proposal(t, r) {
    const goal = section(t.body, 'Goal');
    if (!goal || PLACEHOLDER.test(goal) || !stripComments(goal).trim()) {
      r.errors.push('ticket.md: the Goal is empty. The requester states it; the agent cannot invent it.');
    }
    const md = checkDoc(r, t, 'proposal', PROPOSAL_SECTIONS);
    if (!md) return;
    const ids = acceptanceCriteria(t);
    if (!ids.length) r.errors.push('proposal.md: no acceptance criteria (format: - **AC-1** — Given …, when …, then …)');
    dupes(ids).forEach(id => r.errors.push(`proposal.md: ${id} is defined more than once`));
    for (const [id, text] of blocks(stripComments(section(md, 'Acceptance Criteria')), /\*\*(AC-\d+)\*\*/)) {
      if (!(/\bgiven\b/i.test(text) && /\bwhen\b/i.test(text) && /\bthen\b/i.test(text))) {
        r.warnings.push(`${id} is not in Given/When/Then form; make sure it is objectively testable`);
      }
    }
    for (const q of stripComments(section(md, 'Open Questions')).match(/^\s*[-*]\s*\[open\].*$/gim) || []) {
      r.errors.push(`proposal.md: unresolved question: ${q.trim()}`);
    }
    if (!t.meta.modules.length) r.errors.push(`ticket has no modules: run \`${CLI} set ${t.id} modules oms-core,…\``);
    unknownModules(t.meta.modules).forEach(m => r.errors.push(`unknown module "${m}" (see specs/config.json)`));
  },

  design(t, r) {
    const md = checkDoc(r, t, 'design', DESIGN_SECTIONS);
    if (!md) return;
    const testStrategy = stripComments(section(md, 'Test Strategy'));
    for (const id of acceptanceCriteria(t)) {
      if (!new RegExp(`\\b${id}\\b`).test(testStrategy)) r.errors.push(`design.md: ${id} has no entry in Test Strategy`);
    }
    const rows = designPolicyRows(t);
    for (const p of policies()) {
      const row = rows.get(p.id);
      if (!row) { r.errors.push(`design.md: Policy Compliance has no row for ${p.id} (${p.title})`); continue; }
      const status = clean(row[2]).toLowerCase();
      const note = clean(row[3]);
      if (!['comply', 'n/a', 'exception'].includes(status)) {
        r.errors.push(`design.md: ${p.id} status must be comply, n/a or exception (found "${clean(row[2])}")`);
      } else if (status !== 'comply' && !note) {
        r.errors.push(`design.md: ${p.id} is ${status} without a justification`);
      }
      if (status === 'exception') r.exceptions.push(p.id);
    }
    if (r.exceptions.length) r.warnings.push(`policy exceptions declared (${r.exceptions.join(', ')}): human approval required`);
  },

  plan(t, r) {
    const md = checkDoc(r, t, 'plan', ['Tasks']);
    if (!md) return;
    const tasks = parseTasks(md);
    if (!tasks.length) r.errors.push('tasks.md: no tasks (format: - [ ] **T-1** summary (AC-1))');
    dupes(tasks.map(x => x.id)).forEach(id => r.errors.push(`tasks.md: ${id} is defined more than once`));
    for (const task of tasks) {
      if (!/^\s*-\s*verify:/im.test(task.text)) r.errors.push(`tasks.md: ${task.id} has no "verify:" line`);
      if (!task.acs.length) r.warnings.push(`${task.id} traces to no acceptance criterion`);
    }
    const covered = new Set(tasks.flatMap(x => x.acs));
    for (const id of acceptanceCriteria(t)) if (!covered.has(id)) r.errors.push(`tasks.md: no task covers ${id}`);
  },

  implement(t, r, opts) {
    const tasks = parseTasks(doc(t, 'plan'));
    if (!tasks.length) r.errors.push('tasks.md has no tasks');
    tasks.filter(x => !x.done).forEach(x => r.errors.push(`tasks.md: ${x.id} is not done`));
    if (opts.skipPolicy) return;
    const pc = policyCheck({});
    pc.errors.forEach(e => r.errors.push(`policy ${e}`));
    pc.warnings.forEach(w => r.warnings.push(`policy ${w}`));
  },

  verify(t, r, opts) {
    const md = checkDoc(r, t, 'verify', VERIFY_SECTIONS);
    if (!md) return;
    const body = stripComments(md);
    const acRows = new Map(tableRows(section(body, 'Acceptance Criteria Results'), /AC-\d+/)
      .map(c => [clean(c[0]).match(/AC-\d+/)[0], c]));
    for (const id of acceptanceCriteria(t)) {
      const row = acRows.get(id);
      if (!row) { r.errors.push(`verification.md: no result row for ${id}`); continue; }
      const result = clean(row[row.length - 1]).toUpperCase();
      if (result !== 'PASS') r.errors.push(`verification.md: ${id} is ${result || 'not assessed'}`);
      if (row.length < 3 || !clean(row[2])) r.errors.push(`verification.md: ${id} has no evidence`);
    }
    const declared = new Set(designExceptions(t));
    const pRows = new Map(tableRows(section(body, 'Policy Review'), /^P-\d+$/).map(c => [clean(c[0]), c]));
    for (const p of policies()) {
      const row = pRows.get(p.id);
      if (!row) { r.errors.push(`verification.md: Policy Review has no row for ${p.id}`); continue; }
      const result = clean(row[2]).toUpperCase();
      if (!['PASS', 'N/A', 'EXCEPTION'].includes(result)) r.errors.push(`verification.md: ${p.id} result must be PASS, N/A or EXCEPTION (found "${clean(row[2])}")`);
      else if (result !== 'PASS' && !clean(row[3])) r.errors.push(`verification.md: ${p.id} is ${result} without notes`);
      if (result === 'EXCEPTION' && !declared.has(p.id)) r.errors.push(`verification.md: ${p.id} exception was not declared and approved in the design`);
    }
    const verdict = (section(body, 'Verdict') || '').match(/Verdict:\s*\**\s*(GOAL\s+(?:NOT\s+)?MET)/i);
    if (!verdict) r.errors.push('verification.md: missing "Verdict: GOAL MET"');
    else if (/NOT/i.test(verdict[1])) r.errors.push('verification.md: verdict is GOAL NOT MET');
    const ev = readJsonSafe(path.join(t.dir, 'evidence', 'last-run.json'));
    if (!ev) r.errors.push(`no automated evidence: run \`${CLI} verify ${t.id}\``);
    else {
      if (ev.result !== 'pass') r.errors.push(`latest \`spec verify\` failed (${ev.ranAt})`);
      const missing = verifyModules(t).filter(m => !(ev.modules || []).includes(m));
      if (missing.length) r.errors.push(`evidence does not cover module(s) ${missing.join(', ')}: re-run \`spec verify\``);
      else if (opts.freshness !== false && ev.fingerprint !== fingerprint(ev.modules)) {
        r.errors.push('evidence is stale: code changed after the last `spec verify`; re-run it');
      }
    }
  },
};

function runGate(t, stage, opts = {}) {
  const r = { errors: [], warnings: [], exceptions: [] };
  if (GATES[stage]) GATES[stage](t, r, opts);
  return r;
}

function printGate(t, stage, r) {
  console.log(`${t.id} gate "${stage}": ${r.errors.length ? 'FAIL' : 'PASS'}`);
  r.errors.forEach(e => console.log(`  ERROR ${e}`));
  r.warnings.forEach(w => console.log(`  WARN  ${w}`));
}

function approvalRequired(stage, r) {
  return CONFIG.approvals?.[stage] === true || (stage === 'design' && r.exceptions.length > 0);
}

// ---------------------------------------------------------------------------------------------
// Policy check

function changedFiles(base) {
  const out = new Map();
  for (const l of nonEmptyLines(git(['-c', 'core.quotepath=off', 'diff', '--name-status', '-M', base]))) {
    const parts = l.split('\t');
    const p = parts[parts.length - 1];
    out.set(p, { path: p, status: parts[0][0] });
  }
  for (const p of nonEmptyLines(git(['-c', 'core.quotepath=off', 'ls-files', '--others', '--exclude-standard']))) {
    out.set(p, { path: p, status: '?' });
  }
  return [...out.values()];
}

function addedLines(base, f) {
  if (!base || f.status === '?' || f.status === 'A') {
    const txt = read(path.join(ROOT, f.path));
    return txt == null ? [] : txt.split(/\r?\n/).map((l, i) => [i + 1, l]);
  }
  const out = [];
  let n = 0;
  for (const l of (git(['diff', '-U0', base, '--', f.path], { allowFail: true }) || '').split(/\r?\n/)) {
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) { n = Number(h[1]); continue; }
    if (l.startsWith('+') && !l.startsWith('+++')) out.push([n++, l.slice(1)]);
  }
  return out;
}

function policyCheck({ base = CONFIG.baseBranch, all = false }) {
  const rules = readJson(RULES_JSON).rules;
  const res = { errors: [], warnings: [], scope: '' };
  let files, mb = null;
  if (all) {
    files = nonEmptyLines(git(['-c', 'core.quotepath=off', 'ls-files', '-co', '--exclude-standard'])).map(p => ({ path: p, status: 'A' }));
    res.scope = 'all files';
  } else {
    mb = (git(['merge-base', base, 'HEAD'], { allowFail: true }) || '').trim() || base;
    files = changedFiles(mb);
    res.scope = `changes since ${base} (merge-base ${mb.slice(0, 8)})`;
  }
  files = files.filter(f => !f.path.startsWith('specs/'));
  const present = files.filter(f => f.status !== 'D');
  const cache = new Map();
  const added = f => { if (!cache.has(f.path)) cache.set(f.path, addedLines(mb, f)); return cache.get(f.path); };

  for (const rule of rules) {
    const inScope = f => matchAny(rule.paths || [], f.path) && !matchAny(rule.allow || [], f.path);
    const sink = rule.severity === 'warn' ? res.warnings : res.errors;
    const report = (where, detail = '') => sink.push(`[${rule.id} ${rule.policy}] ${where}: ${rule.message}${detail}`);
    switch (rule.type) {
      case 'forbid-path':
        present.filter(inScope).forEach(f => report(f.path));
        break;
      case 'forbid-pattern': {
        const re = new RegExp(rule.pattern, rule.flags || '');
        for (const f of present.filter(inScope)) {
          for (const [n, text] of added(f)) if (re.test(text)) report(`${f.path}:${n}`, ` → ${text.trim().slice(0, 120)}`);
        }
        break;
      }
      case 'immutable':
        if (!all) files.filter(f => 'MDR'.includes(f.status) && inScope(f)).forEach(f => report(f.path));
        break;
      case 'warn-on-change':
        if (!all) files.filter(inScope).forEach(f => report(f.path));
        break;
      case 'require-change':
        if (!all) {
          for (const m of unique(present.filter(inScope).map(f => f.path.split('/')[0]))) {
            const want = (rule.then || []).map(g => g.replaceAll('{module}', m));
            if (!files.some(f => matchAny(want, f.path))) report(m);
          }
        }
        break;
      default:
        res.errors.push(`unknown rule type "${rule.type}" in ${rule.id}`);
    }
  }
  return res;
}

function printPolicy(pc) {
  console.log(`Policy check (${pc.scope}): ${pc.errors.length ? 'FAIL' : 'PASS'}`);
  pc.errors.forEach(e => console.log(`  ERROR ${e}`));
  pc.warnings.forEach(w => console.log(`  WARN  ${w}`));
}

// ---------------------------------------------------------------------------------------------
// Commands

function cmdNew(args, opts) {
  const title = args.join(' ').trim();
  if (!title) fail(`usage: ${CLI} new "<title>" [--type feature] [--goal "<goal>"] [--modules a,b] [--slug s]`);
  const type = opts.type || 'feature';
  if (!CONFIG.types.includes(type)) fail(`type must be one of ${CONFIG.types.join(', ')}`);
  const modules = typeof opts.modules === 'string' ? opts.modules.split(',').map(s => s.trim()).filter(Boolean) : [];
  if (unknownModules(modules).length) fail(`unknown module(s) ${unknownModules(modules).join(', ')}; see specs/config.json`);

  const max = Math.max(0, ...ticketDirs(true).map(d => parseInt(path.basename(d).slice(5, 9), 10)));
  const id = `SPEC-${String(max + 1).padStart(4, '0')}`;
  const slug = String(opts.slug || title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  const dir = path.join(CHANGES, `${id}-${slug}`);
  const ps = policies();
  const vars = {
    ID: id,
    TITLE: title.replace(/\r?\n/g, ' '),
    TYPE: type,
    DATE: today(),
    MODULES: modules.join(', '),
    OWNER: opts.owner || gitUser(),
    GOAL: typeof opts.goal === 'string' && opts.goal.trim()
      ? opts.goal.trim()
      : '<!-- FILL (requester): what you want achieved and how you will judge that it is done. -->',
    POLICY_ROWS: ps.map(p => `| ${p.id} | ${p.title} | <!-- FILL --> | |`).join('\n'),
    POLICY_REVIEW_ROWS: ps.map(p => `| ${p.id} | ${p.title} | <!-- FILL --> | |`).join('\n'),
  };
  fs.mkdirSync(dir, { recursive: true });
  for (const f of TEMPLATE_FILES) {
    const text = fs.readFileSync(path.join(TEMPLATES, f), 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => vars[k] ?? m);
    fs.writeFileSync(path.join(dir, f), text);
  }
  console.log(`Created ${id} in ${path.relative(ROOT, dir).replace(/\\/g, '/')}`);
  console.log(`Next: ${NEXT.proposal}`);
}

function progress(t) {
  const tasks = parseTasks(doc(t, 'plan'));
  return tasks.length ? `${tasks.filter(x => x.done).length}/${tasks.length}` : '-';
}

function cmdList(opts) {
  if (opts.json) {
    const tickets = [], errors = [];
    for (const dir of ticketDirs(Boolean(opts.all))) {
      const r = tryLoadTicket(dir);
      if (r.ticket) tickets.push(ticketJson(r.ticket));
      else errors.push({ dir: relDir(dir), error: r.error });
    }
    return console.log(JSON.stringify({ user: gitUser(), types: CONFIG.types, tickets, errors }));
  }
  const ts = [];
  for (const dir of ticketDirs(Boolean(opts.all))) {
    const r = tryLoadTicket(dir);
    if (r.ticket) ts.push(r.ticket);
    else console.error(`${relDir(dir)}: ${r.error}`);
  }
  if (!ts.length) return console.log('No tickets.');
  const rows = ts.map(t => [t.id, t.archived ? 'archived' : t.meta.status + (t.meta.awaiting ? ' (awaiting approval)' : ''),
    t.meta.autopilot ? 'auto' : '', progress(t), t.meta.title]);
  const w = [0, 1, 2, 3].map(i => Math.max(...rows.map(r => r[i].length)));
  rows.forEach(r => console.log(r.map((c, i) => (i < 4 ? c.padEnd(w[i]) : c)).join('  ')));
}

function gateJson(stage, r) {
  return { stage, pass: !r.errors.length, errors: r.errors, warnings: r.warnings, exceptions: r.exceptions };
}

function nextStep(t) {
  return t.meta.awaiting
    ? `waiting for a human to run \`${CLI} approve ${t.id}\` in their own terminal.`
    : NEXT[t.meta.status];
}

function statusJson(t) {
  const ev = readJsonSafe(path.join(t.dir, 'evidence', 'last-run.json'));
  const evModules = ev ? ev.modules || [] : [];
  return {
    ...ticketJson(t),
    goal: stripComments(section(t.body, 'Goal')).trim(),
    log: nonEmptyLines(section(t.body, 'Log')).filter(l => l.startsWith('- ')).map(l => l.slice(2)),
    taskList: parseTasks(doc(t, 'plan')).map(x => ({
      id: x.id,
      done: x.done,
      acs: x.acs,
      summary: x.text.split(/\r?\n/)[0].replace(/^\s*-\s*\[[ xX]\]\s*\*\*T-\d+\*\*\s*/, '').trim(),
    })),
    gate: GATES[t.meta.status] ? gateJson(t.meta.status, runGate(t, t.meta.status)) : null,
    evidence: ev && {
      result: ev.result,
      ranAt: ev.ranAt,
      modules: evModules,
      fresh: ev.fingerprint === fingerprint(evModules),
      coversModules: verifyModules(t).every(m => evModules.includes(m)),
    },
    next: nextStep(t),
  };
}

function cmdStatus(t, opts = {}) {
  if (opts.json) return console.log(JSON.stringify(statusJson(t)));
  const m = t.meta;
  console.log(`${t.id} — ${m.title}`);
  console.log(`  dir:       ${path.relative(ROOT, t.dir).replace(/\\/g, '/')}`);
  console.log(`  status:    ${m.status}${m.awaiting ? ` (awaiting human approval of ${m.awaiting})` : ''}${m.status === 'blocked' ? ` — ${m.blocked_reason}` : ''}`);
  console.log(`  autopilot: ${m.autopilot ? 'on' : 'off'}`);
  console.log(`  modules:   ${m.modules.join(', ') || '(none)'}${verifyModules(t).length > m.modules.length ? `  → verified with ${verifyModules(t).join(', ')}` : ''}`);
  console.log(`  approvals: ${m.approvals.join(', ') || '(none)'}`);
  console.log(`  tasks:     ${progress(t)}`);
  if (GATES[m.status]) { console.log(''); printGate(t, m.status, runGate(t, m.status)); }
  console.log(`\nNext: ${nextStep(t)}`);
}

async function cmdGate(t, stage, opts = {}) {
  stage = stage || t.meta.status;
  if (!GATES[stage]) fail(`no gate for stage "${stage}"; gates: ${Object.keys(GATES).join(', ')}`);
  if (opts.draft !== undefined) {
    const files = Object.values(DOCS);
    if (!files.includes(opts.draft)) fail(`--draft must be one of ${files.join(', ')}`);
    DRAFT = { file: opts.draft, content: await stdinText() };
  }
  const r = runGate(t, stage);
  if (opts.json) console.log(JSON.stringify(gateJson(stage, r)));
  else printGate(t, stage, r);
  process.exit(r.errors.length ? 1 : 0);
}

function cmdAdvance(t) {
  const stage = t.meta.status;
  if (stage === 'blocked') fail(`${t.id} is blocked: ${t.meta.blocked_reason}`);
  if (stage === 'done') fail(`${t.id} is done; archive it with \`${CLI} archive ${t.id}\``);
  const r = runGate(t, stage);
  printGate(t, stage, r);
  if (r.errors.length) process.exit(1);
  if (approvalRequired(stage, r) && !t.meta.approvals.includes(stage)) {
    if (t.meta.awaiting !== stage) {
      t.meta.awaiting = stage;
      logTo(t, `${stage} gate passed; awaiting human approval${r.exceptions.length ? ` (policy exceptions: ${r.exceptions.join(', ')})` : ''}`);
      saveTicket(t);
    }
    console.log(`\n${t.id}: ${stage} needs human approval. The requester reviews it and runs: ${CLI} approve ${t.id}`);
    process.exit(3);
  }
  const next = STAGES[STAGES.indexOf(stage) + 1];
  t.meta.status = next;
  t.meta.awaiting = '';
  logTo(t, `${stage} → ${next}`);
  saveTicket(t);
  console.log(`\n${t.id}: ${stage} → ${next}. Next: ${NEXT[next]}`);
}

function cmdApprove(t, stage, opts) {
  stage = stage || t.meta.awaiting || t.meta.status;
  if (!GATES[stage]) fail(`cannot approve stage "${stage}"`);
  if (!t.meta.approvals.includes(stage)) t.meta.approvals.push(stage);
  if (t.meta.awaiting === stage) t.meta.awaiting = '';
  logTo(t, `${stage} approved by ${opts.by || gitUser() || 'unknown'}`);
  saveTicket(t);
  console.log(`${t.id}: ${stage} approved.`);
  if (t.meta.status === stage) cmdAdvance(loadTicket(t.dir));
}

function cmdReopen(t, stage, reason) {
  const from = t.meta.status === 'blocked' ? t.meta.blocked_from : t.meta.status;
  if (!STAGES.includes(stage) || STAGES.indexOf(stage) >= STAGES.indexOf(from)) fail('reopen moves a ticket back to an earlier stage');
  if (!reason) fail(`usage: ${CLI} reopen <id> <stage> "<reason>"`);
  const idx = STAGES.indexOf(stage);
  t.meta.approvals = t.meta.approvals.filter(s => STAGES.indexOf(s) < idx);
  Object.assign(t.meta, { status: stage, awaiting: '', blocked_from: '', blocked_reason: '' });
  logTo(t, `reopened at ${stage}: ${reason}`);
  saveTicket(t);
  console.log(`${t.id}: back to ${stage}. Approvals from ${stage} on were cleared.`);
}

function cmdBlock(t, reason) {
  if (!reason) fail(`usage: ${CLI} block <id> "<reason>"`);
  if (t.meta.status === 'blocked') fail(`${t.id} is already blocked`);
  Object.assign(t.meta, { blocked_from: t.meta.status, status: 'blocked', blocked_reason: reason.replace(/\r?\n/g, ' ') });
  logTo(t, `blocked: ${reason}`);
  saveTicket(t);
  console.log(`${t.id} blocked. A human resolves it and runs \`${CLI} unblock ${t.id}\`.`);
}

function cmdUnblock(t) {
  if (t.meta.status !== 'blocked') fail(`${t.id} is not blocked`);
  Object.assign(t.meta, { status: t.meta.blocked_from || 'proposal', blocked_from: '', blocked_reason: '' });
  logTo(t, `unblocked → ${t.meta.status}`);
  saveTicket(t);
  console.log(`${t.id} unblocked, back at ${t.meta.status}.`);
}

function cmdAutopilot(t, mode) {
  if (!['on', 'off'].includes(mode)) fail(`usage: ${CLI} autopilot <id> on|off`);
  t.meta.autopilot = mode === 'on';
  fs.rmSync(path.join(t.dir, '.autopilot.json'), { force: true });
  logTo(t, `autopilot ${mode}`);
  saveTicket(t);
  console.log(`${t.id}: autopilot ${mode}.`);
}

function cmdSet(t, key, value) {
  if (!SETTABLE.includes(key)) fail(`settable keys: ${SETTABLE.join(', ')}`);
  if (value == null) fail(`usage: ${CLI} set <id> ${key} <value>`);
  if (key === 'modules') {
    const mods = value.split(',').map(s => s.trim()).filter(Boolean);
    if (unknownModules(mods).length) fail(`unknown module(s) ${unknownModules(mods).join(', ')}; see specs/config.json`);
    t.meta.modules = mods;
  } else if (key === 'type' && !CONFIG.types.includes(value)) fail(`type must be one of ${CONFIG.types.join(', ')}`);
  else t.meta[key] = value.replace(/\r?\n/g, ' ');
  logTo(t, `set ${key} = ${Array.isArray(t.meta[key]) ? t.meta[key].join(', ') : t.meta[key]}`);
  saveTicket(t);
  console.log(`${t.id}: ${key} updated.`);
}

function cmdNote(t, text) {
  if (!text) fail(`usage: ${CLI} note <id> "<text>"`);
  logTo(t, text.replace(/\r?\n/g, ' '));
  saveTicket(t);
}

function cmdCheck(opts) {
  const pc = policyCheck({ base: opts.base || CONFIG.baseBranch, all: Boolean(opts.all) });
  printPolicy(pc);
  process.exit(pc.errors.length ? 1 : 0);
}

function cmdVerify(t, opts) {
  const mods = verifyModules(t);
  if (!mods.length) fail(`${t.id} has no modules`);
  const evDir = path.join(t.dir, 'evidence');
  fs.mkdirSync(evDir, { recursive: true });
  const policy = policyCheck({ base: opts.base || CONFIG.baseBranch });
  printPolicy(policy);
  const commands = [];
  for (const m of mods) {
    const mc = CONFIG.modules[m];
    const cwd = path.join(ROOT, mc.cwd || m);
    (mc.verify || []).forEach((cmd, i) => {
      const shellCmd = process.platform === 'win32' ? cmd.replace(/^\.\/gradlew\b/, '.\\gradlew.bat') : cmd;
      const logFile = path.join(evDir, `${m}-${i + 1}.log`);
      console.log(`\n[${m}] ${shellCmd}`);
      const fd = fs.openSync(logFile, 'w');
      fs.writeSync(fd, `$ ${shellCmd}\n# cwd: ${path.relative(ROOT, cwd).replace(/\\/g, '/')}\n# started: ${new Date().toISOString()}\n\n`);
      const start = Date.now();
      const r = spawnSync(shellCmd, { cwd, shell: true, stdio: ['ignore', fd, fd] });
      fs.closeSync(fd);
      const exitCode = r.status ?? 1;
      const seconds = Math.round((Date.now() - start) / 1000);
      commands.push({ module: m, command: cmd, exitCode, seconds, log: path.relative(t.dir, logFile).replace(/\\/g, '/') });
      console.log(`  exit ${exitCode} after ${seconds}s, log: ${path.relative(ROOT, logFile).replace(/\\/g, '/')}`);
      if (exitCode !== 0) {
        const tail = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).slice(-40).join('\n');
        console.log(tail.replace(/^/gm, '  | '));
      }
    });
  }
  const result = !policy.errors.length && commands.every(c => c.exitCode === 0) ? 'pass' : 'fail';
  const evidence = { ranAt: new Date().toISOString(), result, modules: mods, fingerprint: fingerprint(mods), policy, commands };
  fs.writeFileSync(path.join(evDir, 'last-run.json'), JSON.stringify(evidence, null, 2) + '\n');
  const fresh = loadTicket(t.dir);
  logTo(fresh, `verify run: ${result}`);
  saveTicket(fresh);
  console.log(`\nverify: ${result.toUpperCase()} (evidence/last-run.json)`);
  process.exit(result === 'pass' ? 0 : 1);
}

function cmdArchive(t) {
  if (t.meta.status !== 'done') fail(`${t.id} is at ${t.meta.status}; only done tickets can be archived`);
  const evDir = path.join(t.dir, 'evidence');
  if (fs.existsSync(evDir)) fs.readdirSync(evDir).filter(f => f.endsWith('.log')).forEach(f => fs.rmSync(path.join(evDir, f)));
  fs.rmSync(path.join(t.dir, '.autopilot.json'), { force: true });
  t.meta.autopilot = false;
  logTo(t, 'archived');
  saveTicket(t);
  fs.mkdirSync(ARCHIVE, { recursive: true });
  const target = path.join(ARCHIVE, path.basename(t.dir));
  fs.renameSync(t.dir, target);
  console.log(`${t.id} archived to ${path.relative(ROOT, target).replace(/\\/g, '/')}`);
}

function cmdCi(opts) {
  let failed = false;
  const pc = policyCheck({ base: opts.base || CONFIG.baseBranch });
  printPolicy(pc);
  failed ||= pc.errors.length > 0;
  for (const t of activeTickets()) {
    const reached = t.meta.status === 'blocked' ? t.meta.blocked_from : t.meta.status;
    const passed = STAGES.slice(0, STAGES.indexOf(reached)).filter(s => GATES[s]);
    for (const s of passed) {
      const r = runGate(t, s, { skipPolicy: true, freshness: false });
      if (r.errors.length) { printGate(t, s, r); failed = true; }
    }
    console.log(`${t.id} (${t.meta.status}): ${passed.length} passed gate(s) re-checked`);
  }
  process.exit(failed ? 1 : 0);
}

// ---------------------------------------------------------------------------------------------
// Claude Code hooks

async function stdinText() {
  if (process.stdin.isTTY) return '';
  let s = '';
  for await (const chunk of process.stdin) s += chunk;
  return s;
}

async function stdinJson() {
  const s = await stdinText();
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

function deny(msg) {
  process.stderr.write(msg + '\n');
  process.exit(2);
}

async function hookPreTool() {
  const input = await stdinJson();
  const ti = input.tool_input || {};
  const autopilot = activeTickets().filter(t => t.meta.autopilot && !['done', 'blocked'].includes(t.meta.status));

  if (typeof ti.command === 'string') {
    if (/spec\.mjs["']?\s+approve\b/.test(ti.command)) {
      deny('Approvals are a human gate. Do not run `spec approve`; ask the requester to review and run it in their own terminal.');
    }
    return;
  }
  const fp = ti.file_path || ti.notebook_path;
  if (!fp) return;
  const rel = path.relative(ROOT, path.resolve(ROOT, fp)).replace(/\\/g, '/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) return;

  if (/(^|\/)build\/generated[^/]*\//.test(rel)) {
    deny(`[P-03] ${rel} is generated. Change the contract in oms-contracts/src/main/{openapi,avro} (or the generator config) and regenerate.`);
  }
  if (/^[^/]+\/src\/main\/(openapi|avro)\//.test(rel) && !rel.startsWith('oms-contracts/')) {
    deny(`[P-01] Contracts live only in oms-contracts. Edit oms-contracts/src/main/... instead of ${rel}.`);
  }
  if (/^specs\/(changes|archive)\/[^/]+\/ticket\.md$/.test(rel)) {
    deny(`ticket.md belongs to the requester and the spec CLI. Use \`${CLI} set|note|block|reopen …\` to change ticket state.`);
  }
  if (/^specs\/(changes|archive)\/[^/]+\/evidence\//.test(rel)) deny('evidence/ is written only by `spec verify`.');
  if (autopilot.length && /^specs\/(policies|tools|templates)\/|^specs\/config\.json$/.test(rel)) {
    deny(`Policies, templates, tooling and gate config cannot change while ${autopilot[0].id} is on autopilot. If a policy is wrong, block the ticket and explain why.`);
  }
  const early = autopilot.find(t => ['proposal', 'design', 'plan'].includes(t.meta.status));
  if (early && /^oms-(?!knowledge-base\/)[^/]+\//.test(rel)) {
    deny(`${early.id} is in the ${early.meta.status} stage on autopilot, so implementation edits are blocked until the plan gate passes. Put contract or code sketches in design.md for now.`);
  }
}

function progressFingerprint(t) {
  const docs = fs.readdirSync(t.dir).filter(f => f.endsWith('.md')).sort().map(f => fs.readFileSync(path.join(t.dir, f), 'utf8'));
  return sha(...docs, git(['status', '--porcelain'], { allowFail: true }) || '', git(['diff'], { allowFail: true }) || '');
}

async function hookStop() {
  const input = await stdinJson();
  const t = activeTickets().find(x => x.meta.autopilot && !['done', 'blocked'].includes(x.meta.status) && !x.meta.awaiting);
  if (!t) return;
  const stateFile = path.join(t.dir, '.autopilot.json');
  const state = readJsonSafe(stateFile) || { strikes: 0 };
  const fp = progressFingerprint(t);
  state.strikes = input.stop_hook_active && state.lastFp === fp ? state.strikes + 1 : 0;
  state.lastFp = fp;
  fs.writeFileSync(stateFile, JSON.stringify(state));
  if (state.strikes >= (CONFIG.autopilot?.maxIdleStops ?? 2)) {
    t.meta.autopilot = false;
    logTo(t, `autopilot switched off: no progress after ${state.strikes} continuation prompts at stage ${t.meta.status}`);
    saveTicket(t);
    return;
  }
  deny(`Autopilot: ${t.id} "${t.meta.title}" is at stage "${t.meta.status}" and not finished. ${NEXT[t.meta.status]} `
    + 'Keep following the spec-run skill. If you are genuinely stuck (a human decision is needed, a system is unavailable, '
    + `or the same gate keeps failing), run \`${CLI} block ${t.id} "<reason>"\` and then stop.`);
}

// ---------------------------------------------------------------------------------------------

const HELP = `OMS spec workflow — ${CLI} <command>

  new "<title>" [--type T] [--goal "..."] [--modules a,b] [--slug s]   create a ticket from the templates
  list [--all] [--json]                list tickets (--all includes the archive)
  status [id] [--json]                 details, current gate result and next step
  gate [id] [stage] [--json]           run a stage gate without advancing
       [--draft <file>]                gate <file> (e.g. proposal.md) as read from stdin; nothing is written
  advance [id]                         run the current gate; move to the next stage if it passes
  approve [id] [stage] [--by name]     human only: record approval, then advance
  reopen <id> <stage> "<reason>"       move back to an earlier stage
  block <id> "<reason>" | unblock <id>
  autopilot <id> on|off                let the Stop hook keep the agent going until done
  set <id> <${SETTABLE.join('|')}> <value>
  note <id> "<text>"                   append to the ticket log
  check [--all] [--base ref]           policy rules on changes since the base branch (or all files)
  verify [id]                          policy check + module verify commands → evidence/last-run.json
  archive [id]                         move a done ticket to specs/archive
  ci [--base ref]                      policy check + re-check passed gates of all tickets
  hook pre-tool|stop                   Claude Code hooks (read JSON on stdin)

Stages: ${STAGES.join(' → ')}   Exit codes: 0 ok, 1 gate/check failed, 3 awaiting approval`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { args, opts } = parseArgs(rest);
  const ticket = (i = 0) => resolveTicket(args[i], { includeArchive: cmd === 'status' });
  switch (cmd) {
    case 'new': return cmdNew(args, opts);
    case 'list': return cmdList(opts);
    case 'status': return cmdStatus(ticket(), opts);
    case 'gate': return cmdGate(resolveTicket(STAGES.includes(args[0]) ? undefined : args[0]), STAGES.includes(args[0]) ? args[0] : args[1], opts);
    case 'advance': return cmdAdvance(ticket());
    case 'approve': return cmdApprove(resolveTicket(STAGES.includes(args[0]) ? undefined : args[0]), STAGES.includes(args[0]) ? args[0] : args[1], opts);
    case 'reopen': return cmdReopen(ticket(), args[1], args.slice(2).join(' '));
    case 'block': return cmdBlock(ticket(), args.slice(1).join(' '));
    case 'unblock': return cmdUnblock(ticket());
    case 'autopilot': return cmdAutopilot(ticket(), args[1]);
    case 'set': return cmdSet(ticket(), args[1], args.slice(2).join(' ') || undefined);
    case 'note': return cmdNote(ticket(), args.slice(1).join(' '));
    case 'check': return cmdCheck(opts);
    case 'verify': return cmdVerify(ticket(), opts);
    case 'archive': return cmdArchive(ticket());
    case 'ci': return cmdCi(opts);
    case 'hook':
      try {
        if (args[0] === 'pre-tool') await hookPreTool();
        else if (args[0] === 'stop') await hookStop();
      } catch (e) {
        // A broken hook must never wedge the session; report and allow.
        process.stderr.write(`spec hook error (ignored): ${e.message}\n`);
      }
      return;
    case undefined: case 'help': case '--help': case '-h':
      return console.log(HELP);
    default:
      fail(`unknown command "${cmd}"\n\n${HELP}`);
  }
}

await main();
