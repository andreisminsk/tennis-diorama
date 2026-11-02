// util.js — HB.UTIL: rng, colour (OKLab), lerp/clamp/ease, geometry merge (ARCH §2).
HB.UTIL = (function () {

  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngRange(r, a, b) { return a + (b - a) * r(); }
  function rngPick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }
  function rngNorm(r) { // Box-Muller, mean 0 sd 1
    var u1 = Math.max(r(), 1e-9), u2 = r();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function hex2rgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16) / 255,
            parseInt(h.slice(2, 4), 16) / 255,
            parseInt(h.slice(4, 6), 16) / 255];
  }
  function rgb2hex(r, g, b) {
    function c2(v) { v = clamp(Math.round(v), 0, 255).toString(16); return v.length < 2 ? '0' + v : v; }
    return '#' + c2(r * 255) + c2(g * 255) + c2(b * 255);
  }

  function cub(t) { return t < 0 ? -Math.pow(-t, 1 / 3) : Math.pow(t, 1 / 3); }
  function oklab(linR, linG, linB) { // linear sRGB -> OKLab
    var l = 0.4122214708 * linR + 0.5363325363 * linG + 0.0514459929 * linB;
    var m = 0.2119034982 * linR + 0.6806995451 * linG + 0.1073969566 * linB;
    var s = 0.0883024619 * linR + 0.2817188376 * linG + 0.6299787005 * linB;
    var l_ = cub(l), m_ = cub(m), s_ = cub(s);
    return [0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_];
  }
  function palTable(palette) { // ['#hex',...] -> [{hex, rgb, ok}]
    return palette.map(function (h) {
      var c = hex2rgb(h);
      var lin = [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)];
      return { hex: h, rgb: c, ok: oklab(lin[0], lin[1], lin[2]) };
    });
  }
  function nearest(pal, r, g, b) { // sRGB [0..1] -> palette index (OKLab NN)
    var L = oklab(Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2));
    var best = 1e12, bi = 0;
    for (var i = 0; i < pal.length; i++) {
      var o = pal[i].ok, d0 = L[0] - o[0], d1 = L[1] - o[1], d2 = L[2] - o[2];
      var d = d0 * d0 + d1 * d1 + d2 * d2;
      if (d < best) { best = d; bi = i; }
    }
    return bi;
  }

  // Merge BufferGeometries into one flat (non-indexed) geometry.
  // items: [{g: BufferGeometry, m?: Matrix4, color?: '#hex'|[r,g,b]}, ...]
  // NOTE: applies m in place to non-indexed inputs (clone first if reuse needed).
  function mergeGeoms(items) {
    var pos = [], nor = [], col = [];
    var useColor = items.some(function (it) { return it.color !== undefined; });
    items.forEach(function (it) {
      var g = it.g.index ? it.g.toNonIndexed() : it.g;
      if (it.m) g.applyMatrix4(it.m);
      if (!g.attributes.normal) g.computeVertexNormals();
      var p = g.attributes.position.array, n = g.attributes.normal.array;
      var i;
      for (i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
      if (useColor) {
        var rgb = (typeof it.color === 'string') ? hex2rgb(it.color) : (it.color || [1, 1, 1]);
        var cnt = p.length / 3;
        for (i = 0; i < cnt; i++) col.push(rgb[0], rgb[1], rgb[2]);
      }
      if (g !== it.g) g.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    if (useColor) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return out;
  }

  return {
    rng: mulberry32, rngRange: rngRange, rngPick: rngPick, rngNorm: rngNorm,
    clamp: clamp, lerp: lerp, smoothstep: smoothstep, easeInOut: easeInOut, easeOut: easeOut,
    hex2rgb: hex2rgb, rgb2hex: rgb2hex, oklab: oklab, palTable: palTable, nearest: nearest,
    mergeGeoms: mergeGeoms
  };
})();

HB.reg('util', HB.UTIL);
