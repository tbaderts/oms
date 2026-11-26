// SPEC-0078 — structural checks of ADR-006 against the proposal's acceptance criteria.
// Run: node --test specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/spike/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..', '..');
const ticketDir = 'specs/changes/SPEC-0078-evaluate-cozystack-for-local-kubernetes/';
const decisionsDir = join(root, 'oms-knowledge-base/architecture/decisions');
const DECISIONS = ['adopt-cozystack', 'coexist', 'lightweight-kubernetes', 'stay-on-compose'];

function adrPath() {
  const f = existsSync(decisionsDir) && readdirSync(decisionsDir).find((n) => /^ADR-006-.*\.md$/.test(n));
  assert.ok(f, 'ADR-006-*.md must exist in architecture/decisions');
  return join(decisionsDir, f);
}
const adr = () => readFileSync(adrPath(), 'utf8');

/** Text of the `## <heading…>` section, up to the next `## `. */
function section(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('## ') && l.toLowerCase().includes(heading.toLowerCase()));
  assert.ok(start >= 0, `section "## ${heading}" must exist`);
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n');
}

/** First markdown table in text whose header contains every given column. */
function table(text, columns) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trim().startsWith('|') || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue;
    const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const header = cells(lines[i]);
    if (!columns.every((c) => header.some((h) => h.toLowerCase() === c.toLowerCase()))) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length && lines[j].trim().startsWith('|'); j++) rows.push(cells(lines[j]));
    return { header, rows };
  }
  assert.fail(`table with columns ${columns.join(', ')} not found`);
}

function composePorts() {
  // Every entry of every `ports:` block: "8090:8090", 3000:3000, "127.0.0.1:8096:8000", "${X:-5050}:80".
  const lines = readFileSync(join(root, 'docker-compose.yml'), 'utf8').split(/\r?\n/);
  const ports = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s+ports:\s*$/.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length && /^\s+-\s/.test(lines[j]); j++) {
      const entry = lines[j].replace(/#.*/, '').replace(/^\s+-\s*/, '').replace(/["']/g, '').trim()
        .replace(/\$\{\w+:-(\d+)\}/g, '$1');
      const parts = entry.split(':');
      if (parts.length >= 2) ports.add(parts[parts.length - 2]);
    }
  }
  assert.ok(ports.size >= 15, `parsed ${ports.size} compose ports`);
  return [...ports];
}

test('AC-1 adr exists, indexed, one decision', () => {
  const text = adr();
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(fm, 'front matter');
  assert.match(fm[1], /^type:\s*Decision\s*$/m);
  assert.match(fm[1], /^id:\s*"ADR-006"\s*$/m);
  const d = fm[1].match(/^decision:\s*(\S+)\s*$/m);
  assert.ok(d, 'decision: field');
  assert.ok(DECISIONS.includes(d[1]), `decision must be one of ${DECISIONS}`);
  const index = readFileSync(join(decisionsDir, 'index.md'), 'utf8');
  assert.match(index, /\(ADR-006-[^)]+\.md\)/, 'decisions index links ADR-006');
});

test('AC-2 options table', () => {
  const cols = ['Option', 'RAM footprint', 'CPU footprint', 'Setup effort', 'Windows 11 Home feasibility', 'Compose parity', 'Scaling test ability'];
  const { rows } = table(section(adr(), 'Options'), cols);
  assert.ok(rows.length >= 4, 'at least 4 options');
  const names = rows.map((r) => r[0].toLowerCase()).join(' | ');
  for (const k of ['compose', 'talos', 'single-node', 'k3d']) assert.ok(names.includes(k), `an option mentioning ${k}`);
  for (const r of rows) {
    assert.equal(r.length, cols.length, `row "${r[0]}" has every column`);
    r.forEach((c, i) => assert.ok(c.length > 0, `row "${r[0]}" column ${cols[i]} filled`));
  }
});

test('AC-3 evidence hardware', () => {
  const ev = section(adr(), 'Evidence');
  assert.match(ev, /https:\/\/cozystack\.io\/docs\/[^\s)]*hardware/);
  assert.match(ev, /24 GB/);
  assert.match(ev, /31(\.\d)? GB/, 'host RAM');
  assert.match(ev, /16 threads/, 'host threads');
  assert.match(ev, /Docker Desktop[^\n]*GiB/, 'Docker allotment');
  for (const n of [2, 3, 4]) assert.match(ev, new RegExp(`Option ${n} (does not fit|fits)`), `fits/does not fit verdict for option ${n}`);
  assert.match(ev, /3\s*[×x]\s*24\s*GB\s*=\s*72\s*GB/, 'arithmetic shown');
});

test('AC-4 memory figures', () => {
  const ev = section(adr(), 'Evidence');
  const { rows } = table(ev, ['Setup', 'Memory', 'Source']);
  const has = (re) => rows.some((r) => re.test(r[0]));
  assert.ok(has(/compose.*total/i), 'compose total row');
  assert.ok(has(/k3d.*operators/i), 'k3d operators row');
  for (const r of rows) assert.match(r[2], /\b(measured \d{4}-\d{2}-\d{2}|estimate)\b/i, `row "${r[0]}" labelled measured <date> or estimate`);
  const { rows: per } = table(ev, ['Container', 'Memory']);
  assert.ok(per.length >= 10, 'per-service compose memory');
});

test('AC-5 parity', () => {
  const { rows } = table(section(adr(), 'Parity'), ['Capability', 'Compose', 'Kubernetes option', 'Gap handling']);
  const caps = rows.map((r) => r[0].toLowerCase()).join(' | ');
  for (const k of ['schema registry', 'observability', 'archive replica', 'kafka']) assert.ok(caps.includes(k), `parity row for ${k}`);
  for (const r of rows) assert.match(r[3], /\b(F-\d+|accepted|none)\b/i, `row "${r[0]}" ends in follow-up, accepted or none`);
});

test('AC-6 coexistence ports', () => {
  const co = section(adr(), 'Coexistence');
  const { rows } = table(co, ['Host port', 'Compose service', 'Used by Kubernetes option']);
  const listed = new Set(rows.map((r) => r[0].replace(/\D/g, '')));
  for (const p of composePorts()) assert.ok(listed.has(p), `compose host port ${p} listed`);
  assert.match(co, /docker compose stop/);
  assert.match(co, /k3d cluster stop/);
  assert.match(co, /k3d cluster start/);
  assert.match(co, /docker compose (up|start)/);
});

test('AC-7 inner loop', () => {
  const il = section(adr(), 'Build');
  const { rows } = table(il, ['Step', 'Compose', 'Kubernetes', 'Source']);
  assert.ok(rows.some((r) => /total/i.test(r[0])), 'a total row');
  for (const r of rows) assert.match(r[3], /\b(measured|estimate)\b/i, `row "${r[0]}" labelled`);
  assert.match(il, /--replicas[= ]3/);
  // The test entry point: an existing load driver, pointed at the cluster.
  assert.match(il, /order-generator\.ipynb/);
  assert.ok(existsSync(join(root, 'oms-core/scripts/order-generator.ipynb')), 'named test entry point exists');
});

test('AC-8 follow-ups and cozystack page', () => {
  const { rows } = table(section(adr(), 'Follow-ups'), ['ID', 'Title', 'Type', 'Modules']);
  assert.ok(rows.length >= 1);
  const modules = Object.keys(JSON.parse(readFileSync(join(root, 'specs/config.json'), 'utf8')).modules);
  for (const r of rows) {
    assert.ok(r[1].length > 0, 'title');
    assert.ok(['feature', 'fix', 'refactor', 'spike', 'chore'].includes(r[2]), `type of ${r[1]}`);
    for (const m of r[3].split(',').map((s) => s.trim().replace(/`/g, '')).filter(Boolean))
      assert.ok(modules.includes(m) || m === 'new module', `module ${m} of ${r[1]}`);
  }
  const coz = readFileSync(join(root, 'oms-knowledge-base/infrastructure/cozystack.md'), 'utf8');
  assert.match(coz, /\.\.\/architecture\/decisions\/ADR-006-[^)]+\.md/);
});

test('AC-9 change scope', () => {
  // Paths this ticket writes. Other sessions share the tree, so only these are checked.
  const expected = [
    ticketDir,
    'oms-knowledge-base/architecture/decisions/ADR-006-',
    'oms-knowledge-base/architecture/decisions/index.md',
    'oms-knowledge-base/infrastructure/cozystack.md',
    'oms-knowledge-base/infrastructure/local-docker-stack.md',
  ];
  const changed = execSync('git status --porcelain -uall', { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, '')); // renames: keep the new path
  assert.ok(changed.some((p) => expected.some((e) => p.startsWith(e)) && p.startsWith('oms-knowledge-base/')), 'KB changes present');
  // The things this ticket could plausibly have leaked outside its paths, each of which must be absent:
  assert.ok(!changed.includes('docker-compose.yml'), 'docker-compose.yml unchanged');
  assert.ok(!existsSync(join(root, 'oms-core/src/main/java/org/example/oms/SpikeMarker.java')), 'loop marker class removed');
  for (const p of changed.filter((c) => !expected.some((e) => c.startsWith(e)) && /\.(ya?ml|ps1)$/.test(c))) {
    const text = existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : '';
    assert.ok(!/k3d|oms-spike|kafka\.strimzi\.io|postgresql\.cnpg\.io|redis\.opstreelabs\.in|grafana\.integreatly\.org/.test(text),
      `${p} is outside this ticket's paths but carries spike/k8s content`);
  }
  // The spike folder holds no service code.
  assert.ok(!readdirSync(here).some((f) => /\.(java|gradle)$/.test(f)), 'no service code in spike folder');
});
