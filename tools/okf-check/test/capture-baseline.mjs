// One-off: records what oms-mcp-server extracts from the bundle *before* the OKF conversion.
// Usage: node test/capture-baseline.mjs ../../oms-knowledge-base > test/baseline-metadata.json
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { extractMetadata } from './mcp-metadata.mjs';

const root = process.argv[2];
const out = {};
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) {
      const { version, status } = extractMetadata(readFileSync(p, 'utf8'));
      if (version || status) out[relative(root, p).split(sep).join('/')] = { version, status };
    }
  }
})(root);
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).sort()), null, 2));
