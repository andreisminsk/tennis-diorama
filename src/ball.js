// ball.js — HB.BALL (P4): ball mesh + substepped physics (1/120 s) with per-surface
// bounce, net plane + cord collision, bounce marks, BUS events (ARCH §11).
HB.BALL = (function () {
  var mesh, shadow;
  var st = { inPlay: false, p: new THREE.Vector3(), v: new THREE.Vector3(),
             w: new THREE.Vector3(), marksOn: true };
  var SUB = 1 / 120;
  var G = 9.81, R = 0.033;

  function surfaceParams(surface) {
    var b = HB.CFG.bounce[surface || HB.CFG.current.surface] || HB.CFG.bounce.hard;
    return b;
  }

  function build(scene) {
    var g = new THREE.SphereGeometry(R, 10, 8);
    mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#d7e34c' }));
    mesh.visible = false;
    scene.add(mesh);
    var sg = new THREE.CircleGeometry(R * 2.4, 10); sg.rotateX(-Math.PI / 2);
    shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: '#07080a',
      transparent: true, opacity: 0.24, depthWrite: false }));
    shadow.visible = false;
    scene.add(shadow);
    var nav = HB.CORE.nav;
    HB.bus.on('ball:serveReq', function (d) { launch(d); });
    return api;
  }

  function launch(d) {
    st.inPlay = true;
    st.p.copy(d.p); st.v.copy(d.v0); st.w.copy(d.w || ZERO);
    st.netHit = null; st.bounces = 0;
    mesh.visible = true;
  }
  var ZERO = new THREE.Vector3();

  // net: plane x=0, band from z=−6.4..6.4 (posts), height varies by court.js netCurve
  function netHeightAt(z) {
    var N = HB.COURT.netInfo();
    var postZ = N.centreH !== undefined ? 6.399 : 6.399;
    var ph = 1.07, ch = 0.914;
    var k = Math.pow(Math.abs(z) / postZ, 2);
    return ch + (ph - ch) * k;
  }
  function netZ() { return HB.COURT.netInfo().postZ; }

  function physStep(dt, d) {
    var v = st.v, p = st.p;
    var sp = v.length();
    var kdrag = 0.5 * 1.225 * 0.55 * Math.PI * R * R / 0.057;
    v.x += (-kdrag * sp * v.x + 0.000568 / 0.057 * (st.w.y * v.z - st.w.z * v.y)) * dt;
    v.y += (-G - kdrag * sp * v.y + 0.000568 / 0.057 * (st.w.z * v.x - st.w.x * v.z)) * dt;
    v.z += (-kdrag * sp * v.z + 0.000568 / 0.057 * (st.w.x * v.y - st.w.y * v.x)) * dt;
    p.addScaledVector(v, dt);
    // net plane
    var ZN = netZ();
    if (Math.sign(p.x) !== Math.sign(st.lastX || p.x) && p.x !== st.lastX) {
      var t = st.lastX === undefined ? 0 : (0 - (st.lastX)) / ((p.x - st.lastX) || 1e-9);
      if (t >= 0 && t <= 1) {
        var zL = st.lastZ + (p.z - st.lastZ) * t;
        var yL = st.lastY + (p.y - st.lastY) * t;
        if (Math.abs(zL) <= ZN && yL < netHeightAt(zL) + 0.02) {
          if (yL > netHeightAt(zL) - 0.11) {           // cord clip
            st.p.set(st.lastX * (1 - t), Math.max(yL, 0.55), zL);
            st.v.set(st.v.x * -0.12, 2.2, st.v.z * 0.45);
            st.w.multiplyScalar(0.3);
            HB.bus.emit('ball:netcord', { clip: true });
          } else {                                     // into the net
            st.p.set(st.lastX * (0.96), yL, zL);
            st.v.multiplyScalar(-0.04); st.v.y = 0;
            HB.bus.emit('ball:netcord', { clip: false });
          }
          st.netHit = true;
          return;
        }
      }
    }
    // ground
    if (p.y <= 0.036 && v.y < 0) {
      var SP = surfaceParams();
      p.y = 0.036;
      var vin = v.y;
      v.y = -v.y * SP.rest;
      // spin→velocity exchange (skid/roll)
      var surf_v = SP.roll * v.y / 0.033;
      v.x += (st.w.z) * 0.0004 * SP.mu * 60 * SP.skid;
      v.z += (-st.w.x) * 0.0004 * SP.mu * 60 * SP.skid;
      // spin decay
      st.w.multiplyScalar(1 - SP.mu * 2.2 * dt);
      v.x *= (1 - SP.skid * 0.28 * dt * 60 * 0.016);
      v.z *= (1 - SP.skid * 0.28 * dt * 60 * 0.016);
      HB.bus.emit('ball:bounce', { surface: HB.CFG.current.surface,
        vy: +vin.toFixed(2), loc: [+(p.x).toFixed(1), +(p.z).toFixed(1)], bounces: ++st.bounces });
      if (st.marksOn && HB.COURT.ready)
        HB.COURT.mark(p.x, p.z, Math.abs(st.w.x) > 90 ? 'skid' : 'dot',
          Math.atan2(v.z, v.x));
    }
    st.lastX = p.x; st.lastY = p.y; st.lastZ = p.z;
  }

  function step(dt) {
    if (!st.inPlay) return;
    var acc = 0;
    while (dt > 0 && acc < 0.25) {                 // catch-up cap
      var h = Math.min(SUB, dt);
      physStep(h);
      dt -= h; acc += h;
      if (st.netHit) { st.netHit = false; }
    }
    if (st.p.length() > 200 || Date.now() - (st.tStart || 0) > 12000) reset(true);
    mesh.position.copy(st.p);
    shadow.position.set(st.p.x, 0.041, st.p.z);
    var sc = HB.UTIL.clamp(1 - st.p.y / 9, 0.35, 1);
    shadow.scale.set(sc, sc, sc);
    mesh.rotation.x += st.w.z * dt; mesh.rotation.y += st.w.x * dt;
  }

  function reset(lost) {
    st.inPlay = false;
    mesh.visible = false; shadow.visible = false;
    if (lost) HB.bus.emit('debug:balllost', { at: st.p.toArray() });
  }
  function show() { mesh.visible = true; shadow.visible = true; }
  function hide() { mesh.visible = false; shadow.visible = false; }

  var api = {
    ready: true, build: build, launch: launch, step: step, reset: reset,
    show: show, hide: hide,
    state: function () { return { inPlay: st.inPlay, p: st.p.toArray(), v: st.v.toArray() }; }
  };
  HB.reg('ball', api);
  return api;
})();
