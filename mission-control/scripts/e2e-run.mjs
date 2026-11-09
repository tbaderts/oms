#!/usr/bin/env node
// End-to-end check (SPEC-0055 AC-10): starts a run through a running Mission Control server against
// the live compose stack, waits for it to finish and checks the summary.
//
//   npm run e2e -- --rate 20 --duration 60 [--symbol AAPL] [--mc http://127.0.0.1:8097] [--out summary.json]
//
// Exit 0 only if every order was FILLED, every figure has a sample per order, there are no create
// errors or incomplete orders, and the run is not generator-limited.
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const mc = args.mc ?? 'http://127.0.0.1:8097';
const rate = Number(args.rate ?? 20);
const durationSec = Number(args.duration ?? 60);
const symbol = args.symbol ?? 'AAPL';
const expected = Math.round(rate * durationSec);

const res = await fetch(`${mc}/mc/runs`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ rate, durationSec, label: `e2e ${rate}/s × ${durationSec}s`, template: { symbol, ordType: 'MARKET', side: 'BUY', orderQty: 100 } }),
});
const started = await res.json();
if (res.status !== 201) {
  console.error('run refused:', JSON.stringify(started));
  process.exit(2);
}
const { runId } = started;
console.log(`run ${runId}: ${expected} orders at ${rate}/s`);

let run;
for (;;) {
  await new Promise((r) => setTimeout(r, 2000));
  run = await (await fetch(`${mc}/mc/runs/${runId}`)).json();
  const s = run.summary;
  process.stdout.write(`\r${s.status} sent ${s.sent}/${s.scheduled} created ${s.created} states ${JSON.stringify(s.stateCounts)}      `);
  if (s.status === 'COMPLETED' || s.status === 'STOPPED') break;
}
console.log();

const s = run.summary;
const checks = [
  ['all orders FILLED', s.stateCounts.FILLED === expected, `${s.stateCounts.FILLED ?? 0}/${expected}`],
  ...Object.entries(s.figures).map(([f, st]) => [`${f} has ${expected} samples`, st.count === expected, `${st.count}`]),
  ['no create errors', s.createErrors.length === 0, `${s.createErrors.length}`],
  ['no incomplete orders', s.incomplete.length === 0, `${s.incomplete.length}`],
  ['not generator-limited', !s.generatorLimited, `achieved ${s.achievedRate}/s, p99 lateness ${s.p99LatenessMs} ms`],
];
for (const [name, ok, detail] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
console.log('\nfigure        count     p50       p95       p99       max   (ms)');
for (const [f, st] of [...Object.entries(s.figures), ...Object.entries(s.deltas)]) {
  const n = (v) => (v === null ? '–' : v.toFixed(1)).padStart(9);
  console.log(`${f.padEnd(15)}${String(st.count).padStart(6)}${n(st.p50)}${n(st.p95)}${n(st.p99)}${n(st.max)}`);
}
if (args.out) {
  writeFileSync(args.out, JSON.stringify({ runId, config: run.config, summary: s }, null, 2));
  console.log(`\nsummary written to ${args.out}`);
}
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
