#!/usr/bin/env node
// Node harness for HB.RALLY.calibrate (PLAN P4b) — headless, no browser needed.
// usage: node tools/calib.js [n]
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = path.join(__dirname, '..', 'src');
const ctx = vm.createContext({ console });
ctx.window = ctx; // module code assigns window.HB / HB.x
for (const f of ['cfg.js', 'util.js', 'rally.js']) {
  vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
}
const HB = ctx.window.HB;
const n = Number(process.argv[2] || 2000);
const out = HB.RALLY.calibrate(n);
const T = { firstServePct: [60, 65], acePct: [4, 8], dfPct: [2, 4], meanRally: [4, 7] };
console.log('calibrate(' + n + ')  targets: 1st 60-65% | ace 4-8% | DF 2-4% | rally 4-7');
let bad = 0;
for (const sf of Object.keys(out)) {
  const r = out[sf], flags = [];
  for (const k of Object.keys(T)) {
    const v = r[k];
    if (v < T[k][0] || v > T[k][1]) { flags.push(k + '=' + v); bad++; }
  }
  console.log(sf.padEnd(7), JSON.stringify(r), flags.length ? ' OUT: ' + flags.join(', ') : ' OK');
}
process.exit(bad ? 1 : 0);
