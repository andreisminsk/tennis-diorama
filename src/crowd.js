// crowd.js — HB.CROWD (P3b): instanced crowd over the 4 stands' seats + fx
// (sway, applause bounce, confetti bursts). Reacts to BUS crowd:react levels.
HB.CROWD = (function () {
  var U = HB.UTIL;
  var im = null, seats = [], CONFETTI_N = 240;
  var conf = null, confData = [];
  var swayT = 0, excite = 0, exciteT = 0;

  function seatMatrix(st) {
    var m = new THREE.Matrix4();
    m.makeTranslation(st.x, st.y, st.z);
    return m;
  }

  function build(scene) {
    // collect seat slots from club's stands (each stand group: seats InstancedMesh
    // placed at (col pitch, rr*stepH+..., rr*stepD) in stand-local space)
    var stands = [];
    scene.traverse(function (o) {
      if (o.__seats) stands.push(o);
    });
    if (!stands.length) return api;
    scene.updateMatrixWorld(true);   // MUST precede seat compute (was after — ghost rows)
    var ACC = ['#c8102e', '#f2f2f2', '#1e3a8a', '#f7c531', '#3ecfb2', '#f28cb1',
               '#64748b', '#e2591f', '#00a3c8', '#28c76f'];
    var total = 0;
    stands.forEach(function (s) { total += s.__seats.count; });
    // person = torso+head-ish blob (0.55 tall), sunk 0.12 into the seat pad
    var crowdGeo = new THREE.BoxGeometry(0.34, 0.62, 0.3);
    var crowdMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    im = new THREE.InstancedMesh(crowdGeo, crowdMat, total);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    var m4 = new THREE.Matrix4(), col = new THREE.Color();
    var i = 0;
    // recompute seat world rows exactly as club.js did
    stands.forEach(function (s, si) {
      var cfg = s.__crowdCfg; if (!cfg) return;
      var rows = cfg.rows, cols = cfg.cols, len = cfg.len;
      var pitch = len / cols, stepH = 0.52, stepD = 0.92;
      for (var rr = 0; rr < rows; rr++)
        for (var cc = 0; cc < cols; cc++) {
          var lx = -len / 2 + pitch * (cc + 0.5);
          var ly = stepH * rr + stepH + 0.35;      // pad top +0.31 centre − 0.12 sink
          var lz = rr * stepD + stepD / 2;
          var p = new THREE.Vector3(lx, ly, lz).applyMatrix4(s.matrixWorld);
          // skip ~8% of seats (empty seats read realistic)
          if (U.rng(seededFor(si, i))() < 0.08) { m4.makeScale(0, 0, 0); }
          else { m4.makeTranslation(p.x, p.y, p.z); col.set(ACC[(i * 5 + rr * 3) % ACC.length]); im.setColorAt(i, col); }
          im.setMatrixAt(i, m4);
          seats.push({ live: m4.elements[0] !== 0, base: p.clone(), i: i, ph: (i * 0.37) % 6.28 });
          i++;
        }
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scene.add(im);

    // confetti pool
    var cg = new THREE.BoxGeometry(0.16, 0.06, 0.22);   // fat enough to survive outline pass
    conf = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ color: '#ffffff',
      vertexColors: false }), CONFETTI_N);
    conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    var ccol = new THREE.Color();
    for (var k = 0; k < CONFETTI_N; k++) {
      confData.push({ live: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: 0 });
      conf.setMatrixAt(k, new THREE.Matrix4().makeScale(0, 0, 0));
      // boosted luma: confetti must stay vivid after OKLab palette snap at half-res
      ccol.set(['#f2a0b0', '#f7d23e', '#7ef2d0', '#f2f6ff', '#f28cb1'][k % 5]);
      conf.setColorAt(k, ccol);
    }
    conf.instanceColor.needsUpdate = true;
    scene.add(conf);

    HB.bus.on('crowd:react', function (d) {
      var lv = (d && d.level) || 0;                 // 0..1
      if (lv >= 0.8) confetti();
      excite = Math.max(excite, lv);
    });
    HB.CORE.task(function* () {
      while (true) {
        var dt = HB.CORE.sched.delta();
        swayT += dt;
        exciteT = Math.max(0, exciteT - dt * 0.2);
        excite = Math.max(0, excite - dt * 0.15);
        tickCrowd(dt);
        tickConfetti(dt);
        yield HB.wait(0.05, 5);
      }
    }, { name: 'crowd:tick', max: 10 });
    return api;
  }

  function seededFor(stand, i) { return (stand * 131 + i * 17 + 7) >>> 0; }

  function tickCrowd(dt) {
    var amp = 0.02 + excite * 0.16;               // idle sway → applause bounce
    var freq = 1.4 + excite * 7;
    if (!im) return;
    var m = new THREE.Matrix4();
    for (var k = 0; k < seats.length; k++) {
      var s2 = seats[k];
      if (!s2.live) continue;
      var y = s2.base.y + Math.max(0, Math.sin(swayT * freq + s2.ph)) * amp;
      var bob = Math.sin(swayT * freq * 0.7 + s2.ph) * amp * 0.4;
      m.makeTranslation(s2.base.x, y + bob, s2.base.z);
      im.setMatrixAt(s2.i, m);
    }
    im.instanceMatrix.needsUpdate = true;
  }

  function tickConfetti(dt) {
    if (!conf) return;
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (var k = 0; k < CONFETTI_N; k++) {
      var c = confData[k];
      if (!c.live) continue;
      c.vel.y -= 1.1 * dt;                          // slow flutter fall
      c.vel.multiplyScalar(1 - 0.55 * dt);          // heavy air drag
      c.vel.x += Math.sin(swayT * 3 + k) * 0.9 * dt;
      c.pos.addScaledVector(c.vel, dt);
      c.spin = (c.spin || 0) + dt * 7;
      if (c.pos.y < 0.25) { if (excite > 0.3) { respawn(k, c); } else c.live = false; }
      if (!c.live) { m.makeScale(0, 0, 0); conf.setMatrixAt(k, m); continue; }
      e.set(c.spin, c.spin * 0.7, 0);
      m.compose(c.pos, q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
      conf.setMatrixAt(k, m);
    }
    conf.instanceMatrix.needsUpdate = true;
  }

  function spawnOne(k, c) {
    var origins = [[0, 10.5, -14.5], [0, 10.5, 9.6], [-17, 9.5, 0], [17, 9.5, 0]];
    var o = origins[k % origins.length];
    c.live = true;
    c.pos.set(o[0] + (Math.random() - 0.5) * 7, o[1], o[2] + (Math.random() - 0.5) * 3.4);
    c.vel.set((Math.random() - 0.5) * 2.2, 1.2 + Math.random() * 2.0, (Math.random() - 0.5) * 2.2);
    c.spin = Math.random() * 6;
  }
  function respawn(k, c) { c.pos.y = 8 + Math.random() * 3; c.vel.y = 1 + Math.random(); }
  function confetti() {
    var m = new THREE.Matrix4();
    for (var k = 0; k < CONFETTI_N; k++) {
      var c = confData[k];
      spawnOne(k, c);
      m.compose(c.pos, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      conf.setMatrixAt(k, m);
    }
    conf.instanceMatrix.needsUpdate = true;
  }

  var api = { ready: true, build: build, confetti: confetti,
    excite: function (v) { HB.bus.emit('crowd:react', { level: v }); } };
  HB.reg('crowd', api);
  return api;
})();
