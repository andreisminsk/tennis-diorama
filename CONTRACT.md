# Hollybrook Open — CONTRACT (frozen at end of P0)

Module-facing rules. ARCH.md is prose; this file is the enforced interface.
Change requires updating ARCH/CONTRACT together in the same phase PR.

## 1. Global rules (dupcheck-enforced)
- Exactly one new global: `window.HB` (+ QA error sink `window.__hbErrs`).
- Every module file: zero top-level `var`/`function` leakage beyond its IIFE-ish
  namespace object; registers via `HB.reg('<key>', api)`; touches no other global.
- Namespace owners (single author file each): CORE←core-*.js|boot.js,
  CFG←cfg.js, UTIL←util.js, DEBUG←debug.js; one of COURT/GROUNDS/CLUB/PEOPLE/KIN/
  BALL/RALLY/FLOW/CROWD/AUDIO/UI per its §2 file. `HB.wait/until/par/seq` (core-sched).
- Forbidden anywhere: `alert(`, `eval(`, `localStorage(`, `document.write(`.
- `HB.CORE` object created by cfg.js (first file). Boot order = build MANIFEST order;
  `boot.js` runs `HB.CORE.boot.start()` last and must stay last.

## 2. Registration keys (HB.api)
cfg debug util bus sched pipeline camera light nav boot court grounds club
people kin ball rally flow crowd audio ui

## 3. BUS catalogue (authoritative)
```
ui:ready ui:newmatch ui:log coach:aim coach:tactic
world:boot surface:set{surface} tod:set{tod}
cam:mode{mode} cam:turn{dir,azT} cam:cutaway{quad,az}
match:new{fmt,players,surface} match:phase{phase} point:start{server}
serve:ritual serve:toss serve:hit{v0,dir,spin} serve:fault{kind} serve:let
rally:hit{who,v0,spin,aim} ball:bounce{surface,in,loc,vy} ball:netcord{clip}
call:line{loc,call} call:umpire{text} challenge:start{who,loc} challenge:result{ok}
point:end{winner,how,shots} game:end{winner,pts} tb:start changeover ends:swap
set:end{i,winner} match:end{winner} trophy{}
crowd:react{level} audio:all{kind,...} match:watchdog{task,blocked}
debug:spawn{name} debug:runmatch{fmt,surf,done}
```
- Consumers never call producer modules directly — BUS only. UI is source of
  coach:* / ui:*; FLOW is source of match:* except ball/serve physics detail from
  BALL/RALLY. AUDIO reacts to audio:all + match events; CROWD to crowd:react.

## 4. Shared types (verbatim; JS, ES5 strings, no classes crossing modules)
```
Player  {id,name,sex,hand, kit:{shirt,shorts,skin,hair},
         pow,place,cons, serve:{kphMean,sd,dir:{w,b,t},dRate},
         tactic:{net,drop,lob,risk}}             // 0–100 skill scales
Aim     {x,z,depth:'N|W|B',spin:'S|T|B'|k}       // court-local metres, z+ = north
BallCmd {v0:{x,y,z}, w:{x,y,z}}                  // KIN → BALL launch
BounceP {rest,mu,skid,roll,speedMix,color}       // HB.CFG.bounce[surface]
Match    see ARCH §10 (score engine pure in FLOW; stats struct identical)
Path    [{x,z},...]                              // world waypoints, A* output
Task    sched: {name,max,done, onDone(cb), yield_}
```
Court-local coords (rotated P1b): origin centre, LONG axis along X — x along
court (±11.885 baselines), z across (±5.485 doubles), net plane x=0, +z = south
(default camera side). World coords identical (court at 0,0).

## 5. World conventions (ARCH §5 normative)
- Metres, Y up, ortho cam elev 31°, az 0 = from +Z (south). Island ellipse
  rx32 rz20. North (−z): main stand + clubhouse. West (−x): practice court. East:
  garden+marquee side; plaza SW. Masts (±18,±14). NAV grid 1 m, x∈[−32,32], z∈[−20,20].
- Stands/walls facing the camera fade out on cam:cutaway quadrant change
  (CUTAWAY faces: north stand quad 0/3 boundary, west quad 1, south quad 2).
- Surfaces: grass|clay|hard|carpet (HB.CFG.bounce). TODs: day|dusk|night.
  `surface:set` → COURT repaint + BALL params swap. `tod:set` → CORE.light applies.

## 6. Scheduler contract (core-sched)
- Yields ONLY: `HB.wait(s[,max])`, `HB.until(fn[,max])`, `HB.par([g][,max])`,
  `HB.seq([g][,max])`, bare number (`yield 2` = wait 2 s). Anything else parks 1 step.
- Watchdog defaults: point 25 s, ball 12 s, ceremony 30 s (`HB.CORE.sched.wd`).
  Overrun → force-resume + `match:watchdog` + __hbErrs tick (not a crash).
- `HB.CORE.speed` 0.5–8 scales sched + physics dt; pause stops stepping entirely.
- Long tasks must be resumable: watchdog resume re-enters the generator — FLOW
  authors code default-safe branches (point replay, skip stage).

## 7. Module API surface (v1)
```
CORE.pipeline  init(host,{dev,pixelSize}) render(scene,cam) setPixelSize(n) rebuild()
               P:{pixelSize,drawCalls,rw,rh}          // drawCalls = scene pass
CORE.camera    init(host) update(dt) turn(±1) setMode('tv|club|close')
               object() focus(x,y,z) state{mode,az,fit,target,quad}
CORE.light     init(scene) apply(tod) current presets
CORE.nav       path(ax,az,bx,bz)->Path|null rect() disc() setCell() blockedAt()
CORE.boot      start() scene()
COURT          (P1) build(scene) setSurface(s) cells() netInfo()
GROUNDS/CLUB   (P1b) build(scene) cutawayList()  // meshes tagged __cut:{face}
PEOPLE         (P3) makeRig(kit) walkOn(...) officials(scene)
KIN/BALL       (P4) solve(a,aim,opts)->BallCmd / step(dt) reset() marks()
RALLY/FLOW     (P5/P6) coachHook() startMatch(match, done)  // FLOW pure scoring
CROWD/AUDIO/UI seed(seats) enable() / init() updateMatch(d) log(t,cls)
```
Stubs already registered return `{ready:false}` — callers must feature-check.

## 8. QA contract (per phase)
Local server root = workdir; page at `/dist/hollybrook-open.html?<params>`.
Boot params (debug.js): `dev surface tod view pix speed qa ff nomenu layout`.
Every screenshot lands in `qa/<phase>/`; asserts on `__hbErrs`, draw budget ≤60,
watchdog-free points, dedup feed. `?dev=1` adds the bottom gradient QA strip.
```
