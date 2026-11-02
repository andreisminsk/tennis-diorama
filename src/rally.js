// rally.js — HB.RALLY (P4b/P6): shot-choice + error model + calibration harness.
// Headless point sim: serve->return->rally ... -> point end. Uses KIN solver +
// simplified outcome model (contact quality -> real miss geometry). Statistical
// targets: 1st-serve 60-65%, aces 4-8%, DF 2-4%, mean rally 4-7 shots (ARCH §11).
HB.RALLY = (function () {
  var U = HB.UTIL;

  // Draw one value from an existing (stateful) generator OR a raw seed. P4b ROOT
  // CAUSE FIX: code used to call U.rng(meta.r)() — mulberry32 coerces a function
  // seed to 0, so EVERY roll returned the same first constant from seed 0: matches
  // froze at cap-40 rallies, aces never fired, 1st-serve pinned at 100 %. Never
  // re-seed with a generator — draw through roll().
  function roll(r) { return (typeof r === 'function') ? r() : U.rng(r)(); }

  // ---------- decision model ----------
  // returns {target:{x,z}, spin:{top,side}, clearance, Tscale, kind}
  function chooseShot(p, meta) {
    // court-local: p is ball contact {x,z}; pick placement
    var deepX = 6.5 + roll(meta.r) * 3.5;            // depth 6.5..10 (past service 6.4)
    var wideZ = 2.0 + roll(meta.r) * 1.6;            // z 2..3.6 (open court)
    var lineZ = 0.4 + roll(meta.r) * 0.9;
    var z = (roll(meta.r) < 0.62) ? (roll(meta.r) < 0.5 ? wideZ : -wideZ) : lineZ * (meta.side || 1);
    var risk = meta.player.tactic.risk / 100;
    var topRate = (meta.player.tactic.net > 45) ? -1600 - risk * 1800 : -700 - risk * 900;
    // FIX: cons is a TOP-LEVEL Player field (CONTRACT §4) — tactic.cons is
    // undefined → NaN deepX → every non-netted ground shot aimed at x=NaN.
    return { target: { x: deepX * (1 + (meta.player.cons || 50) / 400), z: z },
             spin: { top: topRate, side: 0 }, clearance: 0.4 + risk * 0.5,
             Tscale: 1, kind: 'ground' };
  }

  // ---------- outcome: contact quality -> real miss ----------
  // Consistency: error prob rises with risk and power, falls with cons.
  function contactErr(meta, kind) {
    var risk = meta.player.tactic.risk / 100;
    var cons = meta.player.cons / 100;
    var base = kind === 'serve' ? 0.28 : 0.115;
    var p = base * (0.55 + risk * 0.9) * (1.35 - cons);
    return roll(meta.r) < p;
  }
  function missGeom(meta, shot) {  // turns an error into a REAL geometry miss
    var side = roll(meta.r) < 0.5 ? 1 : -1;
    var kind = roll(meta.r) < 0.45 ? 'long' : 'wide';
    if (kind === 'long') shot.target.x += side > 0 ? 1.1 + roll(meta.r) : -(0.9 + roll(meta.r));
    else shot.target.z += side * (0.55 + roll(meta.r) * 0.5);
    if (roll(meta.r) < 0.22) shot.target.x = (shot.target.x > 0 ? 1 : -1) * -0.4; // netted
    return shot;
  }

  // ---------- headless point sim ----------
  // Statistical twin of the on-court loop (FLOW drives the real one). Every roll is
  // a FRESH draw — no shared meta.r correlation. Surface effect: rally stop-prob
  // scales with CFG.bounce[surf].speedMix (clay 0.93 lengthens, carpet 1.05 shortens).
  var TUNE = {
    pErrBase: 0.26,     // unforced error / contact at avg attrs (calibrated P4b)
    pWinBase: 0.065,    // clean winner / contact at avg attrs
    retErrMul: 1.55,    // return of serve is the hardest contact
    rallyCap: 40
  };
  function simPoint(ps, server, opts) {
    opts = opts || {};
    var surf = opts.surface || 'hard';
    var SP = HB.CFG.bounce[surf] || HB.CFG.bounce.hard;
    var adj = SP.speedMix;
    var sp = ps[server], rc = ps[1 - server];
    var S = sp.player.serve;
    var cs = sp.player.cons / 100;

    // serve: attempt 1 (60-65% in, by consistency), then attempt 2
    var p1stIn = 0.615 + 0.05 * (cs - 0.5);
    var p2ndMiss = U.clamp(0.10 - cs * 0.06 + S.dRate * 0.5, 0.03, 0.14);
    var s1In = roll(sp.r) < p1stIn;
    var s1InFlag = s1In ? 1 : 0;
    if (!(s1In || roll(sp.r) >= p2ndMiss))
      return { winner: 1 - server, how: 'double-fault', shots: 0,
               stats: { s1In: s1InFlag, df: 1 } };
    // ace: strong serve/placement vs returner consistency; mostly off 1st serves
    var ace = roll(rc.r) < aceProb(sp, rc) * (s1In ? 1 : 0.45);
    if (ace)
      return { winner: server, how: 'ace', shots: 1,
               stats: { s1In: s1InFlag, ace: 1 } };

    // rally: per-contact error | winner | continue — fresh roll, counting contacts
    var idx = 1 - server;
    for (var shots = 1; shots < TUNE.rallyCap; shots++) {
      var m = ps[idx], ret = (shots === 1);           // first rally contact = return
      var risk = m.player.tactic.risk / 100, cons = m.player.cons / 100;
      var pE = TUNE.pErrBase * (0.60 + risk * 0.8) * (1.25 - cons) *
               (ret ? TUNE.retErrMul : 1) * adj;
      var pW = TUNE.pWinBase * (1.10 - cons * 0.30) * adj;
      var u = roll(m.r);
      var base = { stats: { s1In: s1InFlag } };
      if (u < pE) {
        base.winner = 1 - idx; base.how = ret ? 'return-err' : 'error';
        base.shots = shots + 1; return base;
      }
      if (u < pE + pW) {
        base.winner = idx; base.how = 'winner';
        base.shots = shots + 1; return base;
      }
      idx = 1 - idx;                                  // ball back
    }
    return { winner: server, how: 'long-rally', shots: TUNE.rallyCap,
             stats: { s1In: s1InFlag } };
  }
  function aceProb(server, receiver) {
    // strong serve + weak returner -> more aces; tuned for 4–8 % band
    var pow = server.player.pow / 100, place = server.player.place / 100;
    var ret = 0.031 + pow * 0.054 * place - (receiver.player.cons / 100) * 0.016;
    return U.clamp(ret, 0.012, 0.11);
  }

  // ---------- calibration harness (P4b / ARCH §11) ----------
  // n points per surface. firstServePct = 1st ATTEMPTS that went in (excl. 2nd serves);
  // seeds differ per surface AND pairing so each cell is an independent sample.
  function calibrate(n, onDone) {
    n = n || 2000;
    var out = {};
    HB.CFG.surfaces.forEach(function (sf, j) {
      var st = { pts: 0, s1: 0, s1In: 0, aces: 0, dfs: 0, rally: 0 };
      for (var i = 0; i < 4; i++) {      // 4 pairings × n/4 points
        var a = HB.CFG.roster[i], b = HB.CFG.roster[(i + 1) % 4];
        var ps = prep(a, b, 1000 + j * 911 + i * 77, sf);
        for (var k = 0; k < n / 4; k++) {
          var res = simPoint(ps, k % 2, { surface: sf });
          st.pts++;
          st.s1++;
          if (res.stats.s1In) st.s1In++;
          if (res.how === 'ace') st.aces++;
          if (res.how === 'double-fault') st.dfs++;
          st.rally += res.shots;
        }
      }
      out[sf] = {
        points: st.pts,
        firstServePct: +(100 * st.s1In / st.s1).toFixed(1),
        acePct: +(100 * st.aces / st.pts).toFixed(1),
        dfPct: +(100 * st.dfs / st.pts).toFixed(1),
        meanRally: +(st.rally / st.pts).toFixed(2)
      };
    });
    if (onDone) onDone(out);
    return out;
  }
  function prep(a, b, seed, surface) {
    function mk(p, s0) {
      return { player: p, r: U.rng(s0), side: 1 };
    }
    // simPoint uses ps[server]/ps[receiver]; serve side flips handled inside.
    return [mk(a, seed), mk(b, seed + 1)];
  }

  var api = {
    ready: true, chooseShot: chooseShot, contactErr: contactErr, missGeom: missGeom,
    simPoint: simPoint, calibrate: calibrate
  };
  HB.reg('rally', api);
  return api;
})();
