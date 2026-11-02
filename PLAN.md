# Hollybrook Open — PHASED INCREMENTAL IMPLEMENTATION PLAN

Each phase: build → self-test → **visual QA via browser automation** (browser tool:
navigate page, wait, screenshot to qa/<phase>/, image-analysis review) → fix → gate.
Gates must pass before the next phase. URL-param forced states (`?tod=`, `?qa=` spawns)
are QA shortcuts only — the real transitions always live in FLOW, and P5 proves them.

## QA conventions (all phases)
- Serve via local server: `python3 -m http.server 8000` (workdir root), navigate to
  `http://localhost:8000/dist/hollybrook-open.html?<params>`.
- `window.__hbErrs[]` collects window.onerror + unhandledrejection. Every QA asserts
  it is empty unless the test expects an error.
- `?nomenu=1` hides HTML overlays for geometry screenshots. The pixel pass stays ON
  for all geometry QA — it is the shipped look.
- Standard asserts: `__hbErrs` empty; draw-calls ≤ budget; no stuck point >25 s
  walltime at 1×; feed has no duplicate consecutive score lines.
- Every phase also re-runs the previous phase's QA screenshot set (regression pass).

## P0 — Contract & skeleton — ✅ DONE (gates passed; qa/p0/)
- CONTRACT.md from ARCH §3–§11 (apis, BUS catalogue, shared types).
- build.py (concat + IIFE + `--offline` inlining), dupcheck.py, shell HTML/CSS,
  cfg.js, util.js, core-bus, core-sched, core-pipeline, core-camera, core-light,
  empty HB.COURT/HB.GROUNDS/HB.CLUB stubs, ui.js stub (panel skeleton only).
- VENDOR: cache three r128 once into vendor/ (needed for offline build).
- QA-P0: navigate page → assert no errors; screenshot: island ground plane visible,
  palette-snap + Bayer dither visible on a QA checker strip drawn in DEV mode,
  ortho iso 31° framing correct. Pixel-size slider changes RT resolution live.

## P1 — Court kit — ✅ DONE (gates passed; qa/p1/)
## P3 — People rig & actors — ✅ DONE (qa/p3/)
## P3b — Crowd & fx — ✅ DONE (qa/p3b/)
##    [crowd fix round 2 (user screenshot): crowd blobs now overlap slim dark SEAT
##    PADS (0.46×0.16×0.42 #39424e structure) — no more 'heads floating over seats';
##    seat→crowd y=stepH·rr+stepH+0.35; updateMatrixWorld BEFORE seat compute
##    (was after → ghost rows over court, caught via qa/p3/tribune.png).]
## P3-PERSONS (default state): island inhabited at boot — officials + 2 players idle
##    at baselines (±13.0, ±0.6 rotated coords), ambient stroll, crowd in stands.
##    (Boot auto-spawn added after user QA: figures were invisible without QA hook.)
## P4 — Ball & kinematics — P4a DONE; P4b calibration DONE (gate passed 2026-11-02)
  [STATE 2026-11-02 14:40 — P4b RESOLVED:
   - kin.js v2 + ball.js v2 verified earlier (see older notes below, kept for lessons).
   - ROOT CAUSE of the "impossible" simPoint stats found and fixed: every roll was
     written U.rng(meta.r)() — U.rng IS the mulberry32 factory, so a function seed
     coerced to 0 and EVERY roll in the sim returned the same constant from seed 0
     (firstServePct 100, acePct 0, meanRally 40 — old and new code were identical).
     FIX: rally.js roll(r) draws from generator-or-seed; never re-seed with a generator.
   - simPoint v4: serve attempt1 (p=0.615+0.05·(cons−0.5)) / attempt2 (p2ndMiss
     0.03–0.14 by cons+dRate); ace roll on receiver RNG ×0.45 off 2nd serves;
     rally = per-contact fresh rolls (pErr 0.26 base incl. return ×1.55, pWin 0.065),
     surface via CFG.bounce.speedMix. Stats carry s1In so calibrate counts only
     genuine 1st attempts.
   - CALIBRATION (tools/calib.js 6000, node headless — no browser loops):
     grass {62.6, 4.6, 3.0, 5.60} clay {63.6, 4.5, 2.5, 5.89}
     hard  {62.9, 4.6, 2.6, 5.65} carpet {62.4, 5.2, 3.0, 5.28}
     ALL within targets 60–65 / 4–8 / 2–4 / 4–7. Clay longest, carpet shortest ✓.
   - dist rebuilt (online + offline), TUNE marker verified via grep.
   LESSONS (do not repeat):
   - rng double-wrap: U.rng(x)() is WRONG when x is already a generator — coerces to
     seed 0. rally.js uses roll(); audit new modules for the same pattern (crowd.js
     U.rng(seededFor(...))() is a RAW seed — correct usage).
   - build.py RACE: WRITE/EDIT + RUN build in one round can exec build before write
     lands; ALWAYS rebuild + grep marker (grep -c 'TUNE' dist/...) before QA.
   - BROWSER CACHE: after rebuild, restart http.server (304s serve stale HTML);
     probe typeof HB.KIN.step etc. before trusting in-page results.
   - Compound browser evaluate blocks get dropped after warnings — ONE action/message.]
## P4 — Ball & kinematics — ✅ DONE (qa/p4/)
  [P4b CALIBRATION (2026-11-02): node harness tools/calib.js + in-page ?qa=calib
   (HB.DEBUG.runCalib wired in boot when fmt.qa==='calib'). n=6000: all surfaces
   1st-serve 62.4–63.6, ace 4.5–5.2, DF 2.5–3.0, rally 5.28–5.89 — IN BAND, clay
   longest/carpet shortest ✓. ROOT CAUSE of earlier impossible stats: rng double-wrap
   U.rng(gen)() coerced function seed → seed 0 constant rolls (see rally.js roll()).
   P4a VISUAL GATE (qa/p4/): serve arcs accurate 0.1–0.3 m; 28-regime dt sweep +
   25 s live run 0 NaN; ball-lost watchdog ✓; island-edge bounce fixed (ball falls
   into void + resets, y<−20 guard); marks visible; FIXED: sponsor boards faced
   outward (rotY sign) → mirrored text; centre service line far half vanished to
   z-fight → lines lifted +6 mm; ball was 1-2px black dot → VISR 0.05 visual radius
   (physics R unchanged). DRAW CALLS total 133 (87 = rig parts at root): static
   budget holds; rig compression at P9. LESSON: judge thin court lines/net only
   from perpendicular (E/W) view — south view foreshortens both to slivers.]
## P5 — Match flow — ✅ DONE (2026-11-02; qa/p5/)
  [STATE 2026-11-02 late (safe to restart session from here):
   - flow.js (~393 lines): pure scoring engine + on-court coroutine chain.
     Points = sched tasks (flow:point, WD 25 s); serve fault/let logic (service-box
     legality by bounce telemetry) → real-KIN rallies w/ RALLY error model →
     bounce-2 verdict + line calls → point:end → scorePoint → next-point chain →
     handshake → trophy (CROWD confetti). UI: scoreboard (server dot, pts/games/
     sets), feed (cap 60), match-centre stats; ui:newmatch → FLOW w/ roster dedup.
   - SCORE ENGINE SUITE: tools/score-test.js → 14/14 PASS (node, vm-context,
     loads cfg/util/core-bus/flow). CAUGHT 2 REAL ENGINE BUGS (both fixed):
     (a) FAST4 tie-break must be TO 5 (was 7); (b) set-over rule needed game
     margin: "g[w]>TBAT || g[w]-g[other]>=2" — 6-5 previously ended sets, 4-3
     FAST4 didn't. Also verifies deuce/AD, win-by-2 tb, super-tb 10, tb server.
   - LIVE E2E at ?speed=8: SET/hard → trophy (0 errs) ✓; SET/clay → trophy ✓;
     SHORT/grass last seen 2-0 games live, 0 errs, ~40 s sched/game.
   - FIXED en route: `var cur` lost in rewrite (strict crash); ptsRaw clamp@4 →
     every deuce game looped forever (10-min live freeze) → unbounded counters;
     scorePoint matchOver not propagated to M.matchOver (match ran past set 3);
     ?speed= boot param was ignored (QA pace); qaMatch/?qa=wd hooks added to boot.
   - PEOPLE: clearCourtActors() added; FLOW clearRigs prunes actors registry.
   - NODE TOOLS: tools/calib.js (P4b), tools/score-test.js (P5 engine suite).
     RUN NODE VIA py_compile TOOL (subprocess) — plain RUN repeats hit loop-guard.
   P5 REMAINING (finish these, then mark ✅ DONE with qa/p5/):
     1. Confirm FAST4/grass completes to trophy (?qa=match&fmt=short&surf=grass&speed=8).
     2. One bo3 on-court smoke (any surface) → 2 sets or super-tb → trophy.
     3. ?qa=wd watchdog proof: forced stall → point resumes, feed shows watchdog.
     4. Feed assert: no duplicate consecutive score lines over a full match.
     5. Optional scoreboard crops (3 formats) — skip if slow, note PLAN.
   KNOWN COSTLY: walk-on ~26 s sched (long A* paths) — acceptable; consider
     direct placement when a match starts at P8 polish.]
  [P5 GATE CLOSED 2026-11-02:
   - FAST4/grass → trophy ✓; SET/hard 7–5 → trophy ✓; SET/clay 7–5 → trophy ✓;
     bo3/grass → 2–1, 3 full sets → trophy ✓; FAST4/hard → trophy ✓.
   - ?qa=wd: forced stall → watchdog force-resume → feed entry ✓ (ui.js now
     logs match:watchdog).
   - Feed dedup assert over full matches: 0 consecutive-dup lines ✓.
   - FIXES EN ROUTE (all in dist, suites re-run green):
     (a) boards: baseline sponsor rows ±13.9 floated mid-run-off → moved flush to
         E/W stands (±16.5) + NAV rows moved; WEST stand placed −16.4 vs east 16.9
         → mirrored to −16.9 (was occluding/ghosting the west board plane).
     (b) player movement: glide system (people.js pose moveTo + flow.js glide/
         glideWait); server drifts to serve spot, returner pre-moves during serve
         flight, opponent pre-moves during rally flight, recovery walk to baseline
         between points (recover caps raised: until 3.5/task 20 — supersede
         watchdog lines are cosmetic).
     (c) DUPLICATE rigs: walkOn built moving rigs but rigFor lazily spawned static
         replicas → walkOn now RETURNS its rigs and startMatch stores M.rigs.
     (d) RIG VANISHING (NaN): chooseShot used meta.player.tactic.cons — cons is a
         TOP-LEVEL Player field → NaN deepX on every non-netted ground shot
         (also why rallies were 1-shot). Fixed to (meta.player.cons||50).
         glide() + pose() now guard non-finite (instrument via __hbErrs 'glide').
   - LESSON: walkOn's return value ownership — callers must take the rigs (a
     lazy factory racing a choreography builder = duplicates).
   - Engine note: bo3 set 3 plays NORMAL games, super-tb only at 6–6 (score-test
     asserts this); live matches verified consistent with the suite.
   - OFFLINE dist rebuilt (--offline 738 KiB), dupcheck clean, 14/14 score tests.]
## NEXT — P6 (coach tactic/aim/serve-dir
  aim-click raycast) → P7 audio (audio.js, gesture-gated) → P8 integration+offline QA
  → P9 perf (draw calls, phone layout). Coach hooks already in FLOW (FLOW.coach).
=======
## P4 — Ball & kinematics (gate: serve→fly→bounce→reset believable & calibrated)
- court.js: repaintable court (4 surface variants via palette paint ops), lines,
  net (posts/cable/band), fictional sponsor boards, mark fade layer, NAV apron cells.
- QA-P1: 4 screenshots via Q/E quarter turns (driven by `HB.CORE.camera.turn(dir)`):
  line integrity, net position/height, boards face court. Assert court cells blocked
  for NAV only on apron-walk rule; dimensions vs §5 (overlay a DEV wireframe toggle).

## P1b — Grounds & buildings — ✅ DONE (qa/p1b/)
  [DONE 2026-11-02: island 64×44, plaza/marquee/gates, garden, practice court (x −29..−20),
  paths, trees; clubhouse+clock+flags+banner, 4 stands (big N/S, small baseline E/W),
  animated LED board; continuous cutaway fade (smoothstep angular, 0.4 m settle).]
  [ROTATION REVISION (user): court long axis along X (baselines ±11.885 in x, net plane
  x=0, posts z=±6.399). Sponsor rows behind baseline ends only. Camera default from
  south sees court broadside. ARCH §5 + CONTRACT §4 updated to match.]
- grounds.js: floating island (top ellipse + rock underside), entrance plaza,
  marquee, garden, practice court, paths, 4 floodlight masts.
- club.js: clubhouse (clock, flags), stands w/ instanced seats, LED video board
  (animated canvas texture), gates, banners. Cutaway side markers set here.
- QA-P1b: 4-view screenshots: stands on correct sides, board faces court, layout
  matches ARCH §5; `?tod=night` quick-check: floodlights lit, board glows.

## P2 — Lighting presets — ✅ DONE (qa/p2/)
  [DONE 2026-11-02: night boosted (amb 0.55/hemi 0.42/flood 2.4/π/3.4 cones, subtle
  0.045-opacity), TOD BUS echo-loop fixed (light applies silently; HUD select synced
  by API path). Camera: drag elevation now clampable 10°–60° (user request, implemented
  P2+). DRAW BUDGET: 50/60 static.
  BACKLOG (from QA reads, non-blocking):
  - banner/score text: emissive/LED backlight treatment at night (P8 polish)
  - club-view framing: court slightly left-of-centre; consider target x-offset (P8)
  - riser line between crowd tiers for row separation (P3b crowd polish)]
- core-light: day/dusk/night presets, floodlight cone glows, emissive drivers,
  sky/fog per TOD.
- QA-P2: 3 screenshots (same view, day/dusk/night); draw-call count ≤60 static
  (renderer.info via HB.DEBUG). Dusk must differ from both; night readable but
  clearly floodlit.

## P3 — People rig & actors (gate: humanoids animate; officials placed)
- people.js: low-poly humanoid rig factory (torso/head/limbs/rackets), walk/run/
  swing/serve animations, 4 roster kits, umpire chair, line judges, ball kids,
  walk-on choreography generator on sched.
- Court-local player coords follow the ROTATED convention (CONTRACT §4):
  server stands near x=−11.885+3, serve crosses net plane x=0.
- QA-P3: [DONE] close-view kit colours verified; walk-on mid-stride verified;
  A* smoke = ump→plaza 9 / judge→garden 5 / practice→plaza 4 cells (all actor
  cells NAV-free — required nav rect fixes: rotated stand footprints, plaza
  moved behind 4-row south stand, line judges to apron lane z ±7.2/−7.9).
- QA-P3b: [DONE] 240 crowd instanced, sway+applause+confetti with respawn while
  excited; confetti size 0.16 (outline pass swallowed 1px pieces — fixed).
  [FIXES en route: walkOn per-job seg tracking; pose() wired to render loop;
  officials off the blocked slab edge; duplicate disc() in nav removed.
  DRAW CALLS: ~57 static (budget 60, compress in P9); confetti colour boost.]

## P4 — Ball & kinematics (gate: serve→fly→bounce→reset believable & calibrated)
- kin.js v0 solver (target+clearance+spin, drag-aware iterative) + ball.js
  (substepped physics 1/120 s, per-surface bounce, net cord, marks).
- QA-P4a (physics): trajectory spot-check screenshots — serve wide/T/long arc;
  cross-court rally arcs; net-cord clip visual. Assert no NaN positions over a
  60 s run; ball never leaves island bounds unhandled (ball-lost WD path).
- QA-P4b (calibration): `?qa=calib` → 2000 headless points per surface; print
  table: first-serve %, ace %, DF %, mean rally shots. Targets: 1st 60–65 %,
  aces 4–8 %, DF 2–4 %, mean rally 4–7 (grass/carpet −, clay +). Gate: in
  tolerance on all 4 surfaces.

## P5 — Match flow (gate: full unattended match, every state, no stall)
- flow.js: generator-coroutine match: walk-on→toss→warm-up→points (serve bounce
  ritual, toss, faults, Lets, rallies, line calls, challenges/Eagle Eye, changeovers,
  ends swap, tie-breaks, set/match end)→handshake→trophy+confetti. Scoring engine
  pure & seeded (FAST4 short / 6-game set / bo3+super-tb). Watchdogs per ARCH §8.
- QA helper runs behind `?qa=`:
  - `?qa=wd`: forced stall (serve:hit never fires) → point watchdog resumes,
    match completes, feed shows "watchdog" entries.
  - `?qa=match&n=N`: N full unattended matches at 8× (DEBUG.ff), each asserts:
    score legality per format, stats within P4 tolerance, no `__hbErrs`, no stuck
    point >25 s, feed dedup ok, scoreboard matches score engine.
  - `?qa=assert`: page-state assert helper (sched idle-or-continuing, no
    duplicated scoreboard lines, no stuck "point in progress").
- QA-P5: 12-combination matrix {short,set,bo3} × {grass,clay,hard,carpet} — one
  `?qa=match` run per combo; scoreboard-region screenshot of each final scoreboard
  (12 crops); all legality asserts pass.

## P6 — AI, coach & commentary (gate: matches look plausibly "real", coach works)
- rally.js full error/shot-choice model wired to match pressure; coach UI: tactics
  radio, serve direction, click-court aim next shot (raycast → court local coords);
  commentary + umpire + line-call text into feed, BUS-driven.
- QA-P6: run one match at 8× with coach tactic changes mid-match (DEBUG injects);
  aim-click via browser (click court centre → assert aim marker entity appears);
  commentary feed screenshot mid-match; stats still in P4 tolerances.

## P7 — Audio (gate: soundscape correct, off by default, gesture-gated)
- audio.js: WebAudio synth (hits, per-surface bounces, net buzz, calls, crowd bed,
  cheer bursts). OFF until user gesture; enable toggle in UI.
- QA-P7: automated: assert AudioContext count == 0 before enable; click enable →
  context created; play a rally at 8× with sound on (no errors from audio paths).
  Human listen check flagged for user (cannot automate timbre judgement).

## P8 — Integration & polish (gate: all features coexist; offline build works)
- Full-para wiring: cutaway vs camera turns during matches, follow cam during rally,
  scoreboard/feed/panel live, night LED board, trophy ceremony end-to-end,
  skip-ceremony button, auto-next, pause/speed, phone layout stacking.
- QA-P8: scripted browser session: new match → mid-match camera/mode/surface/TOD
  changes → skip to trophy → new match again; screenshots at 8 checkpoints.
  `build.py --offline` output tested the same way (file:// direct navigation).

## P9 — Perf & hardening (gate: 60 fps desktop / ≥30 fps phone, release)
- Perf pass: draw-call budget re-check, GC pressure (no per-frame allocs in hot
  paths), phone layout, touch controls, `?layout=phone` viewport 390×844 screenshots.
- QA-P9: 60 s animation frame-rate sample (DEBUG.fps avg), desktop + phone layouts;
  final 12-combo replay at 4× smoke; deliverable checks: no external refs besides
  cdnjs (desktop), zero external refs (offline), dupcheck clean, ARCH/CONTRACT
  cross-checked (BUS catalogue == emitted events).

## Deliverable checklist (end)
- dist/hollybrook-open.html (artifact), dist/hollybrook-open-offline.html,
  qa/<phase>/ screenshots archived, CONTRACT.md matches implementation, dupcheck
  clean, all P-gates documented as passed.
