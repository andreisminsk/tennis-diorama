// kin.js — HB.KIN (P4): shot solver. start/target(+clearance)/spin -> v0.
// Iterative forward-sim refinement (drag + Magnus aware): aim error applied to the
// TARGET before solving, so real misses (long/wide/net) emerge honestly (ARCH §11).
HB.KIN = (function () {
  var G = 9.81;

  // ---------- ballistics ----------
  function step(p, v, w, dt, bounce) {
    // quadratic drag + Magnus
    var sp = v.length();
    var Cd = 0.55, rho = 1.225, m = 0.057, r = 0.033;
    var k = 0.5 * rho * Cd * Math.PI * r * r / m;      // per-sec^2 at v=1
    var a = new THREE.Vector3(0, -G, 0);
    a.addScaledVector(v, -k * sp);
    var magnus = w.clone().cross(v).multiplyScalar(0.000568 / m); // σ term
    a.add(magnus);
    v.addScaledVector(a, dt);
    p.addScaledVector(v, dt);
  }

  // Simulate v0 with full physics, ignoring surface interaction (air only).
  // Returns {t_cross, apex, y_at_net, overshoot, out_by, ok, T_hit}
  function flight(x0, v0, w, target, clearance, netX, groundY) {
    var p = new THREE.Vector3().copy(x0);
    var v = new THREE.Vector3().copy(v0);
    var tt = 0, dt = 1 / 240, apex = p.y, out = 0, yNet = null, tNet = 0;
    for (var i = 0; i < 900; i++) {
      step(p, v, w, dt, null);
      tt += dt;
      if (p.y > apex) apex = p.y;
      // crossed the net plane (x=0)?
      if (yNet === null) {
        if ((x0.x < netX && p.x >= netX) || (x0.x > -netX && p.x <= -netX)) { /*noop*/ }
        if (Math.sign(p.x) !== Math.sign(x0.x) || Math.abs(p.x) < 1e-6) {
          yNet = p.y; tNet = tt;
        }
      }
      if (p.y <= groundY) break;
    }
    return { time: tt, apex: apex, yNet: yNet, tNet: tNet, pos: p.clone(), vel: v.clone() };
  }

  // ---------- solver ----------
  // start {x,y,z}, target {x,z} (y=solved at groundY), spin {top, side} in rad/s,
  // clearance: min height at the net plane, groundY, netX (net plane distance)
  // Returns {v0, w, hitTime, netT, apex} or null when unreachable.
  function V(o) { return (o && o.isVector3) ? o : new THREE.Vector3(o.x, o.y || 0, o.z); }
  function solve(aim) {
    var start = V(aim.start), target = V(aim.target), spin = aim.spin || { top: 0, side: 0 };
    var groundY = aim.groundY != null ? aim.groundY : 0.02;
    var clearance = aim.clearance != null ? aim.clearance : 0.35;
    var netX = aim.netX != null ? aim.netX : 0;
    var vhoriz0 = Math.hypot(target.x - start.x, target.z - start.z);
    var T = aim.T || HB.UTIL.clamp(vhoriz0 / 26.0, 0.55, 1.5) * (aim.Tscale || 1);

    var dir = new THREE.Vector3(target.x - start.x, 0, target.z - start.z);
    var dist = dir.length(); dir.normalize();

    var v0 = new THREE.Vector3(dir.x, 0.42, dir.z);   // seed: ~24° launch
    var w = new THREE.Vector3(-spin.top, 0, spin.side * (dir.x > 0 ? -1 : 1));

    for (var iter = 0; iter < 26; iter++) {
      var f = flight(start, v0.clone().normalize().multiplyScalar(
        v0.length()), w, target, clearance, netX, groundY);
      // vertical error at landing
      var overshoot = f.pos.z - target.z;
      // adjust speed by horizontal shortfall
      var vhoriz = Math.hypot(v0.x, v0.z);
      var fhoriz = Math.hypot(
        f.pos.x - start.x, f.pos.z - start.z);
      var ratio = fhoriz > 0.3 ? dist / fhoriz : 1.4;
      if (Math.abs(1 - ratio) < 0.01 && Math.abs(v0.y - 0.42) < 0.02) break;
      // re-aim: scale horizontal, tune launch y for clearance
      v0.x = dir.x * vhoriz * ratio;
      v0.z = dir.z * vhoriz * ratio;
      // clearance: if sim crosses net below wanted height, raise vy (iterate crude)
      if (f.yNet !== null && f.yNet < clearance && v0.y < 1.2) v0.y += 0.12;
      else if (f.yNet !== null && f.yNet > clearance + 0.55 && v0.y > 0.2) v0.y -= 0.08;
      v0.y = HB.UTIL.clamp(v0.y, 0.12, 1.35);
    }
    var f2 = flight(start, v0, w, target, clearance, netX, groundY);
    return { v0: v0.clone(), w: w.clone(), hitTime: f2.time, netT: f2.tNet,
             apex: f2.apex, landing: f2.pos };
  }

  return { solve: solve, flight: flight, step: step };
})();

HB.reg('kin', HB.KIN);
