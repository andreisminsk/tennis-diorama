// grounds.js — HB.GROUNDS (P1b): island (top+rock), entrance plaza + marquee + gates,
// garden, practice court, paths, rim trees, floodlight masts, NAV blocking (ARCH §5/§13).
HB.GROUNDS = (function () {
  var U = HB.UTIL;
  var G;

  function tx(x, y, z) { var m = new THREE.Matrix4(); m.makeTranslation(x, y, z); return m; }
  function trs(x, y, z, ry) {
    var m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
      new THREE.Vector3(1, 1, 1));
    return m;
  }

  var TREES = [ // [x, z, scale]
    [-27, -13, 1.2], [26.5, -12, 1.0], [27.5, 1.5, 1.3], [24, 10.6, 0.9],
    [-24.5, 16.6, 0.9], [-8.6, -19.6, 1.0], [-26.8, 11.2, 1.1],
    [13.6, 12, 0.95], [16.2, 11.8, 1.15], [19.2, 12, 0.9], [14.4, 16, 0.85], [18.2, 15.9, 1.05]
  ];
  var LAMPS = [[-19.4, 13.2], [-11.8, 16.6], [12, 13], [-12.2, 11]];
  var BEDS = [[13.8, 13.4], [16.4, 13.4], [19, 13.4]];
  var BENCHES = [];
  function bench(x, z, ry) {
    BENCHES.push({ g: new THREE.BoxGeometry(1.7, 0.1, 0.46), m: trs(x, 0.42, z, ry) });
    BENCHES.push({ g: new THREE.BoxGeometry(1.7, 0.4, 0.07),
      m: trs(x - 0.2 * Math.sin(ry), 0.72, z - 0.2 * Math.cos(ry), ry) });
  }

  function vcMat() {
    return new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true });
  }

  function build(sc) {
    G = new THREE.Group(); G.name = 'grounds';
    // strip boot placeholders (real island replaces them)
    ['islandTop', 'islandRock'].forEach(function (n) {
      var o = sc.getObjectByName(n);
      if (o) { sc.remove(o); o.geometry.dispose(); }
    });
    island(); paths(); plaza(); garden(); practice(); trees(); masts();
    if (BENCHES.length)
      G.add(new THREE.Mesh(U.mergeGeoms(BENCHES),
        new THREE.MeshLambertMaterial({ color: '#85613f' })));
    sc.add(G);
    navBlocks();
    return api;
  }

  function island() {
    var topGeo = new THREE.CircleGeometry(1, 56);
    topGeo.scale(HB.CFG.island.rx, HB.CFG.island.rz, 1);
    topGeo.rotateX(-Math.PI / 2);
    G.add(new THREE.Mesh(topGeo, new THREE.MeshLambertMaterial({ color: '#3f8a2f' })));
    var rock = new THREE.CylinderGeometry(1, 0.62, HB.CFG.island.rockDepth, 56, 1, false);
    rock.scale(HB.CFG.island.rx, 1, HB.CFG.island.rz);
    var rm = new THREE.Mesh(rock, new THREE.MeshLambertMaterial({ color: '#4a423b' }));
    rm.position.y = -HB.CFG.island.rockDepth / 2 - 0.15;
    G.add(rm);
  }

  function paths() {
    function p(w, d, x, z) {
      var g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2); g.translate(x, 0.016, z);
      return { g: g, color: '#b2a698' };
    }
    var items = [
      p(2.4, 1.4, -10.6, 14.8),   // plaza ↔ apron
      p(1.6, 1.0, -15.5, 18.05),  // plaza ↔ gates
      p(4.2, 1.4, -18.8, 0),      // apron ↔ practice court (apron now spans x ±17)
      p(2.4, 1.4, 10.6, 14.6),    // apron ↔ garden
      p(3.2, 1.3, 13.4, 14.6)
    ];
    G.add(new THREE.Mesh(U.mergeGeoms(items), vcMat()));
  }

  function bannerTex(label, sub) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 96;
    var g = c.getContext('2d');
    g.fillStyle = '#111318'; g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#3ecfb2'; g.lineWidth = 4; g.strokeRect(4, 4, 504, 88);
    g.fillStyle = '#e8f0ff';
    g.font = '900 32px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, 256, sub ? 34 : 48);
    if (sub) { g.font = '600 21px Arial'; g.fillStyle = '#3ecfb2'; g.fillText(sub, 256, 70); }
    var t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    return t;
  }

  function plaza() { // south-west (ARCH §5)
    var pg = new THREE.CircleGeometry(1, 40);
    pg.scale(4.0, 2.6, 1); pg.rotateX(-Math.PI / 2); pg.translate(-13.8, 0.02, 15.4);
    G.add(new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ color: '#cfc5b4' })));
    // marquee
    var items = [];
    [[-2.4, -1.2], [2.4, -1.2], [-2.4, 1.2], [2.4, 1.2]].forEach(function (c) {
      items.push({ g: new THREE.CylinderGeometry(0.1, 0.13, 3.0, 8),
        m: tx(-13.6 + c[0], 1.5, 14.6 + c[1]), color: '#85613f' });
    });
    items.push({ g: new THREE.BoxGeometry(5.6, 0.2, 3.2),
      m: tx(-13.6, 3.05, 14.6), color: '#6b4a2f' });
    G.add(new THREE.Mesh(U.mergeGeoms(items), vcMat()));
    var bn = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.0),
      new THREE.MeshBasicMaterial({ map: bannerTex('HOLLYBROOK OPEN', 'SINGLES FINAL') }));
    bn.position.set(-13.6, 2.35, 15.9);
    G.add(bn);
    // gates at the island rim
    var gi = [
      { g: new THREE.BoxGeometry(0.45, 2.3, 0.45), m: tx(-16.9, 1.15, 18.3), color: '#96897c' },
      { g: new THREE.BoxGeometry(0.45, 2.3, 0.45), m: tx(-14.1, 1.15, 18.3), color: '#96897c' },
      { g: new THREE.BoxGeometry(3.1, 0.34, 0.5), m: tx(-15.5, 2.5, 18.3), color: '#7d7469' }
    ];
    G.add(new THREE.Mesh(U.mergeGeoms(gi), vcMat()));
    bench(-15.6, 14.6, Math.PI / 2 + 0.2); bench(-11.6, 13.6, -0.9); bench(-13.9, 17.2, 0.1);
  }

  function garden() { // south-east
    var lg = new THREE.CircleGeometry(1, 40);
    lg.scale(6.8, 4.2, 1); lg.rotateX(-Math.PI / 2); lg.translate(16.8, 0.012, 14.6);
    G.add(new THREE.Mesh(lg, new THREE.MeshLambertMaterial({ color: '#2f6b20' })));
    var items = [];
    BEDS.forEach(function (b, i) {
      items.push({ g: new THREE.BoxGeometry(2.1, 0.12, 0.9),
        m: tx(b[0], 0.08, b[1]), color: ['#e8365a', '#f7c531', '#f28cb1'][i] });
    });
    G.add(new THREE.Mesh(U.mergeGeoms(items), vcMat()));
    bench(14.2, 16.9, 0.35); bench(18.6, 16.7, -0.25);
  }

  function practice() { // west (beyond the rotated court's apron)
    var CX = -24.8;
    var slab = new THREE.PlaneGeometry(8.4, 18.6);
    slab.rotateX(-Math.PI / 2); slab.translate(CX, 0.006, 0);
    G.add(new THREE.Mesh(slab, new THREE.MeshLambertMaterial({ color: '#57a838' })));
    var I = [], ly = 0.012;
    function lp(w, d, x, z) {
      var g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2); g.translate(x, ly, z);
      I.push({ g: g });
    }
    lp(0.06, 17.6, CX - 3.35, 0); lp(0.06, 17.6, CX + 3.35, 0);
    lp(6.76, 0.06, CX, 8.8); lp(6.76, 0.06, CX, -8.8);
    lp(6.76, 0.06, CX, 4.4); lp(6.76, 0.06, CX, -4.4);
    lp(0.06, 8.8, CX, 0);
    G.add(new THREE.Mesh(U.mergeGeoms(I), new THREE.MeshLambertMaterial({ color: '#f2f2f2' })));
    var N = [
      { g: new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6), m: tx(CX - 3.5, 0.4, 0) },
      { g: new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6), m: tx(CX + 3.5, 0.4, 0) },
      { g: new THREE.BoxGeometry(7.06, 0.06, 0.05), m: tx(CX, 0.79, 0) }
    ];
    G.add(new THREE.Mesh(U.mergeGeoms(N), new THREE.MeshLambertMaterial({ color: '#525e6c' })));
    var nm = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.7),
      new THREE.MeshBasicMaterial({ color: '#0d1013', transparent: true, opacity: 0.35,
        side: THREE.DoubleSide }));
    nm.position.set(CX, 0.39, 0);
    G.add(nm);
  }

  function trees() {
    var trunks = [], leaves = [];
    var FOL = ['#1f4d18', '#2f6b20', '#48882b', '#6da83e'];
    TREES.forEach(function (T, i) {
      var x = T[0], z = T[1], s = T[2];
      trunks.push({ g: new THREE.CylinderGeometry(0.13 * s, 0.2 * s, 2 * s, 7),
        m: tx(x, s, z), color: '#6b4a2f' });
      var col = FOL[i % FOL.length];
      leaves.push({ g: new THREE.IcosahedronGeometry(1.25 * s, 0), m: tx(x, 2.55 * s, z), color: col });
      leaves.push({ g: new THREE.IcosahedronGeometry(0.9 * s, 0),
        m: tx(x + 0.35, 3.4 * s, z - 0.2), color: col });
    });
    G.add(new THREE.Mesh(U.mergeGeoms(trunks), vcMat()));
    G.add(new THREE.Mesh(U.mergeGeoms(leaves), vcMat()));
  }

  function masts() { // 4 floodlight masts (±18, ±14); lamp heads glow at night
    var M = [], L = [];
    HB.CFG.masts.forEach(function (m) {
      M.push({ g: new THREE.CylinderGeometry(0.16, 0.24, 13, 8), m: tx(m[0], 6.5, m[1]) });
      M.push({ g: new THREE.BoxGeometry(3.6, 0.3, 0.55), m: tx(m[0], 12.6, m[1]) });
      for (var i = -1; i <= 1; i++)
        L.push({ g: new THREE.BoxGeometry(0.95, 0.34, 0.44), m: tx(m[0] + i * 1.2, 12.18, m[1]) });
    });
    G.add(new THREE.Mesh(U.mergeGeoms(M), new THREE.MeshLambertMaterial({ color: '#525e6c' })));
    var lm = new THREE.MeshLambertMaterial({ color: '#39424e',
      emissive: '#cfe0ff', emissiveIntensity: 0 });
    lm.__emissive = 1.7;                         // driven by tod preset (core-light)
    G.add(new THREE.Mesh(U.mergeGeoms(L), lm));
  }

  function navBlocks() {
    var n = HB.CORE.nav;
    n.rect(-29.2, -9.5, -20.4, 9.5, true);       // practice slab (moved west)
    n.rect(-16.2, 13.2, -11.0, 16.0, true);      // marquee
    n.rect(-17.2, 18.0, -13.8, 18.6, true);      // gates
    BEDS.forEach(function (b) { n.rect(b[0] - 1.1, b[1] - 0.5, b[0] + 1.1, b[1] + 0.5, true); });
    TREES.forEach(function (T) { n.disc(T[0], T[1], 0.8, true); });
    LAMPS.forEach(function (L) { n.disc(L[0], L[1], 0.3, true); });
    HB.CFG.masts.forEach(function (M) { n.disc(M[0], M[1], 0.55, true); });
    [
      [-15.6, 14.6], [-11.6, 13.6], [-13.9, 17.2], [14.2, 16.9], [18.6, 16.7]
    ].forEach(function (b) { n.rect(b[0] - 0.95, b[1] - 0.4, b[0] + 0.95, b[1] + 0.4, true); });
  }

  var api = { ready: true, build: build, cutawayList: function () { return []; } };
  HB.reg('grounds', api);
  return api;
})();
