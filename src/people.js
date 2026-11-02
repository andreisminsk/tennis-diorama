// people.js — HB.PEOPLE (P3): low-poly humanoid rig factory + actors.
// Rigs: torso/head/arms(two-seg)/legs(two-seg)/racket, kit-coloured via vertex colors.
// Anim states: idle, walk, run, swing(fh/bh), serve(toss+hit), bow. Driven by sched
// coroutines per actor; court-local coords (CONTRACT §4: long axis X, net x=0).
HB.PEOPLE = (function () {
  var U = HB.UTIL;
  var SKIN = { voss: '#f3c9a5', andersson: '#dfa07b', anand: '#b57a52', kovar: '#e2a874',
               ref: '#8a5a3b', kid: '#f3c9a5' };
  var HAIROPT = ['#2e2a26', '#c8b08b', '#f2a007', '#39424e'];

  // ---------- palette → vertex colors ----------
  function tint(hex) { return U.hex2rgb(hex); }

  // ---------- rig factory ----------
  // Proportions 1.0 = adult male ~1.85 m; women 0.93; ball kids 0.78; umpire seated.
  function makeRig(opts) {
    opts = opts || {};
    var s = opts.scale || 1.0;
    var g = new THREE.Group();
    var items = [], // static merged parts (torso, head, hair)
        dyn = {};   // dynamic limb pivots

    function vc(r, gr, b) { return r; }
    // torso (box tapered by two slabs): shirt colour
    var torso = { g: new THREE.BoxGeometry(0.34, 0.52, 0.2),
      m: new THREE.Matrix4().makeTranslation(0, 1.12 * s, 0), color: opts.shirt };
    var hips = { g: new THREE.BoxGeometry(0.3, 0.22, 0.19),
      m: new THREE.Matrix4().makeTranslation(0, 0.78 * s, 0), color: opts.shorts };
    var head = { g: new THREE.BoxGeometry(0.22, 0.24, 0.22),
      m: new THREE.Matrix4().makeTranslation(0, 1.52 * s, 0), color: opts.skin };
    var hair = { g: new THREE.BoxGeometry(0.24, 0.08, 0.24),
      m: new THREE.Matrix4().makeTranslation(0, 1.63 * s, 0), color: opts.hair };
    var face = { g: new THREE.BoxGeometry(0.18, 0.17, 0.02),
      m: new THREE.Matrix4().makeTranslation(0, 1.5 * s, 0.12), color: opts.skin };
    // NOTE: rig "front" is local +z (actors rotated to face +x/−x via rotY ∓π/2)
    items.push(torso, hips, head, hair, face);   // face patch: brighter on the FRONT (−z is back)

    // limbs as pivot groups (rotated at hip/shoulder)
    function mkLimb(len, thick, colHex, px, py, pz) {
      var pivot = new THREE.Group();
      pivot.position.set(px, py, pz);
      var upper = { g: new THREE.BoxGeometry(thick, len / 2, thick),
        m: new THREE.Matrix4().makeTranslation(0, -len / 4, 0), color: colHex };
      var lower = { g: new THREE.BoxGeometry(thick * 0.85, len / 2, thick * 0.85),
        m: new THREE.Matrix4().makeTranslation(0, -len * 0.75, 0), color: colHex };
      pivot.add(new THREE.Mesh(U.mergeGeoms([upper, lower]),
        new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true })));
      return pivot;
    }
    var legL = mkLimb(0.78 * s, 0.11, opts.skin, 0.09 * s, 0.82 * s, 0);
    var legR = mkLimb(0.78 * s, 0.11, opts.skin, -0.09 * s, 0.82 * s, 0);
    var armL = mkLimb(0.6 * s, 0.08, opts.shirt, 0.22 * s, 1.32 * s, 0);
    var armR = mkLimb(0.6 * s, 0.08, opts.shirt, -0.22 * s, 1.32 * s, 0);
    // shorts overlay on upper legs: recolour via separate small boxes
    [legL, legR].forEach(function (L) {
      var sh = new THREE.Mesh(U.mergeGeoms([{ g: new THREE.BoxGeometry(0.14, 0.24, 0.15),
        m: new THREE.Matrix4().makeTranslation(0, -0.12 * s, 0) }]),
        new THREE.MeshLambertMaterial({ color: opts.shorts }));
      L.add(sh);
    });
    g.add(legL); g.add(legR); g.add(armL); g.add(armR);
    dyn = { legL: legL, legR: legR, armL: armL, armR: armR };

    // racket in right hand (lefty mirrored by opts.hand==='L')
    var hand = (opts.hand === 'L');
    var rk = new THREE.Group();
    var rkItems = [
      { g: new THREE.CylinderGeometry(0.016, 0.016, 0.42, 6),
        m: new THREE.Matrix4().makeTranslation(0, 0.21, 0), color: '#5e564d' },
      { g: new THREE.TorusGeometry(0.1, 0.016, 5, 12),
        m: new THREE.Matrix4().makeTranslation(0, 0.47, 0), color: '#c8102e' }
    ];
    rk.add(new THREE.Mesh(U.mergeGeoms(rkItems),
      new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true })));
    // strings: pale disc inset in the frame
    var str = new THREE.Mesh(new THREE.CircleGeometry(0.085, 10),
      new THREE.MeshBasicMaterial({ color: '#dfe7ee' }));
    str.position.set(0, 0.47, 0.001);
    rk.add(str);
    rk.position.set(0, -0.6 * s, 0.02);
    (hand ? armL : armR).add(rk);
    if (hand) rk.scale.x = -1;                    // lefty mirror
    dyn.racket = rk;

    var body = new THREE.Mesh(U.mergeGeoms(items),
      new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }));
    g.add(body);
    // blob shadow
    var shg = new THREE.CircleGeometry(0.32 * s, 10); shg.rotateX(-Math.PI / 2);
    var sh = new THREE.Mesh(shg, new THREE.MeshBasicMaterial({ color: '#07080a',
      transparent: true, opacity: 0.28, depthWrite: false }));
    sh.position.y = 0.02;
    g.add(sh);
    g.__rig = { s: s, parts: dyn, phase: Math.random() * 6.28, state: 'idle', t: Math.random() * 3 };
    // random t offset: legs never in phase-lock across rigs
    return g;
  }

  // ---------- animation (cheap procedural, called from actor coroutines + render) ----------
  function pose(rig, dt) {
    var r = rig.__rig, t = r.t += dt, k = r.state;
    var A = r.parts, w = r.phase;
    function sway(p, f, amp, ph) { p.rotation.x = Math.sin(t * f + ph) * amp; }
    if (k === 'walk') {
      var f = 9;
      sway(A.legL, f, 0.75, 0); sway(A.legR, f, 0.75, Math.PI);
      sway(A.armL, f, 0.5, Math.PI); sway(A.armR, f, 0.5, 0);
      rig.position.y = Math.abs(Math.sin(t * f)) * 0.045;   // step bob
    } else if (k === 'run') {
      var f2 = 11;
      sway(A.legL, f2, 0.8, 0); sway(A.legR, f2, 0.8, Math.PI);
      sway(A.armL, f2, 0.6, Math.PI); sway(A.armR, f2, 0.6, 0);
      A.torsoLean = 0.18;
      rig.rotation.x = 0.12;
    } else if (k === 'swing') {
      A.armR.rotation.x = -1.9 + Math.sin(t * 14) * 0.05;
      A.armR.rotation.z = -0.5;
      A.legL.rotation.x = 0; A.legR.rotation.x = 0;
    } else if (k === 'serve') {
      A.armR.rotation.x = -2.6; A.armL.rotation.x = -0.4;
      A.legL.rotation.x = -0.15; A.legR.rotation.x = 0.25;
    } else { // idle
      [A.legL, A.legR, A.armL, A.armR].forEach(function (p, i) {
        p.rotation.x = Math.sin(t * 1.2 + i) * 0.05;
      });
      rig.rotation.x = 0;
    }
  }
  function setState(rig, k) { rig.__rig.state = k; }

  // ---------- actors ----------
  var actors = [];

  function courtActor(playerMeta, side) {   // side: -1 (west baseline, server end) 1 (east)
    var opts = {
      shirt: playerMeta.kit.shirt, shorts: playerMeta.kit.shorts,
      skin: SKIN[playerMeta.id] || SKIN.ref, hair: playerMeta.kit.hair,
      hand: playerMeta.hand, scale: playerMeta.sex === 'W' ? 0.93 : 1.0
    };
    var rig = makeRig(opts);
    rig.position.set(side * (11.885 - 3), 0, (side < 0 ? 1 : -1) * 0.5);
    rig.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;  // face net (x=0)
    HB.CORE.scene.add(rig);
    actors.push(rig);
    return rig;
  }

  function officials() {
    var rigs = [];
    // umpire chair + umpire at x=0 side z=+7.6ish (net-side post, south side)
    var chair = new THREE.Mesh(U.mergeGeoms([
      { g: new THREE.BoxGeometry(0.6, 1.9, 0.6), m: new THREE.Matrix4().makeTranslation(0, 0.95, 0), color: '#5e564d' },
      { g: new THREE.BoxGeometry(0.7, 0.1, 0.7), m: new THREE.Matrix4().makeTranslation(0, 1.95, 0), color: '#6b4a2f' }
    ]), new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }));
    chair.position.set(0, 0, 7.6);
    HB.CORE.scene.add(chair);
    var ump = makeRig({ shirt: '#39424e', shorts: '#262d36', skin: SKIN.ref,
      hair: '#2e2a26', scale: 0.97 });
    ump.position.set(0, 2.0, 7.6);
    HB.CORE.scene.add(ump);
    // line judges: 3 (baselines x±, sidelines z)
    [[-12.8, -7.2], [12.8, 7.2], [0, -7.9]].forEach(function (p, i) {
      var lj = makeRig({ shirt: '#7fb069', shorts: '#262d36', skin: SKIN.ref,
        hair: HAIROPT[i], scale: 0.95 });
      lj.position.set(p[0], 0, p[1]);
      lj.rotation.y = Math.atan2(-p[0], -p[1]) + Math.PI;
      HB.CORE.scene.add(lj);
      rigs.push(lj);
    });
    // ball kids (crouched scale 0.78): at posts
    [[-6.6, 7.4], [6.6, -7.4]].forEach(function (p, i) {
      var bk = makeRig({ shirt: '#f7c531', shorts: '#262d36', skin: SKIN.kid,
        hair: HAIROPT[(i + 2) % 3], scale: 0.78 });
      bk.position.set(p[0], 0, p[1]);
      HB.CORE.scene.add(bk);
    });
    return { umpire: ump, chair: chair, lines: rigs };
  }

  // ---------- walk-on choreography (sched-coroutine; A*-pathed) ----------
  function* walkOn(pair, opts) {
    // pair: [{meta, from:[x,z], to:[x,z]}, ...]
    var jobs = pair.map(function (P, i) {
      var rig = courtActor(P.meta, P.side);
      var path = HB.CORE.nav.path(P.from[0], P.from[1], P.to[0], P.to[1]) ||
        [{ x: P.from[0], z: P.from[1] }, { x: P.to[0], z: P.to[1] }];
      return { rig: rig, path: path, speed: 2.0 + i * 0.05 };
    });
    for (var j = 0; j < jobs.length; j++) setState(jobs[j].rig, 'walk');
    var seg = 0, tt = 0;
    var dtScaled;
    var done0 = 0;
    while (done0 < jobs.length) {
      dtScaled = HB.CORE.sched.delta() || 0.016;
      var allArrived = true;
      for (var j2 = 0; j2 < jobs.length; j2++) {
        var J = jobs[j2], P2 = J.path;
        if (J.seg2 === undefined) { J.seg2 = 0; J.tt = 0; }
        if (J.seg2 < P2.length - 1) {
          allArrived = false;
          var a = P2[J.seg2], b = P2[Math.min(J.seg2 + 1, P2.length - 1)];
          var d = Math.hypot(b.x - a.x, b.z - a.z) || 0.01;
          J.tt += J.speed * dtScaled / d;
          if (J.tt >= 1) { J.tt = 0; J.seg2++; }
          var k = Math.min(1, J.tt);
          J.rig.position.x = a.x + (b.x - a.x) * k;
          J.rig.position.z = a.z + (b.z - a.z) * k;
          J.rig.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        }
      }
      yield HB.wait(0.033, 5);
      done0 = jobs.filter(function (J) {
        return J.seg2 >= J.path.length - 1;
      }).length;
    }
    for (var j3 = 0; j3 < jobs.length; j3++) setState(jobs[j3].rig, 'idle');
  }

  // ---------- debug spawns ----------
  var off = null;
  HB.bus.on('debug:spawn', function (d) {
    if (d && d.name === 'walkon' && !off) {
      off = officials();
      var m0 = HB.CFG.roster[0], m1 = HB.CFG.roster[1];
      HB.CORE.task(walkOn([
        { meta: m0, side: -1, from: [-18, -12], to: [-9, 0.6] },
        { meta: m1, side: 1, from: [-18, -10.5], to: [9, -0.6] }
      ]), { name: 'walkon', max: 60 });
    }
  });

  var api = { ready: true, makeRig: makeRig, pose: pose, setState: setState,
    courtActor: courtActor, officials: officials, walkOn: walkOn,
    actors: function () { return actors; } };
  HB.reg('people', api);
  return api;
})();
