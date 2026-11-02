# Hollybrook Open — 3D Pixel-Art Tennis Diorama — ARCHITECTURE

Derived from TENNIS-DIORAMA.md. Companion docs: PLAN.md (phased build+QA), CONTRACT.md
(frozen module-facing contract, authored at end of P0).

## 1. Deliverables & hard constraints
- ONE self-contained page: `dist/hollybrook-open.html` (three.js r128 from cdnjs) and
  `dist/hollybrook-open-offline.html` (three r128 inlined, fully offline).
- External assets: ONLY `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`.
- No localStorage, no eval, no alert. All textures/sounds procedural. English UI.
- Fictional names only (tournament "Hollybrook Open"; sponsors invented).

## 2. Source layout & build
```
/ (workdir)
  ARCH.md  PLAN.md  CONTRACT.md
  build.py            # concatenates src/ files between markers -> dist html
  dupcheck.py         # global-name guard (see §4)
  vendor/three.r128.min.js   # cached once for --offline build
  src/
    shell-head.html   # <!doctype>, CSS, control-panel DOM, canvas host
    shell-tail.html   # </body> etc.
    cfg.js            # HB.CFG constants, roster, sponsors, palette table
    util.js           # rng, oklab, lerp, mergeGeoms, clamp, ease
    core-bus.js       # HB.bus event hub
    core-sched.js     # coroutine scheduler + watchdogs
    core-pipeline.js  # renderer, RT, post shader (palette+dither+outline)
    core-camera.js    # ortho iso rig, input, modes, cutaway hook
    core-light.js     # sun/hemi/floodlight presets (day/dusk/night)
    core-nav.js       # NAV grid + A*
    court.js  grounds.js  club.js  people.js  kin.js  ball.js
    rally.js  flow.js  crowd.js  audio.js  ui.js
  dist/  qa/<phase>/*.png
```
`build.py` wraps all JS in one IIFE `(function(){'use strict'; ...})();` and inserts
`vendor/three.r128.min.js` content when `--offline`. Every module file must register
via `HB.reg('name', api)` and touch **no other globals**.

## 3. Namespacing
Single global `window.HB`. Sub-namespaces (asserted unique at boot in dev mode):
```
HB.CFG   constants: dims, palette[90], roster, sponsors, timings
HB.UTIL  helpers
HB.CORE  bus, sched, pipeline, camera, light, nav, rng(seed)
HB.COURT court, lines, net, sponsor boards, bounce marks
HB.GROUNDS island, plaza, marquee, garden, practice court
HB.CLUB  clubhouse, clock, flags, stands (cutaway), video board, floodlights
HB.PEOPLE rig factory + actors (players, umpire, line judges, ball kids)
HB.KIN   shot solver (start/target/clearance/spin -> v0)
HB.BALL  ball mesh, physics step, net cord, marks
HB.RALLY rally AI, error model, coach intents, calibration harness
HB.FLOW  match flow generator, scoring, officials, ceremony
HB.CROWD instanced crowd + fx (confetti, applause)
HB.AUDIO WebAudio synth engine
HB.UI    panel, scoreboard, match centre, feed, coach controls
HB.DEBUG qa hooks (see §10)
```

## 4. dupcheck rules
`dupcheck.py` fails the build if:
- any `window.` assignment other than `window.HB` exists;
- any module file assigns to an `HB.X` namespace not listed in §3 or duplicates one;
- any two modules register the same api key via `HB.reg`;
- reserved JS/global names (document, addEventListener, …) are shadowed at top level.
Dev boot also walks `HB` and throws on duplicate leaf keys.

## 5. World conventions
- Units = metres, Y up. Court centre at origin. Singles court 23.77 × 8.23 m.
  ROTATED per stadium convention (P1b revision): LONG axis along X — baselines
  x=±11.885, net plane x=0 spanning z=±(5.485+0.914) posts, singles lines z=±4.115.
  Camera (south, +Z) sees the court broadside; big stands on N/S sidelines.
- Default camera looks from south (+Z). North stand behind court; clubhouse beyond it;
  west stand; east stand; south stand is the cutaway one (faces camera by default).
- Island top ellipse ~64 × 40 m (x ∈ [-32,32], z ∈ [-20,20]); plaza/marquee south-west,
  garden south-east, practice court west, 4 floodlight masts at (±18, ±14).
- NAV grid 1 m cells over island top; court apron walkable; stands/buildings blocked.
  A* 8-neighbour, diagonal cost 1.414. People use exact court coords on court.

## 6. Render pipeline
1. Scene pass → WebGLRenderTarget sized ceil(w/pixelSize) × ceil(h/pixelSize),
   NearestFilter, DepthTexture attached.
2. Fullscreen post pass to canvas (antialias off, no shadows from lights):
   - depth-based outline (screen-space depth gradient, 1 px, palette darkest shade);
   - colour quantize to the fixed 90-colour palette via OKLab nearest-neighbour
     (palette uploaded as 90×1 LUT texture, OKLab conversion in GLSL);
   - Bayer 8×8 ordered dither added in luminance before snapping (no colour fringing).
3. HTML/CSS overlays (scoreboard, feed, panel) above canvas — untouched by pixel pass.
- Palette: 90 fixed RGB triples in HB.CFG.palette —
  greys 8, skin/hair 6, grass 8, clay 8, hard 7, carpet 6, court paint 8,
  kit accents 16, wood/stone 12, foliage 6, neon/LED 5.
- "Pixel size" slider 1–6 (default 2) re-sizes the RT live.

## 7. Camera rig
- Orthographic, default elevation 31° (drag-tilt clamped 10°–60°), azimuth 0° (from south).
- Q/E: quarter turns ±90° (0.6 s ease); wheel: ortho zoom (dolly feel); drag: orbit /
  pan. Follow modes: `tv` (frame ball + players, smooth), `club` (fit island), `close`
  (near-net). Modes & slider are HB.UI-driven, state on HB.CORE.camera.
- Doll's-house cutaway: each cutaway object carries a face normal; when the camera's
  quadrant faces that side, stand/wall lifts up + fades (0.4 s), restoring when turned.

## 8. Coroutine scheduler (HB.CORE.sched)
- `HB.CORE.task(gen, {name, timeout})` — generator-driven; yields:
  `HB.wait(s)` (scaled seconds), `HB.until(fn)`, `HB.par([...gens])`, `HB.seq([...])`.
- Time scale: `HB.CORE.speed` (0.5–8×, UI) scales scheduler + ball physics dt.
- **Watchdogs**: every yield carries max-block; point timeout 25 s, ball-lost 12 s,
  ceremony-node 30 s → default path force-resume + `match:watchdog` log. Match never
  hard-locks; pause is the only full stop.

## 9. BUS event catalogue (subset; full list in CONTRACT.md)
```
cam:*  cam:mode cam:turn cam:cutaway
world: surface:set(p) tod:set(d)
match: match:new phase:<name> point:start serve:hit serve:fault serve:let
       rally:hit ball:bounce{surface,in,loc} ball:netcord call:line
       call:umpire challenge:start|result point:end{winner,how,shots}
       game:end tb:start changeover ends:swap set:end match:end trophy
crowd: react(level) audio:all(ui-sourced) coach:aim coach:tactic ui:log
```
Consumers: AUDIO (sfx), CROWD (reactions), UI (feed/scoreboard/stats), FLOW (orchestrates
others). Producers: FLOW, BALL, RALLY, CAMERA, UI. No cross-calls except via BUS.

## 10. Data models
Player: `{id,name,sex,kit:{shirt,shorts,skin,hair},hand,pow,place,cons,
serve:{kphMean,sd,dir:{w,b,t},dRate},tactic:{net,drop,lob,risk}}` (0–100 scales).
Roster (fictional): Dario Voss (M), Milo Andersson (M), Priya Anand (W), Jana Kovář (W).
Match: `{format:'short|set|bo3', surface, tod, players[2],
 state, server, ends, score:{pts_raw, games[2][], sets[], tb},
 stats:{firstIn, aces, dfs, firstWon, secondWon, fastest{kph,who},
        rallyShots[], winners[], errors[]}, reviews:{left[2],log[]}}`.
Formats: short = FAST4 (4 games, tb@3-3); set = 6-game w/ tb@6-6; bo3 = 2 sets + tb@6-6,
3rd set super-tb(10). Scoring engine in HB.FLOW is pure + unit-testable via HB.DEBUG.

## 11. Tennis physics & AI
- BALL: fixed substeps 1/120 s. Gravity, quadratic drag, Magnus (S·ω×v), per-surface
  bounce {restitution, μ, skid, roll}: grass 0.62 low-skid, clay 0.68 high-skid,
  hard 0.71, carpet 0.66 fast; net plane collision w/ cord clip randomness.
- KIN: solve v0 for target point + net clearance + spin (iterative w/ drag); aim error
  applied to T *before* solve ⇒ real misses (long/wide/net) instead of coin flips.
- RALLY error model targets: first-serve 60–65 %, aces 4–8 %, DF 2–4 %, mean rally
  4–7 shots (grass/carpet −, clay +). Calibration: `?qa=calib` runs 2000 headless
  points, prints table, compares to targets (see PLAN P6).
- Coach: tactic radio (go-for-it/safe/rush-net/drop/lob), serve direction, aim-next:

## 12. Audio (off until user enables)
AudioContext created only on first enable gesture. Graph: master → {hit(bandpass noise,
pitch by spin), bounce(sine thump, per-surface), net buzz, line-call beep, umpire chime,
crowd bed(looped filtered noise + LFO) , cheer bursts (BUS-driven envelopes)}.

## 13. Surfaces / time-of-day
- `surface:set` repaints court materials + marks tint; bounce params in HB.CFG.
- `tod:set` swaps sun/hemi/floodlights, emissive intensities (boards/LED/lamps),
  sky/fog gradient; night = floodlight masts only.

## 14. Debug/QA hooks (HB.DEBUG)
- `window.__hbErrs[]` via window.onerror + unhandledrejection.
- `?surface=grass|clay|hard|carpet&tod=day|dusk|night&view=tv|club|close&layout=phone
  &pix=n&speed=x&qa=match|calib&ff=sec&nomenu=1` boot params (QA-only).
- `HB.DEBUG.state()`, `HB.DEBUG.ff(s)` fast-forward scheduler, `HB.DEBUG.stats()`,
  `HB.DEBUG.runMatch(fmt,surf)` → resolves with score+stats summary (P7+).
- renderer.info draw-call count exposed for perf budget: ≤60 static draw calls.

## 15. Performance budget
InstancedMesh crowd (~450 seats), merged static geometry per material, blob shadows
(no shadow maps), low-res pipeline is cheap; 60 fps desktop, ≥30 fps phone (P9 gate).
