// kin.js — HB.KIN (P4): shot solver. start/target(+clearance)/spin -> v0.
// Bisection on launch speed over a full drag+Magnus forward sim: distance-to-landing
// is monotone in speed (for fixed dir/vy-profile), so we bisect until |err|<0.35 m.
// Aim error is applied to the TARGET by the caller BEFORE solving (ARCH §11).
HB.KIN = (function () {
  var G = 9.81;
  var KDRAG = 0.5 * 1.225 * 0.55 * Math.PI * 0.033 * 0.033 / 0.057;  // 0.0204
  var KMAG = 0.000457;   // Magnus sigma (Saviano/Nielsen tennis-fit): a=σ(ω×v)

  function V(o) { return (o && o.isVector3) ? o : new THREE.Vector3(o.x, o.y || 0, o.z); }

  // ONE spin convention for kin+ball: {top, side} rpm-ish -> rad/s vector (world).
  // v travels +x: topspin (top<0) must dip: a=KMAG(w×v), w=(0,0,ω): a_y=ω·KMAG·v.x
  // → ω<0 dips ✓. Return in world axes given travel dir sign.
  function syncW(spin, dirX) {
    var s = dirX > 0 ? 1 : -1;
    var R2W = 0.105;                 // rpm -> rad/s (2π/60)
    return new THREE.Vector3(
      0,
      -s * (spin.side || 0) * R2W,   // sidespin: about Y
      (spin.top || 0) * s * R2W);    // topspin: about Z; top<0 (rally topspin) dips
  }

  // Air-only forward sim. Returns landing point (p.y<=groundY) and net-cross height.
  function flight(start, v, w, groundY, netZ, dirSign) {
    var p = start.clone(), vel = v.clone();
    var dt = 1 / 240, apex = p.y, yNet = null, tNet = 0, t = 0;
    for (var i = 0; i < 1200; i++) {
      var sp = vel.length();
      var ax = -KDRAG * sp * vel.x + KMAG * (w.y * vel.z - w.z * vel.y);
      var ay = -G - KDRAG * sp * vel.y + KMAG * (w.z * vel.x - w.x * vel.z);
      var az = -KDRAG * sp * vel.z + KMAG * (w.x * vel.y - w.y * vel.x);
      vel.x += ax * dt; vel.y += ay * dt; vel.z += az * dt;
      var lastX = p.x, lastY = p.y, lastZ = p.z;
      p.x += vel.x * dt; p.y += vel.y * dt; p.z += vel.z * dt;
      t += dt;
      if (p.y > apex) apex = p.y;
      if (yNet === null && Math.sign(p.x) !== Math.sign(dirSign)) {
        var k = (0 - lastX) / ((p.x - lastX) || 1e-9);
        yNet = lastY + (p.y - lastY) * k;
        tNet = t;
      }
      if (p.y <= groundY) break;
    }
    return { pos: p, vel: vel, apex: apex, yNet: yNet, tNet: tNet, t: t };
  }

  // vy profile FIXED at seed speed (default 30 m/s mid-arc); only the horizontal
  // component scales during bisection — otherwise fast seeds flatten out short.
  function makeVFactory(start, dir, spinTop, dist) {
    var tSeed = HB.UTIL.clamp(dist / 30, 0.5, 1.6);
    var vy = HB.UTIL.clamp(
      (0.25 - start.y + 0.5 * G * tSeed * tSeed) / tSeed - (spinTop || 0) * 0.0022,
      0.4, 3.4);
    return function (speed) {
      return new THREE.Vector3(dir.x * speed, vy, dir.z * speed);
    };
  }

  // solve(aim): {start, target, spin{top,side}, clearance, Tscale}
  function solve(aim) {
    var start = V(aim.start);
    var target = V(aim.target); target.y = 0.03;
    var spin = aim.spin || { top: 0, side: 0 };
    var groundY = 0.03;
    var clearance = aim.clearance != null ? aim.clearance : 0.35;
    var dir = new THREE.Vector3(target.x - start.x, 0, target.z - start.z);
    var dist = dir.length(); dir.normalize();
    // Magnus axes (SHARED with ball.js — see syncW below): topspin = negative rate
    // about −Z for +x travel (dips), sidespin about Y curves.
    var w = syncW(spin, dir.x);

    // 1) bisection on SPEED at fixed vy profile
    var vmk = makeVFactory(start, dir, spin.top, dist);
    var lo = 10, hi = 62, best = null;
    for (var iter = 0; iter < 30; iter++) {
      var mid = (lo + hi) / 2;
      var v0 = vmk(mid);
      var f = flight(start, v0, w, groundY, 0, dir.x);
      var reach = Math.hypot(f.pos.x - start.x, f.pos.z - start.z);
      best = { v0: v0, f: f };
      if (reach < dist - 0.25) lo = mid;         // too short → faster
      else if (reach > dist + 0.25) hi = mid;    // too long → slower
      else break;                                 // landed within 0.25 m
    }
    var v0 = best.v0, f = best.f;
    // 2) clearance pass: if net-cross below wanted, raise vy (re-bisect once)
    var tries = 0;
    while ((f.yNet === null || f.yNet < clearance) && tries++ < 6) {
      v0.y += 0.28;
      f = flight(start, v0, w, groundY, 0, dir.x);
      // keep it landing near target: retrim speed after vy bump
      var reach = Math.hypot(f.pos.x - start.x, f.pos.z - start.z);
      if (reach > dist + 0.6) { v0.x -= dir.x * (reach - dist) / f.t * f.t; }
    }
    return {
      v0: v0.clone(), w: w.clone(), hitTime: f.t, netT: f.tNet, apex: f.apex,
      landing: f.pos.clone(), netY: f.yNet
    };
  }

  return { solve: solve, flight: flight, syncW: syncW };
})();

HB.reg('kin', HB.KIN);
