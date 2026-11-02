// core-nav.js — 1 m NAV grid over island top (64×40) + A* (8-neighbour, diag 1.414)
// (ARCH §5). Court apron walkable by default; stands/buildings block via rect().
HB.CORE.nav = (function () {
  var NX = 64, NZ = 44, X0 = -32, Z0 = -22;   // grid origin (x=-32, z=-22)
  var cells = new Uint8Array(NX * NZ);        // 0 free, 1 blocked
  var NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function inGrid(cx, cz) { return cx >= 0 && cx < NX && cz >= 0 && cz < NZ; }
  function w2c(x, z) { return { cx: Math.floor(x - X0), cz: Math.floor(z - Z0) }; }
  function c2w(cx, cz) { return { x: cx + 0.5 + X0, z: cz + 0.5 + Z0 }; }
  function idx(cx, cz) { return cz * NX + cx; }

  function setCell(x, z, blocked) {
    var c = w2c(x, z);
    if (!inGrid(c.cx, c.cz)) return;
    cells[idx(c.cx, c.cz)] = blocked ? 1 : 0;
  }
  var writers = [];
  function rect(x0, z0, x1, z1, blocked, tag) {
    var a = w2c(Math.min(x0, x1), Math.min(z0, z1));
    var b = w2c(Math.max(x0, x1), Math.max(z0, z1));
    for (var cz = Math.max(0, a.cz); cz <= Math.min(NZ - 1, b.cz); cz++)
      for (var cx = Math.max(0, a.cx); cx <= Math.min(NX - 1, b.cx); cx++) {
        cells[idx(cx, cz)] = blocked ? 1 : 0;
        if (tag) (writers[idx(cx, cz)] = writers[idx(cx, cz)] || []).push(tag);
      }
  }
  function who(cx, cz) { return (writers[idx(cx, cz)] || []).join('|') || (cells[idx(cx, cz)] ? 'tagless' : 'free'); }
  var discW = [];
  function disc(x, z, r, blocked) {
    for (var cz = Math.floor(z - r); cz <= Math.ceil(z + r); cz++)
      for (var cx = Math.floor(x - r); cx <= Math.ceil(x + r); cx++)
        if (inGrid(cx, cz)) {
          var w = c2w(cx, cz), dx = w.x - x, dz = w.z - z;
          if (dx * dx + dz * dz <= r * r) cells[idx(cx, cz)] = blocked ? 1 : 0;
        }
  }
  function disc(x, z, r, blocked) {
    for (var cz = Math.floor(z - r); cz <= Math.ceil(z + r); cz++)
      for (var cx = Math.floor(x - r); cx <= Math.ceil(x + r); cx++)
        if (inGrid(cx, cz)) {
          var w = c2w(cx, cz), dx = w.x - x, dz = w.z - z;
          if (dx * dx + dz * dz <= r * r) cells[idx(cx, cz)] = blocked ? 1 : 0;
        }
  }
  function blockedAt(x, z) {
    var c = w2c(x, z);
    if (!inGrid(c.cx, c.cz)) return true;       // off-island is blocked
    return cells[idx(c.cx, c.cz)] === 1;
  }

  function nearestFree(cx, cz, maxR) {
    if (inGrid(cx, cz) && !cells[idx(cx, cz)]) return { cx: cx, cz: cz };
    for (var r = 1; r <= (maxR || 6); r++) {
      for (var dz = -r; dz <= r; dz++)
        for (var dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          var nx = cx + dx, nz = cz + dz;
          if (inGrid(nx, nz) && !cells[idx(nx, nz)]) return { cx: nx, cz: nz };
        }
    }
    return null;
  }

  // A*: returns [{x,z},...] world waypoints (start+goal included) or null.
  function path(ax, az, bx, bz) {
    var A = w2c(ax, az), B = w2c(bx, bz);
    A = nearestFree(A.cx, A.cz); B = nearestFree(B.cx, B.cz);
    if (!A || !B) return null;
    var N = NX * NZ, si = idx(A.cx, A.cz), ti = idx(B.cx, B.cz);
    if (si === ti) return [{ x: bx, z: bz }];
    var gCost = new Float32Array(N).fill(Infinity);
    var from = new Int32Array(N).fill(-1);
    var closed = new Uint8Array(N);
    var open = [si]; gCost[si] = 0;
    var h = function (i, j) { // octile
      var dx = Math.abs((i % NX) - (j % NX)), dz = Math.abs(((i / NX) | 0) - ((j / NX) | 0));
      return (dx > dz ? dx + 1.414 * dz : dz + 1.414 * dx) * 0.5;
    };
    while (open.length) {
      var bi = 0, bf = gCost[open[0]] + h(open[0], ti);
      for (var k = 1; k < open.length; k++) {
        var f = gCost[open[k]] + h(open[k], ti);
        if (f < bf) { bf = f; bi = k; }
      }
      var cur = open.splice(bi, 1)[0];
      if (cur === ti) break;
      closed[cur] = 1;
      var cx = cur % NX, cz = (cur / NX) | 0;
      for (var n = 0; n < 8; n++) {
        var dx2 = NB[n][0], dz2 = NB[n][1];
        var nx2 = cx + dx2, nz2 = cz + dz2;
        if (!inGrid(nx2, nz2)) continue;
        var ni = idx(nx2, nz2);
        if (cells[ni] || closed[ni]) continue;
        var step = (dx2 && dz2) ? 1.414 : 1;
        // no corner cutting: diagonal requires both orthogonals free
        if (dx2 && dz2 && (cells[idx(cx + dx2, cz)] || cells[idx(cx, cz + dz2)])) continue;
        var ng = gCost[cur] + step;
        if (ng < gCost[ni]) {
          gCost[ni] = ng; from[ni] = cur;
          if (open.indexOf(ni) < 0) open.push(ni);
        }
      }
    }
    if (from[ti] < 0 && ti !== si) {
      if (gCost[ti] === Infinity) return null;
    }
    var rev = [], cur2 = ti;
    while (cur2 !== -1) { rev.push(cur2); if (cur2 === si) break; cur2 = from[cur2]; }
    if (rev[rev.length - 1] !== si) return null;
    rev.reverse();
    var wp = rev.map(function (i) { var p = c2w(i % NX, (i / NX) | 0); return { x: p.x, z: p.z }; });
    wp.push({ x: bx, z: bz });                 // snap to exact target
    return simplify(wp);
  }
  function simplify(wp) {                      // drop collinear middles
    if (wp.length < 3) return wp;
    var out = [wp[0]];
    for (var i = 1; i < wp.length - 1; i++) {
      var a = out[out.length - 1], b = wp[i], c = wp[i + 1];
      var d1x = b.x - a.x, d1z = b.z - a.z, d2x = c.x - b.x, d2z = c.z - b.z;
      if (Math.abs(d1x * d2z - d1z * d2x) > 1e-6 || (d1x * d2x < 0) || (d1z * d2z < 0)) out.push(b);
    }
    out.push(wp[wp.length - 1]);
    return out;
  }

  var api = {
    path: path, rect: rect, disc: disc, setCell: setCell,
    blockedAt: blockedAt, cellToWorld: c2w, worldToCell: w2c,
    get size() { return { nx: NX, nz: NZ }; },
    dump: function () { return cells.slice(); }
  };
  HB.reg('nav', api);
  return api;
})();
