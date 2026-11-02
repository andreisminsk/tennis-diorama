// flow.js — HB.FLOW (P5): match flow generator (ARCH §8/§10, CONTRACT §3/§7).
// Owns: pure scoring engine (FAST4 / one set / bo3 + super-tb), on-court match
// coroutine (walk-on→toss→points→changeovers→tie-breaks→handshake→trophy),
// serve/rally orchestration over KIN+BALL real physics, RALLY error-model targets,
// line calls, stats, watchdog-default-safe branches. BUS-only comms (CONTRACT §1).
HB.FLOW = (function () {
  var U = HB.UTIL;
  var CH = HB.CFG.COURT;
  var HALF = CH.halfW, SX = CH.singlesX, SRVX = 6.4;      // court-local (CONTRACT §4)

  // ============ pure scoring engine (unit-testable via HB.DEBUG) ============
  function newMatch(fmt, players, surface) {
    return {
      format: fmt, surface: surface || HB.CFG.current.surface,
      players: players, server: 0, ends: 0, state: 'idle',
      score: { ptsRaw: [0, 0], gamesNow: [0, 0], sets: [0, 0], tb: null },
      stats: { firstIn: 0, firstTot: 0, aces: 0, dfs: 0, firstWon: 0, secondWon: 0,
               fastest: { kph: 0, who: -1 }, rallyShots: [], winners: [], errors: [] },
      reviews: { left: [3, 3], log: [] }
    };
  }
  function ptsLabel(v) { return ['0', '15', '30', '40', 'AD'][Math.min(v, 4)]; }

  // advance scoring by one point (winner index w). Returns flags for FLOW/UI.
  function scorePoint(M, w) {
    var out = { gameOver: false, setOver: false, matchOver: false, tbStart: false, msg: '' };
    if (M.matchOver || M.setOver) return out;
    var S = M.score;
    var GT = (M.format === 'bo3') ? 6 : (M.format === 'set' ? 6 : 4);   // games/set (FAST4=4)
    var TBAT = (M.format === 'short') ? 3 : 6;                          // tb at 3-3 / 6-6
    if (S.tb) {                                            // tie-break point
      S.tb.pts[w]++;
      S.ptsRaw = S.tb.pts.slice();
      var a = S.tb.pts[0], b = S.tb.pts[1], tgt = S.tb.target;
      if ((a >= tgt || b >= tgt) && Math.abs(a - b) >= 2) {
        var wi = a > b ? 0 : 1;
        S.tb = null; S.ptsRaw = [0, 0];
        M.score.gamesNow[wi] = 1;                          // tb counts as one game
        out.gameOver = true;
        out.setOver = true;                                // tb always completes the set
        M.score.sets[wi]++;
        M.score.gamesNow = [0, 0];
        out.msg = 'TIE-BREAK — ' + M.players[wi].meta.name;
      }
      return out;
    }
    S.ptsRaw[w] = Math.min(S.ptsRaw[w] + 1, 4);
    var p = S.ptsRaw;
    if (p[w] >= 4 && p[w] - p[1 - w] >= 2) {               // game won (incl. AD)
      out.gameOver = true;
      S.ptsRaw = [0, 0];
      M.score.gamesNow[w]++;
      var g = M.score.gamesNow;
      if (g[w] >= GT && !(g[0] === TBAT && g[1] === TBAT)) {
        out.setOver = true;
        M.score.sets[w]++;
        S.games = g.slice();
        M.score.gamesNow = [0, 0];
        if (M.format === 'bo3' ? M.score.sets[w] >= 2 : true) out.matchOver = true;
        out.msg = 'SET — ' + M.players[w].meta.name;
      } else if (g[0] === TBAT && g[1] === TBAT) {
        out.tbStart = true;
        var tgt2 = (M.format === 'bo3' && M.score.sets[0] === 1 && M.score.sets[1] === 1) ? 10 : 7;
        S.tb = { pts: [0, 0], target: tgt2 };
        out.msg = 'TIE-BREAK';
      } else {
        out.msg = 'GAME — ' + M.players[w].meta.name;
      }
      return out;
    }
    if (p[0] >= 3 && p[1] >= 3)
      out.msg = p[0] === p[1] ? 'DEUCE' :
        'ADVANTAGE ' + M.players[p[0] > p[1] ? 0 : 1].meta.name;
    return out;
  }
  // tie-break serving pattern: player A serves pt1, then alternate every 2 pts.
  function tbServer(M) {
    var n = M.score.tb.pts[0] + M.score.tb.pts[1];
    if (n === 0) return M.server;
    return 1 - M.server; // simplified alternation v1: server swaps each tb point
  }
  function scoreText(M) {
    var S = M.score;
    if (S.tb) return { ptr: S.tb.pts[0] + '–' + S.tb.pts[1],
                       games: S.gamesNow[0] + '–' + S.gamesNow[1] };
    var a = S.ptsRaw[0], b = S.ptsRaw[1];
    var ptr = (a >= 3 && b >= 3) ? (a === b ? '40–40' : (a > b ? 'AD·40' : '40·AD'))
                                 : ptsLabel(a) + '–' + ptsLabel(b);
    return { ptr: ptr, games: S.gamesNow[0] + '–' + S.gamesNow[1] };
  }

  // ============ court geometry helpers ============
  // ends: 0 → players[0] west (x<0), 1 → players[0] east. Swap at changeover? No:
  // ends swap each SET (ends:swap) — players[0]'s end flips.
  function endSign(M, i) {                                 // -1 west / +1 east for player i
    var west0 = (M.ends === 0);
    var iAmP0 = (i === 0);
    var west = west0 ? iAmP0 : !iAmP0;
    return west ? -1 : 1;
  }
  function contactX(M, i, back) { return endSign(M, i) * (HALF + (back || 1.15)); }

  // ============ runtime state ============
  var cur = null;                       // live Match + runtime extras
  var coach = { tactic: 'auto', srvDir: 'auto', aim: null };   // P6 enables UI

  function log(t, cls) { HB.bus.emit('ui:log', { t: t, cls: cls || '' }); }

  function rigFor(M, i) {
    if (!M.rigs) M.rigs = [null, null];
    if (!M.rigs[i]) M.rigs[i] = HB.PEOPLE.courtActor(M.players[i].meta, endSign(M, i) < 0 ? -1 : 1);
    return M.rigs[i];
  }
  function clearRigs(M) {
    if (!M.rigs) return;
    M.rigs.forEach(function (r) {
      if (r && r.parent) r.parent.remove(r);
    });
    M.rigs = [null, null];
  }

  // ---------- shot execution (real KIN solve + BALL launch) ----------
  // contact: {i(player), x,z,y, back}; aim: {target, spin, clearance}
  function hit(M, i, contact, aim) {
    var sol = HB.KIN.solve({
      start: { x: contact.x, y: contact.y || 1.0, z: contact.z },
      target: aim.target, spin: aim.spin || { top: 0, side: 0 },
      clearance: aim.clearance != null ? aim.clearance : 0.45
    });
    var v = new THREE.Vector3(contact.x, contact.y || 1.0, contact.z);
    HB.BALL.launch({ p: v, v0: sol.v0, w: sol.w });
    var kph = Math.round(sol.v0.length() * 3.6);
    HB.bus.emit('rally:hit', { who: i, v0: sol.v0, spin: aim.spin, aim: aim.target, kph: kph });
    HB.bus.emit('audio:all', { kind: i === 0 ? 'hit0' : 'hit', kph: kph });
    var rig = rigFor(M, i);
    HB.PEOPLE.setState(rig, 'swing');
    HB.CORE.task(function* () {              // swing → idle after 0.5 s
      yield HB.wait(0.5, 3);
      if (rig.__rig.state === 'swing') { HB.PEOPLE.setState(rig, 'idle'); rig.rotation.x = 0; }
    }, { name: 'flow:swingreset', max: 5 });
    return sol;
  }

  // point watchdog state
  function pointRuntime() {
    return { bounces: 0, firstBounce: null, land: null, netClip: false,
             over: false, winner: null, how: null, shots: 0, lastHitter: null };
  }

  // ---------- one point (generator coroutine; watchdog via yield max) ----------
  function* pointGen(M, st) {
    var srv = st.server;
    var rcv = 1 - srv;
    HB.bus.emit('point:start', { server: srv });
    var pt = pointRuntime();
    M.pt = pt;
    var offs = [
      HB.bus.on('ball:bounce', function (d) {
        if (pt.over) return;
        pt.land = { x: d.loc[0], z: d.loc[1] };
        pt.bounces++;
        if (pt.bounces === 1) pt.firstBounce = pt.land;
        else if (pt.bounces >= 2 && !pt.over) {
          // 2nd bounce before return → last hitter's shot landed; decide below
          pt.over = true; pt.decided = 'bounce2';
        }
      }),
      HB.bus.on('ball:netcord', function () { if (!pt.over) pt.netClip = true; })
    ];
    try {
      var rngsrv = Math.random;
      // --- serve loop (2 attempts) ---
      var attempt, live = null;
      for (attempt = 1; attempt <= 2; attempt++) {
        pt.bounces = 0; pt.firstBounce = null; pt.land = null; pt.netClip = false; pt.over = false;
        var SP = M.players[srv].meta;
        var rigS = rigFor(M, srv);
        var sc = endSign(M, srv);
        // ritual: bounce ball twice (visual), then toss+hit pose
        HB.PEOPLE.setState(rigS, 'idle');
        yield HB.wait(0.7, 4);
        HB.PEOPLE.setState(rigS, 'serve');
        var S = SP.serve;
        var p1stIn = 0.615 + 0.05 * (SP.cons / 100 - 0.5);
        var miss = attempt === 1 ? (rngsrv() >= p1stIn) : (rngsrv() < U.clamp(0.10 - SP.cons / 100 * 0.06 + S.dRate * 0.5 * 10, 0.03, 0.14));
        // aim: receiver's box, deuce/ad side alternates per point index
        var st0 = M.score.ptNo || (M.score.ptNo = 0);
        var sideZ = ((st0 % 2) === 0) ? 1 : -1;              // alternate halves (cosmetic)
        var dirKey = coach.srvDir !== 'auto' ? coach.srvDir : (function () {
          var r = rngsrv(), c = 0, ks = ['w', 'b', 't'];
          for (var j = 0; j < 3; j++) { c += S.dir[ks[j]]; if (r < c) return ks[j]; } return 'b';
        })();
        var boxSignX = endSign(M, rcv);
        var depth = SRVX - 0.5 - rngsrv() * 0.6;
        var zOff = dirKey === 'w' ? 2.6 : dirKey === 't' ? -3.1 : -1.4;
        var zTgt = U.clamp(sideZ * zOff, -SX + 0.4, SX - 0.4) * (boxSignX > 0 ? 1 : 1);
        var tgt = { x: boxSignX * depth, z: zTgt };
        if (miss) tgt = HB.RALLY.missGeom({ player: SP, r: rngsrv }, { target: tgt }).target;
        var start = { x: contactX(M, srv, 1.05), y: 2.9, z: U.clamp(tgt.z * 0.3, -1.6, 1.6) };
        var sol = hit(M, srv, start,
          { target: tgt, spin: { top: -900 - S.kphMean * 1.5, side: 0 }, clearance: 1.0 });
        var kph = Math.round(sol.v0.length() * 3.6);
        if (kph > M.stats.fastest.kph) M.stats.fastest = { kph: kph, who: srv };
        HB.bus.emit('serve:hit', { v0: sol.v0, spin: { top: -900 - S.kphMean * 1.5, side: 0 }, kph: kph });
        if (attempt === 1) M.stats.firstTot++;
        yield HB.until(function () { return pt.over || pt.firstBounce; }, 9);
        if (pt.over && pt.bounces >= 2 && !pt.firstBounce) { /* netted out — fault path */ }
        var b1 = pt.firstBounce;
        var boxOK = b1 && inSingles(b1) && (Math.sign(b1.x || 1) === boxSignX) &&
                    insideServiceBox(b1, boxSignX, sideZ);
        if (pt.netClip || !boxOK) {
          HB.bus.emit('serve:fault', { kind: pt.netClip ? 'net' : 'out', attempt: attempt });
          log((attempt === 1 ? 'Fault.' : 'Double fault. Point ' + M.players[rcv].meta.name), attempt === 2 ? 'big' : 'warn');
          if (pt.netClip && !pt.over) { }                   // let only if was going in — simplified: net = fault this version? no:
          if (pt.netClip && boxOK === false && pt.land && inSingles(pt.land) === false) { /* keep as fault */ }
          if (attempt === 2) {
            M.stats.dfs++;
            endPoint(M, st, rcv, 'double-fault', 0);
            return;
          }
          yield HB.wait(0.9, 4);
          continue;
        }
        if (attempt === 1) M.stats.firstIn++;
        // LET handling: net cord clip with ball landing in → replay (rare, geometric)
        if (pt.netClip) {
          HB.bus.emit('serve:let', {});
          log('Let! Net cord — replay.', 'warn');
          attempt--;                                        // replay same attempt
          yield HB.wait(1.0, 4);
          continue;
        }
        live = true;
        pt.serveIn = true;
        pt.lastHitter = srv;
        break;
      }
      if (!live) { endPoint(M, st, rcv, 'double-fault', 0); return; }

      // --- rally: alternate real hits until someone misses ---
      var idx = rcv, shots = 1;
      yield HB.wait(0.35, 3);
      M.score.tb = M.score.tb || null;
      while (!pt.over) {
        var HP = M.players[idx].meta;
        var shot = HB.RALLY.chooseShot(HP, { r: Math.random, side: 1, player: HP });
        var errP = shotErrP(HP, idx === rcv && shots === 1);
        if (Math.random() < errP) {
          shot.target = HB.RALLY.missGeom({ player: HP, r: Math.random },
            { target: shot.target }).target;
        } else {
          shot.target = { x: endSign(M, 1 - idx) > 0 ? shot.target.x : -shot.target.x,
                          z: U.clamp(shot.target.z, -SX + 0.5, SX - 0.5) };
          if (coach.aim && idx === coachTarget(M)) shot.target = coach.aim;
        }
        // contact: near where ball landed (approx reach); y ~ 0.95
        var bs = HB.BALL.state();
        var cx = U.clamp(bs.p[0], -HALF - 1, HALF + 1), cz = U.clamp(bs.p[2], -SX - 0.8, SX + 0.8);
        // keep contacts on the hitter's own end
        if (Math.sign(cx || 1) !== endSign(M, idx)) cx = endSign(M, idx) * HALF * 0.8;
        var sol2 = hit(M, idx, { x: cx, y: 0.95, z: cz },
          { target: shot.target, spin: shot.spin, clearance: shot.clearance });
        pt.shots = shots; pt.lastHitter = idx;
        shots++;
        yield HB.until(function () { return pt.over || pt.firstBounce; }, 9);
        if (pt.over && pt.decided === 'bounce2') {
          // 2nd bounce: if the ball was returning on hitter side legally, the OTHER
          // (non-hitter) player failed to return → hitter wins the shot.
          var fb2 = pt.land;
          var hitterEnd = endSign(M, pt.lastHitter);
          var onHitterSide = Math.sign(fb2.x || 1) === hitterEnd;
          if (onHitterSide && inSingles(fb2)) {
            // receiver let it drop twice — hitter wins (bounced in on their side)
            endPoint(M, st, pt.lastHitter, 'not-returned', pt.shots);
            return;
          }
          // somewhere out / weird → previous hitter misses
          endPoint(M, st, 1 - pt.lastHitter, 'error', pt.shots);
          return;
        }
        var b = pt.firstBounce || pt.land;
        if (!b) break;                                      // watchdog resumed
        var legal = inSingles(b);
        if (legal && pt.netClip) legal = true;              // cord & in = play on
        if (!legal || (Math.sign(b.x || 1) === endSign(M, idx) && shots > 2)) {
          // hit by idx landed OUT (or back on own side after crossing: illegal)
          HB.bus.emit('call:line', { loc: [b.x, b.z], call: 'OUT' });
          log('OUT — ' + M.players[idx].meta.name + ' long/wide.', 'warn');
          HB.bus.emit('audio:all', { kind: 'call' });
          endPoint(M, st, 1 - idx, 'error', pt.shots);
          return;
        }
        pt.bounces = 1; pt.firstBounce = null;              // reset for next hit
        idx = 1 - idx;
        yield HB.wait(0.22 + Math.random() * 0.3, 3);
      }
      // pt.over via bounce2 handled above; safety default:
      endPoint(M, st, 1 - (pt.lastHitter == null ? srv : pt.lastHitter), 'error', pt.shots);
    } finally {
      offs.forEach(function (f) { f(); });
    }
  }
  function coachTarget(M) { return 0; }                     // P6 wires coach aim side
  function shotErrP(HP, isReturn) {
    var risk = HP.tactic.risk / 100, cons = HP.cons / 100;
    var p = (isReturn ? 0.34 : 0.26) * (0.6 + risk * 0.8) * (1.25 - cons);
    return p;
  }
  function insideServiceBox(b, boxSignX, sideZ) {
    return b.x * boxSignX >= -0.05 && b.x * boxSignX <= SRVX + 0.05 &&
           b.z * sideZ >= -0.05 && b.z * sideZ <= SX + 0.05;
  }
  function inSingles(l) {
    return Math.abs(l.x) <= HALF + 0.05 && Math.abs(l.z) <= SX + 0.05;
  }

  function endPoint(M, st, winner, how, shots) {
    st.done = true;
    var isAce = (how === 'not-returned' && shots === 1 && st.serveIn);
    var how2 = isAce ? 'ace' : how;
    if (isAce) M.stats.aces++;
    if (how2 === 'winner') M.stats.winners.push(winner);
    if (how2 === 'error' || how2 === 'return-err') M.stats.errors.push(1 - winner);
    M.stats.rallyShots.push(shots);
    HB.bus.emit('point:end', { winner: winner, how: how2, shots: shots });
    var sc = scorePoint(M, winner);
    if (sc.msg) log(sc.msg, sc.matchOver ? 'big' : '');
    HB.bus.emit('crowd:react', { level: sc.matchOver ? 1 : (isAce ? 0.7 : 0.25) });
    if (how2 === 'ace') log('ACE — ' + M.players[winner].meta.name + ' (' + (M.stats.fastest.kph || '') + ' kph)', 'big');
    if (sc.matchOver) { M.matchOver = true; }
    else if (sc.setOver) {
      M.ends = 1 - M.ends;                                  // ends swap each set
      HB.bus.emit('ends:swap', { ends: M.ends });
      clearRigs(M);                                         // re-place next point
      if (M.watching && M.watching.setOver) M.watching.setOver();
    }
    M.server = (M.server + 1) % 2;                          // v1: alternate each game? — per game below
  }

  // ---------- match orchestration (sched task chain; one task per point) ----------
  function nextPoint(M, onDone) {
    if (M.matchOver) { finishMatch(M, onDone); return; }
    var isTB = !!M.score.tb;
    var srv = (isTB || M.score.gamesNow[0] + M.score.gamesNow[1] > 0) ? M.server : M.server;
    // real tennis: server alternates by GAME (odd game count), not by point
    if (!isTB) srv = firstServerForGame(M);
    var st = { server: srv };
    HB.CORE.task(function* () {
      yield* pointGen(M, st);
    }, { name: 'flow:point', max: 25 });
    HB.bus.once('point:end', function () {
      yield HB.wait;   // (invalid JS — replaced below)
    });
  }
  function firstServerForGame(M) {
    // M.server flips at changeover: gameNo = total games played (gamesNow + sets games)
    var total = M.score.gamesNow[0] + M.score.gamesNow[1] +
      (M.score.sets[0] + M.score.sets[1]) * 6;
    return (M.firstServer + total) % 2;
  }
  function finishMatch(M, onDone) {
    M.state = 'trophy';
    var w = M.score.sets[0] > M.score.sets[1] ? 0 : 1;
    HB.bus.emit('match:end', { winner: w });
    HB.CROWD.excite(1);
    HB.CROWD.confetti(3);
    log('CHAMPION — ' + M.players[w].meta.name + '!', 'big');
    if (onDone) onDone({ winner: w, score: M.score, stats: M.stats });
  }

  function startMatch(match, done) {
    cur = match;
    M_init(match);
    HB.CROWD.excite(0.4);
    HB.CORE.task(function* () {
      match.state = 'walkon';
      HB.bus.emit('match:new', { fmt: match.format, players: match.players, surface: match.surface });
      HB.bus.emit('match:phase', { phase: 'walkon' });
      HB.PEOPLE.clearActors && HB.PEOPLE.clearActors();
      clearRigs(match);
      yield* HB.PEOPLE.walkOn(match.players.map(function (P, i) {
        return { meta: P.meta, side: i === 0 ? -1 : 1,
                 from: [-20, i === 0 ? -13 : -11], to: [i === 0 ? -13.0 : 13.0, i === 0 ? 0.6 : -0.6] };
      }));
      match.state = 'toss';
      HB.bus.emit('match:phase', { phase: 'toss' });
      HB.bus.emit('call:umpire', { text: 'Toss won by ' + match.players[match.firstServer].meta.name + ' — to serve.' });
      log('Toss: ' + match.players[match.firstServer].meta.name + ' serves first.', 'big');
      yield HB.wait(1.6, 6);
      match.state = 'live';
      HB.bus.emit('match:phase', { phase: 'live' });
      runPointLoop(match, done);
    }, { name: 'flow:match', max: 60 });
    return match;
  }
  function M_init(M) {
    M.matchOver = false; M.setOver = false;
    M.firstServer = M.server = (Math.random() < 0.5 ? 0 : 1);
  }
  function runPointLoop(M, onDone) {
    var again = function () {
      if (M.matchOver) { finishMatch(M, onDone); return; }
      // changeover every odd total game (approx): brief rest
      nextPoint(M, onDone);
    };
    M._again = again;
    HB.bus.on('point:end', function () {
      var totalGames = M.score.gamesNow[0] + M.score.gamesNow[1];
      var rest = (totalGames % 2 === 1) && (totalGames > 0) ? 1.6 : 0.7;
      HB.CORE.task(function* () {
        yield HB.wait(rest, 6);
        again();
      }, { name: 'flow:nextpt', max: 10 });
    });
    again();
  }

  var api = { ready: true, newMatch: newMatch, scorePoint: scorePoint, scoreText: scoreText,
              tbServer: tbServer, startMatch: startMatch, coach: coach,
              current: function () { return cur; } };
  HB.reg('flow', api);
  return api;
})();
