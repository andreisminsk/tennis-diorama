#!/usr/bin/env node
// P5 gate: pure scoring engine tests (PLAN P5 — score legality per format).
// Normal game, deuce/AD, FAST4 tb@3-3 (to 5), set tb@6-6 (to 7), bo3 super-tb (10).
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = path.join(__dirname, '..', 'src');
const ctx = vm.createContext({ console });
ctx.window = ctx;
for (const f of ['cfg.js', 'util.js', 'core-bus.js', 'flow.js'])
  vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
const HB = ctx.window.HB;
if (!HB || !HB.FLOW) { console.log('FAIL: HB.FLOW not registered'); process.exit(1); }

let fails = 0;
function ok(c, l) { console.log((c ? 'ok  ' : 'FAIL') + ' ' + l); if (!c) fails++; }
const meta = { id: 'x', name: 'A Archer', serve: { dir: { w: .4, b: .3, t: .3 } },
               cons: 70, tactic: { risk: 50 } };

// win one game: 4 straight points by w
function game(M, w) { for (let i = 0; i < 4; i++) HB.FLOW.scorePoint(M, w); }

// ---- straight game ----
let M = HB.FLOW.newMatch('set', [meta, meta], 'hard');
game(M, 0);
ok(M.score.gamesNow[0] === 1 && M.score.ptsRaw[0] === 0, 'game = 4 straight pts');

// ---- deuce / AD cycle ----
M = HB.FLOW.newMatch('set', [meta, meta], 'hard');
[0, 1, 0, 1, 0, 1].forEach(w => HB.FLOW.scorePoint(M, w));
ok(HB.FLOW.scoreText(M).ptr === '40–40', 'deuce 40–40');
HB.FLOW.scorePoint(M, 0);
ok(HB.FLOW.scoreText(M).ptr === 'AD–40', 'AD–40');
HB.FLOW.scorePoint(M, 1);
ok(HB.FLOW.scoreText(M).ptr === '40–40', 'AD erased → deuce');
HB.FLOW.scorePoint(M, 0); HB.FLOW.scorePoint(M, 0);
ok(M.score.gamesNow[0] === 1, 'deuce game resolves (live-freeze regression)');

// ---- FAST4: tb at 3-3, tb to 5 ----
M = HB.FLOW.newMatch('short', [meta, meta], 'grass');
game(M, 0); game(M, 0); game(M, 1); game(M, 1);   // 2-2
game(M, 1);                                        // 2-3
game(M, 0);                                        // 3-3 → tb
ok(M.score.tb && M.score.tb.target === 5, 'FAST4 3-3 → tb to 5');
M.score.tb.pts = [4, 4];
HB.FLOW.scorePoint(M, 0);                          // 5-4 — no 2-pt lead yet
ok(M.score.tb !== null, 'tb 5-4 continues (win-by-2 rule)');
HB.FLOW.scorePoint(M, 0);                          // 6-4 → over
ok(M.score.tb === null && M.score.sets[0] === 1, 'FAST4 tb 6-4 completes set (A)');

// ---- FAST4 tb won by B also completes ----
M = HB.FLOW.newMatch('short', [meta, meta], 'grass');
game(M, 0); game(M, 0); game(M, 1); game(M, 1); game(M, 1); game(M, 0);
M.score.tb.pts = [3, 4];
HB.FLOW.scorePoint(M, 1);                          // 3-5 → over, B wins
ok(M.score.sets[1] === 1 && M.score.tb === null, 'FAST4 tb 3-5 → set (B)');

// ---- one set: tb at 6-6 (to 7), tb win = match ----
M = HB.FLOW.newMatch('set', [meta, meta], 'clay');
game(M, 0); game(M, 0); game(M, 0); game(M, 0); game(M, 0);   // 5-0
game(M, 1); game(M, 1); game(M, 1); game(M, 1); game(M, 1);   // 5-5
game(M, 0);                                        // 6-5
game(M, 1);                                        // 6-6 → tb
ok(M.score.tb && M.score.tb.target === 7, 'set 6-6 → tb to 7');
M.score.tb.pts = [6, 6];
HB.FLOW.scorePoint(M, 0);                          // 7-6 not over
let r = HB.FLOW.scorePoint(M, 0);                  // 8-6 over
ok(r.setOver && r.matchOver && M.score.sets[0] === 1, 'set tb → SET+MATCH');

// ---- bo3: decider super-tb to 10 ----
M = HB.FLOW.newMatch('bo3', [meta, meta], 'carpet');
M.score.sets = [1, 1];                             // forced 1-1
game(M, 0); game(M, 0); game(M, 0); game(M, 0); game(M, 0);   // 5-0
game(M, 1); game(M, 1); game(M, 1); game(M, 1); game(M, 1);   // 5-5
game(M, 1);                                        // 5-6
game(M, 0);                                        // 6-6 → super-tb
ok(M.score.tb && M.score.tb.target === 10, 'bo3 1-1, 6-6 → super-tb to 10');
M.score.tb.pts = [9, 9];
HB.FLOW.scorePoint(M, 1);                          // 9-10 not over
r = HB.FLOW.scorePoint(M, 1);                      // 9-11 → over, B wins match
ok(r.matchOver && M.score.sets[1] === 2, 'super-tb 9-11 → match (B)');

// ---- legality: tbServer alternates ----
M = HB.FLOW.newMatch('set', [meta, meta], 'hard');
M.score.tb = { pts: [0, 0], target: 7, first: 0 };
const seq = [];
for (let i = 0; i < 4; i++) { seq.push(HB.FLOW.tbServer(M)); M.score.tb.pts[0]++; }
ok(seq[0] !== seq[1], 'tb server alternates, seq=' + seq.join(','));

console.log(fails ? '\nFAILED: ' + fails : '\nALL SCORE ENGINE TESTS PASSED');
process.exit(fails ? 1 : 0);
