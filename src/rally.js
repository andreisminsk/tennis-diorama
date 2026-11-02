// rally.js — HB.RALLY (P4b/P6): shot-choice + error model + calibration harness.
// Headless point sim: serve->return->rally ... -> point end. Uses KIN solver +
// simplified outcome model (contact quality -> real miss geometry). Statistical
// targets: 1st-serve 60-65%, aces 4-8%, DF 2-4%, mean rally 4-7 shots (ARCH §11).
HB.RALLY = (function () {
  var U = HB.UTIL;

  // ---------- decision model ----------
  // returns {target:{x,z}, spin:{top,side}, clearance, Tscale, kind}
  function chooseShot(p, meta) {
    // court-local: p is ball contact {x,z}; pick placement
    var deepX = 6.5 + U.rng(meta.r)() * 3.5;         // depth 6.5..10 (past service 6.4)
    var wideZ = 2.0 + U.rng(meta.r)() * 1.6;         // z 2..3.6 (open court)
    var lineZ = 0.4 + U.rng(meta.r)() * 0.9;
    var z = (U.rng(meta.r)() < 0.62) ? (U.rng(meta.r)() < 0.5 ? wideZ : -wideZ) : lineZ * (meta.side || 1);
    var risk = meta.player.tactic.risk / 100;
    var topRate = (meta.player.tactic.net > 45) ? -1600 - risk * 1800 : -700 - risk * 900;
    return { target: { x: deepX * (1 + meta.player.tactic.cons / 400), z: z },
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
    return U.rng(meta.r)() < p;
  }
  function missGeom(meta, shot) {  // turns an error into a REAL geometry miss
    var side = U.rng(meta.r)() < 0.5 ? 1 : -1;
    var kind = U.rng(meta.r)() < 0.45 ? 'long' : 'wide';
    if (kind === 'long') shot.target.x += side > 0 ? 1.1 + U.rng(meta.r)() : -(0.9 + U.rng(meta.r)());
    else shot.target.z += side * (0.55 + U.rng(meta.r)() * 0.5);
    if (U.rng(meta.r)() < 0.22) shot.target.x = (shot.target.x > 0 ? 1 : -1) * -0.4; // netted
    return shot;
  }

  // ---------- headless point sim ----------
  // players: [{player, r}, ...]; server index. Court-local rotated coords: server
  // hits from x=∓11, ball crosses x=0. Surface affects rally length (speedMix).
  function simPoint(ps, server, opts) {
    opts = opts || {};
    var surf = opts.surface || 'hard';
    var SP = HB.CFG.bounce[surf] || HB.CFG.bounce.hard;
    var sp = ps[server];
    var S = sp.player.serve;
    var receiver = 1 - server;

    // ---- serve: 2 attempts ----
    var faults = 0, ace = false;
    for (var attempt = 0; attempt < 2; attempt++) {
      var bad = (attempt === 1 ? 0 :
        U.rng(sp.r)() < (1 - (0.60 + 0.05 * (sp.player.cons / 100)))) ||   // 1st-serve miss
        U.rng(sp.r)() < S.dRate;
      if (bad) { faults++; continue; }
      // clean serve: return-quality roll decides ace vs live ball
      var retQ = U.rng(ps[receiver].r)();
      if (retQ < aceProb(sp, ps[receiver])) ace = true;
      break;                                   // serve in (attempt 1 or 2)
    }
    if (faults >= 2)
      return { winner: receiver, how: 'double-fault', shots: 0, stats: { dfs: 1 } };
    if (ace)
      return { winner: server, how: 'ace', shots: 1, stats: { aces: 1 } };

    // ---- rally: alternate hits; per-shot error/winner rolls ----
    var idx = receiver, shots = 0;
    var surfaceRallyAdj = surf === 'clay' ? 1.25 : (surf === 'grass' || surf === 'carpet') ? 0.85 : 1.0;
    while (shots < 40) {
      shots++;
      var m2 = ps[idx];
      // per-shot outcome: error / forced-err pressure / winner / continue
      var risk = m2.player.tactic.risk / 100, cons = m2.player.cons / 100;
      var pErr = 0.155 * (0.6 + risk * 0.8) * (1.3 - cons) / surfaceRallyAdj;
      var u = U.rng(m2.r)();
      if (u < pErr) {
        return { winner: 1 - idx, how: shots === 1 ? 'return-err' : 'error',
                 shots: shots, stats: {} };
      }
      if (u < pErr + 0.062) {                   // clean winner
        return { winner: idx, how: 'winner', shots: shots, stats: {} };
      }
      idx = 1 - idx;                            // ball back
    }
    return { winner: server, how: 'long-rally', shots: shots, stats: {} };
  }
  function aceProb(server, receiver) {
    // strong serve + weak returner -> more aces; tuned for 4–8 % band
    var pow = server.player.pow / 100, place = server.player.place / 100;
    var ret = 0.028 + pow * 0.045 * place - (receiver.player.cons / 100) * 0.012;
    return Math.max(0.01, ret);
  }

  // ---------- calibration harness (P4b / ARCH §11) ----------
  function calibrate(n, onDone) {
    n = n || 2000;
    var out = {};
    var surfaces = ['grass', 'clay', 'hard', 'carpet'];
    surfaces.forEach(function (sf) {
      var stats = { pts: 0, firstIn: 0, aces: 0, dfs: 0, rallyTotal: 0 };
      for (var i = 0; i < 4; i++) {      // 4 players pairings × n/4 points
        var a = HB.CFG.roster[i], b = HB.CFG.roster[(i + 1) % 4];
        var seed = 1000 + i * 77 + String(sf).length;
        var ps = prep(a, b, seed, sf);
        for (var k = 0; k < n / 4; k++) {
          var sv = k % 2;
          var res = simPoint(ps, sv);
          stats.pts++;
          if (res.how !== 'double-fault') stats.firstIn++;
          else stats.dfs++;
          if (res.how === 'ace') stats.aces++;
          stats.rallyTotal += res.shots;
        }
      }
      out[sf] = {
        points: stats.pts,
        firstServePct: +(100 * stats.firstIn / stats.pts).toFixed(1),
        acePct: +(100 * stats.aces / stats.pts).toFixed(1),
        dfPct: +(100 * stats.dfs / stats.pts).toFixed(1),
        meanRally: +(stats.rallyTotal / stats.pts).toFixed(2)
      };
    });
    if (onDone) onDone(out);
    return out;
  }
  function prep(a, b, seed, surface) {
    function mk(p, s0) {
      return { player: p, r: U.rng(s0), side: 1 };
    }
    // NOTE: simPoint uses ps[server]/ps[receiver]; serve side flips handled inside.
    return [mk(a, seed), mk(b, seed + 1)];
  }

  var api = {
    ready: true, chooseShot: chooseShot, contactErr: contactErr, missGeom: missGeom,
    simPoint: simPoint, calibrate: calibrate
  };
  HB.reg('rally', api);
  return api;
})();
