#!/usr/bin/env node
// bundle-size.js - Prints the gzipped size of the main JavaScript bundle of the last `npm run build`
// (SPEC-0060, AC-7). Usage: npm run build && node scripts/bundle-size.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dir = path.join(__dirname, '..', 'build', 'static', 'js');
const main = fs.existsSync(dir) && fs.readdirSync(dir).find(f => /^main\.[0-9a-f]+\.js$/.test(f));
if (!main) {
  console.error(`No main.*.js in ${dir}; run npm run build first.`);
  process.exit(1);
}
const raw = fs.readFileSync(path.join(dir, main));
const gzipped = zlib.gzipSync(raw, { level: 9 }).length;
console.log(`${main}: ${(raw.length / 1024).toFixed(1)} kB raw, ${(gzipped / 1024).toFixed(1)} kB gzipped`);
