// flow.js — HB.FLOW (P5): match flow (ARCH §8/§10, CONTRACT §3/§7).
// Pure scoring engine (FAST4 / one set / bo3 + super-tb) + on-court coroutine:
// walk-on → toss → points (serve faults/lets, real-physics rallies, line calls,
// bounce-2 verdicts) → changeovers → tie-breaks → handshake → trophy. BUS-only.
HB.FLOW = (function () {
  var U = HB.UTIL;
  var CH = HB.CFG.COURT;
  var HALF = CH.halfW, SX = CH.singlesX, SRVX = 6.4;

  // ============ pure scoring engine ============
  function newMatch(fmt, metas, surface) {
    return {
      format: fmt, surface: surface || HB.CFG.current.surface,
      players: [{ meta: metas[0] }, { meta: metas[1] }],
      firstServer: 0, server: 0, ends: 0, gameNo: 0, state: 'idle',
      score: { ptsRaw: [0, 0], gamesNow: [0, 0], sets: [0, 0], tb: null, ptNo: 0 },
      stats: { firstIn: 0, firstTot: 0, aces: 0, dfs: 0,
               fastest: { kph: 0, who: -1 }, rallyShots: [], winners: [], errors: [] },
      reviews: { left: [3, 3], log: [] }
    };
  }
  function ptsLabel(v) { return ['0', '15', '30', '40', 'AD'][Math.min(v, 4)]; }

  // advance scoring one point (winner w). Pure except M.gameNo/M.score mutation.
  function scorePoint(M, w) {
    var out = { gameOver: false, setOver: false, matchOver: false, tbStart: false, msg: '' };
    if (M.matchOver) return out;
    var S = M.score;
    var GT = (M.format === 'short') ? 4 : 6;
    var TBAT = (M.format === 'short') ? 3 : 6;
    if (S.tb) {                                              // tie-break point
      S.tb.pts[w]++;
      S.ptsRaw = S.tb.pts.slice();
      var a = S.tb.pts[0], b = S.tb.pts[1], tgt = S.tb.target;
      if ((a >= tgt || b >= tgt) && Math.abs(a - b) >= 2) {
        var wi = a > b ? 0 : 1;
        S.tb = null; S.ptsRaw = [0, 0];
        out.gameOver = true; M.gameNo++;
        out.setOver = true;                                  // tb always completes the set
        M.score.sets[wi]++;
        S.gamesNow = [0, 0];
        if (M.format === 'bo3' ? M.score.sets[wi] >= 2 : true) out.matchOver = true;
        out.msg = 'SET & MATCH — ' + (out.matchOver ? M.players[wi].meta.name : '');
        if (!out.matchOver) out.msg = 'SET — ' + M.players[wi].meta.name;
      }
      return out;
    }
    S.ptsRaw[w] = S.ptsRaw[w] + 1;              // unbounded: 5-4 = AD, 6-5, 6-6→game
    var p = S.ptsRaw;                           // (clamping to 4 froze every deuce forever)
    if (p[w] >= 4 && p[w] - p[1 - w] >= 2) {                 // game won
      out.gameOver = true; M.gameNo++;
      S.ptsRaw = [0, 0];
      S.gamesNow[w]++;
      var g = S.gamesNow;
      // Set over: reached GT with a 2-game margin, or one PAST TBAT (7-5 /
      // FAST4 4-3). 6-5 continues; 6-6 / 3-3 → tie-break branch below.
      if (g[w] >= GT && (g[w] > TBAT || g[w] - g[1 - w] >= 2)) {
        out.setOver = true;
        M.score.sets[w]++;
        S.games = g.slice();
        S.gamesNow = [0, 0];
        if (M.format === 'bo3' ? M.score.sets[w] >= 2 : true) out.matchOver = true;
        out.msg = (out.matchOver ? 'MATCH — ' : 'SET — ') + M.players[w].meta.name;
      } else if (g[0] === TBAT && g[1] === TBAT) {
        out.tbStart = true;
        // FAST4 tie-break is to 5 (official rule); set tb 7; bo3 decider super-tb 10
        var tgt2 = (M.format === 'short') ? 5 :
          (M.format === 'bo3' && M.score.sets[0] === 1 && M.score.sets[1] === 1) ? 10 : 7;
        S.tb = { pts: [0, 0], target: tgt2, first: (M.firstServer + M.gameNo) % 2 };
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
  // tie-break serve order: pt1 by tb.first, then pairs alternate
  function tbServer(M) {
    var n = M.score.tb.pts[0] + M.score.tb.pts[1];
    return (M.score.tb.first + (n > 0 ? Math.floor((n + 1) / 2) : 0)) % 2;
  }
  function scoreText(M) {
    var S = M.score;
    if (S.tb) return { ptr: S.tb.pts[0] + '–' + S.tb.pts[1],
                       games: S.gamesNow[0] + '–' + S.gamesNow[1] };
    var a = S.ptsRaw[0], b = S.ptsRaw[1];
    var ptr = (a >= 3 && b >= 3) ? (a === b ? '40–40' : (a > b ? 'AD–40' : '40–AD'))
                                 : ptsLabel(a) + '–' + ptsLabel(b);
    return { ptr: ptr, games: S.gamesNow[0] + '–' + S.gamesNow[1] };
  }

  var cur = null;                       // live Match (startMatch sets)
  // ============ court helpers (CONTRACT §4 rotated axes) ============
  function endSign(M, i) {                                  // -1 west / +1 east
    var west0 = (M.ends === 0);
    return (west0 ? (i === 0) : (i !== 0)) ? -1 : 1;
  }
  function log(t, cls) { HB.bus.emit('ui:log', { t: t, cls: cls || '' }); }

  function rigFor(M, i) {
    if (!M.rigs) M.rigs = [null, null];
    if (!M.rigs[i]) M.rigs[i] = HB.PEOPLE.courtActor(M.players[i].meta, endSign(M, i) < 0 ? -1 : 1);
    return M.rigs[i];
  }
  function clearRigs(M) {
    if (!M.rigs) return;
    var live = HB.PEOPLE.actors();
    M.rigs.forEach(function (r) {
      if (r && r.parent) r.parent.remove(r);
      var k = live.indexOf(r);
      if (k >= 0) live.splice(k, 1);
    });
    M.rigs = [null, null];
  }

  // ---------- rig glide: destination on __rig, pose() strides there ----------
  function glide(rig, x, z) {
    if (rig && rig.__rig) rig.__rig.moveTo = { x: x, z: z };
  }
  function* glideWait(rig, x, z) {                            // walk, then settle
    glide(rig, x, z);
    yield HB.until(function () {
      var r = rig && rig.__rig;
      if (!r || !r.moveTo) return true;
      var dx = x - rig.position.x, dz = z - rig.position.z;
      return dx * dx + dz * dz < 0.06;
    }, 3.5);
  }

  // ---------- shot execution ----------
  function hit(M, i, contact, aim) {
    var sol = HB.KIN.solve({
      start: { x: contact.x, y: contact.y, z: contact.z },
      target: aim.target, spin: aim.spin || { top: 0, side: 0 },
      clearance: aim.clearance != null ? aim.clearance : 0.45
    });
    HB.BALL.launch({ p: new THREE.Vector3(contact.x, contact.y, contact.z),
                     v0: sol.v0, w: sol.w });
    var kph = Math.round(sol.v0.length() * 3.6);
    HB.bus.emit('rally:hit', { who: i, v0: sol.v0, spin: aim.spin, aim: aim.target, kph: kph });
    HB.bus.emit('audio:all', { kind: 'hit', kph: kph });
    var rig = rigFor(M, i);
    HB.PEOPLE.setState(rig, 'swing');
    HB.CORE.task(function* () {
      yield HB.wait(0.5, 3);
      if (rig.__rig.state === 'swing') HB.PEOPLE.setState(rig, 'idle');
    }, { name: 'flow:swingreset', max: 5 });
    return sol;
  }

  // ---------- one point (generator; watchdog via until-max) ----------
  function* pointGen(M, st) {
    var srv = st.server, rcv = 1 - srv;
    HB.bus.emit('point:start', { server: srv });
    var pt = { over: false, decided: null, shot: null, land: null, netClip: false,
               serveIn: false, shots: 0 };
    M.pt = pt;
    var offs = [
      HB.bus.on('ball:bounce', function (d) {
        if (pt.over) return;
        pt.land = { x: d.loc[0], z: d.loc[1] };
        if (pt.shot) {
          if (pt.shot.b1 == null) pt.shot.b1 = pt.land;
          else { pt.over = true; pt.decided = 'bounce2'; }   // no return in time
        }
      }),
      HB.bus.on('ball:netcord', function () { if (!pt.over) pt.netClip = true; })
    ];
    try {
      // --- serve (2 attempts; net-cord-in = let) ---
      var live = false;
      for (var attempt = 1; attempt <= 2 && !live; attempt++) {
        pt.shot = null; pt.land = null; pt.netClip = false;
        var SP = M.players[srv].meta, S = SP.serve;
        HB.PEOPLE.setState(rigFor(M, srv), 'idle');
        yield HB.wait(0.7, 4);                               // bounce ritual
        HB.PEOPLE.setState(rigFor(M, srv), 'serve');
        var p1stIn = 0.615 + 0.05 * (SP.cons / 100 - 0.5);
        var miss = (attempt === 1) ? (Math.random() >= p1stIn) :
          (Math.random() < U.clamp(0.10 - SP.cons / 100 * 0.06 + S.dRate * 2.5, 0.03, 0.14));
        var boxSignX = endSign(M, rcv);
        var sideZ = (M.score.ptNo % 2 === 1) ? 1 : -1;       // deuce/ad halves
        var dirKey = coach.srvDir !== 'auto' ? coach.srvDir : pickDir(S.dir);
        var depth = SRVX - 0.4 - Math.random() * 0.7;
        var zOff = dirKey === 'w' ? 2.7 : (dirKey === 't' ? -3.1 : -1.5);
        var tgt = { x: boxSignX * depth, z: U.clamp(sideZ * zOff, -SX + 0.4, SX - 0.4) };
        if (miss) tgt = HB.RALLY.missGeom({ player: SP, r: Math.random }, { target: tgt }).target;
        var contact = { x: endSign(M, srv) * (HALF + 1.05), y: 2.85,
                        z: U.clamp(tgt.z * 0.3, -1.6, 1.6) };
        var spin = { top: -900 - S.kphMean * 1.5, side: 0 };
        var sol = hit(M, srv, contact, { target: tgt, spin: spin, clearance: 1.05 });
        pt.shot = { hitter: srv, b1: null };
        var kph = Math.round(sol.v0.length() * 3.6);
        if (kph > M.stats.fastest.kph) M.stats.fastest = { kph: kph, who: srv };
        if (attempt === 1) M.stats.firstTot++;
        HB.bus.emit('serve:hit', { v0: sol.v0, spin: spin, kph: kph });
        yield HB.until(function () { return pt.shot.b1 != null || pt.over; }, 9);
        var b1 = pt.shot.b1;
        var boxOK = b1 && inSingles(b1) && Math.sign(b1.x || 1) === boxSignX &&
                    Math.abs(b1.x) <= SRVX + 0.05 &&
                    b1.z * sideZ >= -0.05 && b1.z * sideZ <= SX + 0.05;
        if (pt.netClip && boxOK) {                           // LET — replay
          HB.bus.emit('serve:let', {});
          log('Let — net cord; replay.', 'warn');
          attempt--; yield HB.wait(1.0, 4); continue;
        }
        if (!boxOK) {                                        // fault
          HB.bus.emit('serve:fault', { kind: pt.netClip ? 'net' : 'out', attempt: attempt });
          log(attempt === 1 ? 'Fault.' :
              'Double fault. Point ' + M.players[rcv].meta.name,
              attempt === 2 ? 'big' : 'warn');
          if (attempt === 2) {
            M.stats.dfs++;
            endPoint(M, rcv, 'double-fault', 0, false);
            return;
          }
          yield HB.wait(0.9, 4); continue;
        }
        if (attempt === 1) M.stats.firstIn++;
        live = true; pt.serveIn = true;                      // ball live; receiver up
      }

      // --- rally: receiver first, alternate until OUT / bounce2 ---
      var idx = rcv, shots = 1;
      yield HB.wait(0.3, 3);
      while (!pt.over && pt.shot) {
        var HP = M.players[idx].meta;
        var isReturn = (shots === 1);
        var shot = HB.RALLY.chooseShot(HP, { r: Math.random, side: 1, player: HP });
        var far = endSign(M, 1 - idx);
        if (Math.random() < errP(HP, isReturn)) {
          shot.target = HB.RALLY.missGeom({ player: HP, r: Math.random },
            { target: shot.target }).target;
        } else {
          shot.target = { x: far * Math.abs(shot.target.x),
                          z: U.clamp(shot.target.z, -SX + 0.5, SX - 0.5) };
          if (coach.aim && idx === (coach.side || 0)) shot.target = coach.aim;
        }
        var bs = HB.BALL.state();
        var cx = U.clamp(bs.p[0], -HALF - 1, HALF + 1);
        if (Math.sign(cx || 1) !== endSign(M, idx)) cx = endSign(M, idx) * HALF * 0.85;
        var cz = U.clamp(bs.p[2], -SX - 0.8, SX + 0.8);
        yield* glideWait(rigFor(M, idx), cx, cz);             // run to the ball
        hit(M, idx, { x: cx, y: 0.95, z: cz },
            { target: shot.target, spin: shot.spin, clearance: shot.clearance });
        pt.shot = { hitter: idx, b1: null };
        pt.shots = shots; shots++;
        yield HB.until(function () { return pt.over || (pt.shot && pt.shot.b1 != null); }, 9);
        if (pt.over) break;                                  // our shot unanswered — after loop
        var b = pt.shot.b1;
        if (!b) {                                            // watchdog: ball lost mid-shot
          endPoint(M, 1 - idx, 'error', shots, M.matchOver); return;
        }
        var onOwn = Math.sign(b.x || 1) === endSign(M, idx);
        if (!inSingles(b) || onOwn) {                        // OUT — line call
          HB.bus.emit('call:line', { loc: [b.x, b.z], call: 'OUT' });
          HB.bus.emit('audio:all', { kind: 'call' });
          log('OUT — ' + M.players[idx].meta.name + '.', 'warn');
          endPoint(M, 1 - idx, 'error', pt.shots, false);
          return;
        }
        idx = 1 - idx;                                       // shot is in — opponent returns
        yield HB.wait(0.2 + Math.random() * 0.3, 3);
      }
      // bounce2 verdict: last shot unanswered
      if (pt.decided === 'bounce2' && pt.shot) {
        var lh = pt.shot.hitter, lb = pt.shot.b1;
        var wasIn = lb && inSingles(lb) && Math.sign(lb.x || 1) !== endSign(M, lh);
        if (wasIn) endPoint(M, lh, 'not-returned', pt.shots, pt.serveIn);
        else endPoint(M, 1 - lh, 'error', pt.shots, false);
      }
    } finally {
      offs.forEach(function (f) { f(); });
    }
  }
  function pickDir(dir) {
    var r = Math.random(), c = 0, ks = ['w', 'b', 't'];
    for (var j = 0; j < 3; j++) { c += dir[ks[j]]; if (r < c) return ks[j]; }
    return 'b';
  }
  function errP(HP, isReturn) {
    var risk = HP.tactic.risk / 100, cons = HP.cons / 100;
    return (isReturn ? 0.34 : 0.26) * (0.6 + risk * 0.8) * (1.25 - cons);
  }
  function inSingles(l) {
    return Math.abs(l.x) <= HALF + 0.05 && Math.abs(l.z) <= SX + 0.05;
  }

  // ---------- point resolution → scoring → next chain ----------
  function endPoint(M, winner, how, shots, serveWinner) {
    var isAce = serveWinner && shots <= 1;
    var how2 = isAce ? 'ace' : how;
    if (isAce) { M.stats.aces++; log('ACE — ' + M.players[winner].meta.name + '!', 'big'); }
    if (how2 === 'winner' || how2 === 'not-returned') M.stats.winners.push(winner);
    if (how2 === 'error' || how2 === 'return-err' || how2 === 'double-fault')
      M.stats.errors.push(1 - winner);
    if (how2 !== 'double-fault') M.stats.rallyShots.push(shots);
    HB.bus.emit('point:end', { winner: winner, how: how2, shots: shots });
    var sc = scorePoint(M, winner);
    if (sc.matchOver) M.matchOver = true;
    if (sc.msg) { log(sc.msg, sc.matchOver ? 'big' : ''); HB.bus.emit('call:umpire', { text: sc.msg }); }
    HB.bus.emit('crowd:react', { level: sc.matchOver ? 1 : (isAce ? 0.7 : 0.25) });
    if (sc.setOver && !sc.matchOver) {
      M.ends = 1 - M.ends;
      HB.bus.emit('ends:swap', { ends: M.ends });
      clearRigs(M);                                          // respawn at swapped ends
      log('Players change ends.', '');
    }
    scheduleNext(M);
  }
  function scheduleNext(M) {
    if (M.matchOver) { finishMatch(M); return; }
    var rest = M.score.tb ? 0.5 : (M.gameNo % 2 === 1 ? 1.6 : 0.7);
    HB.CORE.task(function* () {
      yield HB.wait(rest, 6);
      nextPoint(M);
    }, { name: 'flow:nextpt', max: 10 });
  }
  function nextPoint(M) {
    if (M.matchOver) { finishMatch(M); return; }
    var srv = M.score.tb ? tbServer(M) : (M.firstServer + M.gameNo) % 2;
    M.score.ptNo++;
    HB.CORE.task(function* () { yield* pointGen(M, { server: srv }); },
      { name: 'flow:point', max: 25 });
  }
  function* handshake(M) {                                   // both to the net, bow
    var w = M.rigs, t = 2.2;
    if (w && w[0] && w[1]) {
      HB.PEOPLE.setState(w[0], 'walk'); HB.PEOPLE.setState(w[1], 'walk');
      yield HB.wait(1.6, 6);
    }
    yield HB.wait(t, 8);
  }
  function finishMatch(M) {
    if (M.finished) return;
    M.finished = true;
    M.state = 'trophy';
    var w = M.score.sets[0] > M.score.sets[1] ? 0 : 1;
    HB.CORE.task(function* () {
      yield* handshake(M);
      HB.bus.emit('match:end', { winner: w });
      HB.CROWD.excite(1); HB.CROWD.confetti(3);
      log('TROPHY — ' + M.players[w].meta.name + ' wins the Hollybrook Open!', 'big');
      if (M.onDone) { var cb = M.onDone; M.onDone = null;
        cb({ winner: w, score: M.score.sets, games: M.score.gamesNow, stats: M.stats }); }
    }, { name: 'flow:trophy', max: 30 });
  }

  // ---------- entry ----------
  function startMatch(match, done) {
    cur = match; match.onDone = done;
    HB.CROWD.excite(0.4);
    HB.CORE.task(function* () {
      match.state = 'walkon';
      HB.bus.emit('match:new', { fmt: match.format, players: match.players,
                                 surface: match.surface });
      HB.bus.emit('match:phase', { phase: 'walkon' });
      HB.PEOPLE.clearCourtActors();
      clearRigs(match);
      yield* HB.PEOPLE.walkOn(match.players.map(function (P, i) {
        return { meta: P.meta, side: i === 0 ? -1 : 1,
                 from: [-20, i === 0 ? -13 : -11],
                 to: [i === 0 ? -13.0 : 13.0, i === 0 ? 0.6 : -0.6] };
      }));
      match.firstServer = match.server = Math.random() < 0.5 ? 0 : 1;
      match.state = 'toss';
      HB.bus.emit('call:umpire', { text: 'Toss won by ' +
        match.players[match.firstServer].meta.name + ' — to serve.' });
      log(match.players[match.firstServer].meta.name + ' serves first.', 'big');
      yield HB.wait(1.6, 6);
      match.state = 'live';
      HB.bus.emit('match:phase', { phase: 'live' });
      nextPoint(match);
    }, { name: 'flow:match', max: 60 });
    return match;
  }

  var coach = { tactic: 'auto', srvDir: 'auto', aim: null, side: 0 };
  HB.bus.on('debug:runmatch', function (d) {                 // ?qa=match harness entry
    var metas = [HB.CFG.roster[0], HB.CFG.roster[1]];
    var M = newMatch(d.fmt || 'set', metas, d.surf);
    startMatch(M, function (res) { if (d.done) d.done(res); });
  });
  HB.bus.on('ui:newmatch', function (d) {                    // panel button (P5)
    var byId = function (v) {
      for (var i = 0; i < HB.CFG.roster.length; i++)
        if (HB.CFG.roster[i].id === v) return HB.CFG.roster[i];
      return null;
    };
    var a = byId(d.p0) || HB.CFG.roster[0];
    var b = byId(d.p1) || HB.CFG.roster[1];
    if (a === b) b = HB.CFG.roster[(HB.CFG.roster.indexOf(a) + 1) % HB.CFG.roster.length];
    var M = newMatch(d.fmt || 'bo3', [a, b], HB.CFG.current.surface);
    startMatch(M, null);
  });

  var api = { ready: true, newMatch: newMatch, scorePoint: scorePoint, scoreText: scoreText,
              tbServer: tbServer, startMatch: startMatch, coach: coach,
              coachHook: function () { return coach; },
              current: function () { return cur; } };
  HB.reg('flow', api);
  return api;
})();
