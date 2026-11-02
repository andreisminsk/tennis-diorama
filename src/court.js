// court.js — HB.COURT (P1): repaintable court (4 surfaces), regulation lines, net
// (posts/band/mesh/strap), fictional sponsor boards, fading bounce-mark layer,
// NAV apron cells (playing surface + boards blocked, apron walkable).
// ORIENTATION (rotated in P1b per real-stadium convention): long axis along X —
// baselines x=±11.885, net plane x=0 spanning z=±(dX+0.914), sidelines z=±4.115/±5.485.
// Camera from south now sees the court broadside, big stands on the long sidelines.
HB.COURT = (function () {
  var LW = 0.05, LH = 0.008, GY = 0.02;      // line width/height, playing-surface y
  var C = HB.CFG.COURT;                       // halfW 11.885 (x), singlesX 4.115 (z), dX 5.485 (z)
  var NETZ = C.dX + 0.914;                    // posts 0.914 m outside doubles line (z=±6.399)
  var PAINT = {
    grass:  { in: '#57a838', out: '#4a8f30', surround: '#2f6b20', mark: '#1f3a12' },
    clay:   { in: '#b87344', out: '#a05f38', surround: '#8a4a2b', mark: '#e2a874' },
    hard:   { in: '#2f7fb0', out: '#1f5f8a', surround: '#7fb069', mark: '#12335a' },
    carpet: { in: '#4d3f92', out: '#382a6e', surround: '#241a4a', mark: '#b3a5e0' }
  };
  var surface = 'hard';
  var scene_, group, matIn, matOut, matSur, matMark;
  var linesMesh, marks, markSlots = [];
  var MARKS_MAX = 64, MARK_LIFE = 22;

  // ---------- primitives ----------
  function mp(t, x, y, z) { var m = new THREE.Matrix4(); m.makeTranslation(x, y, z); return m; }
  function slabPlane(x, z, y, mat) {
    var g = new THREE.PlaneGeometry(x, z); g.rotateX(-Math.PI / 2);
    var m = new THREE.Mesh(g, mat); m.position.y = y; return m;
  }

  function buildLines() {                     // long axis along X
    var U = HB.UTIL, h = LW / 2, items = [];
    // Lines sit 6 mm ABOVE the slab top (not coplanar): 16-bit depth otherwise
    // z-fights at distance and the far half of the centre line vanished (P4 QA).
    var LGY = GY + 0.006;
    function bx(szX, szZ, x, z) {
      items.push({ g: new THREE.BoxGeometry(szX, LH, szZ), m: mp(0, x, LGY + LH / 2, z) });
    }
    bx(LW, 2 * (C.dX + h),  C.halfW, 0);            // baselines (x=±11.885)
    bx(LW, 2 * (C.dX + h), -C.halfW, 0);
    bx(2 * C.halfW + LW, LW, 0,  C.dX);             // doubles sidelines (z=±5.485)
    bx(2 * C.halfW + LW, LW, 0, -C.dX);
    bx(2 * C.halfW, LW, 0,  C.singlesX);            // singles sidelines (z=±4.115)
    bx(2 * C.halfW, LW, 0, -C.singlesX);
    bx(LW, 2 * C.singlesX,  6.40, 0);               // service lines (x=±6.40)
    bx(LW, 2 * C.singlesX, -6.40, 0);
    bx(12.8, LW, 0, 0);                             // centre service line (along x)
    bx(0.15, LW,  C.halfW - 0.075, 0);              // centre marks
    bx(0.15, LW, -C.halfW + 0.075, 0);
    return new THREE.Mesh(U.mergeGeoms(items),
      new THREE.MeshLambertMaterial({ color: '#f2f2f2' }));
  }

  // ---------- net (plane at x=0, spanning z) ----------
  function netCurve(z2) {
    return C.netH.centre + (C.netH.post - C.netH.centre) *
      Math.pow(Math.abs(z2) / NETZ, 2);
  }
  function stripGeo(yTopFn, yBotFn) {
    var SEG = 32, pos = [], idx = [];
    for (var i = 0; i <= SEG; i++) {
      var z2 = -NETZ + (i / SEG) * 2 * NETZ;
      pos.push(0, yTopFn(z2), z2, 0, yBotFn(z2), z2);
    }
    for (var q = 0; q < SEG; q++) {
      var a = q * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function netGridTex() {
    var c = document.createElement('canvas'); c.width = c.height = 8;
    var g = c.getContext('2d');
    g.fillStyle = 'rgba(10,12,15,1)';
    g.fillRect(0, 0, 8, 2); g.fillRect(0, 0, 2, 8);
    var t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  function buildNet() {
    var band = stripGeo(netCurve, function (z2) { return netCurve(z2) - 0.06; });
    var mesh = stripGeo(function (z2) { return netCurve(z2) - 0.06; },
      function () { return GY; });
    var gm = new THREE.MeshLambertMaterial({ color: '#f2f2f2', side: THREE.DoubleSide });
    var mm = new THREE.MeshLambertMaterial({
      map: netGridTex(), side: THREE.DoubleSide, alphaTest: 0.5, color: '#0d1013'
    });
    mm.map.repeat.set(60, 2);
    var g1 = new THREE.Mesh(band, gm);
    var g2 = new THREE.Mesh(mesh, mm);
    // stripGeo bakes the z-span directly (plane x=0) — no extra rotation
    group.add(g1); group.add(g2);
    var U = HB.UTIL, items = [];
    [NETZ, -NETZ].forEach(function (z2) {
      items.push({ g: new THREE.CylinderGeometry(0.05, 0.05, C.netH.post + 0.04, 8),
        m: mp(0, 0, 0, z2), color: '#525e6c' });          // posts at x=0, z=±NETZ
    });
    items.forEach(function (it) {
      it.m.premultiply(new THREE.Matrix4().makeTranslation(0, (C.netH.post + 0.04) / 2, 0));
    });
    group.add(new THREE.Mesh(U.mergeGeoms(items),
      new THREE.MeshLambertMaterial({ color: '#525e6c', vertexColors: true })));
    var strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, C.netH.centre + 0.06, 0.06),
      new THREE.MeshLambertMaterial({ color: '#f2f2f2' }));
    strap.position.set(0.022, (C.netH.centre + 0.06) / 2, 0);   // clear of net plane
    group.add(strap);
  }

  // ---------- sponsor boards ----------
  function boardTex(label) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 64;
    var g = c.getContext('2d');
    g.fillStyle = '#101317'; g.fillRect(0, 0, 512, 64);
    g.strokeStyle = '#3ecfb2'; g.lineWidth = 3; g.strokeRect(3, 3, 506, 58);
    g.fillStyle = '#f2f6ff';
    g.font = '900 46px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 7; g.lineJoin = 'round';
    g.strokeText(label.toUpperCase(), 256, 34);
    g.fillText(label.toUpperCase(), 256, 34);
    var t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    return t;
  }
  function buildBoards() {
    var B = HB.CFG.sponsors.boards;
    // [x, z, len, rotY, faceX, faceZ] — long-axis layout: big runs on N/S sidelines,
    // short boards behind the new (x=±) baselines
    // Continuous sponsor rows behind each baseline ("short side" of the rotated
    // court): 3 boards per end spanning z −6.9..6.9, facing the court. No boards
    // along the sidelines (players' run-off stays clean).
    var specs = [];   // {x, z, rotY, faceX}
    // Rows flush against the E/W baseline stands (front row x=±16.7): banners read
    // as part of the stand, not as floating strips in the players' run-off.
    [16.5, -16.5].forEach(function (ex) {
      var face = (ex > 0) ? -1 : 1;                 // face toward court (E −X / W +X)
      [-4.6, 0, 4.6].forEach(function (z2) {
        specs.push({ x: ex, z: z2, rotY: face * Math.PI / 2, faceX: face });
      });
    });
    var bodies = [], i = 0;
    specs.forEach(function (s) {
      bodies.push({ g: new THREE.BoxGeometry(0.14, 0.9, 4.6),
        m: mp(0, s.x, 0.45, s.z), color: '#262d36' });
      var pl = new THREE.Mesh(
        new THREE.PlaneGeometry(4.45, 0.7),
        new THREE.MeshBasicMaterial({ map: boardTex(B[i % B.length]),
          side: THREE.DoubleSide }));
      pl.position.set(s.x + s.faceX * 0.09, 0.45, s.z);
      pl.rotation.y = s.rotY;
      group.add(pl);
      i++;
    });
    group.add(new THREE.Mesh(HB.UTIL.mergeGeoms(bodies),
      new THREE.MeshLambertMaterial({ color: '#262d36', vertexColors: true })));
  }

  // ---------- bounce marks ----------
  function buildMarks() {
    matMark = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.45, depthWrite: false, color: PAINT[surface].mark
    });
    var geo = new THREE.CircleGeometry(1, 10); geo.rotateX(-Math.PI / 2);
    marks = new THREE.InstancedMesh(geo, matMark, MARKS_MAX);
    marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    var z0 = new THREE.Matrix4().makeScale(0, 0, 0);
    for (var i = 0; i < MARKS_MAX; i++) {
      marks.setMatrixAt(i, z0);
      markSlots.push({ age: 1e9, ang: 0, sx: 0, sz: 0, x: 0, z: 0 });
    }
    group.add(marks);
  }
  function mark(x, z, kind, ang) {
    var i;
    for (i = 0; i < MARKS_MAX; i++) if (markSlots[i].age > MARK_LIFE) break;
    if (i >= MARKS_MAX) i = Math.floor(Math.random() * MARKS_MAX);
    var s = markSlots[i];
    s.age = 0; s.ang = ang || 0; s.x = x; s.z = z;
    if (kind === 'skid') { s.sx = 0.48; s.sz = 0.14; } else { s.sx = s.sz = 0.16; }
    composeMark(i, s, 1);
  }
  function composeMark(i, s, k) {
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, s.ang, 0);
    m.compose(new THREE.Vector3(s.x, 0.036, s.z),
      q.setFromEuler(e), new THREE.Vector3(s.sx * k, 1, s.sz * k));
    marks.setMatrixAt(i, m);
    marks.instanceMatrix.needsUpdate = true;
  }
  function fadeMarks(dt) {
    for (var i = 0; i < MARKS_MAX; i++) {
      var s = markSlots[i];
      if (s.age > MARK_LIFE) continue;
      s.age += dt;
      var k = Math.max(0, 1 - s.age / MARK_LIFE);
      if (k <= 0.02) { s.age = 1e9; marks.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); }
      else composeMark(i, s, k);
    }
    marks.instanceMatrix.needsUpdate = true;
  }

  // ---------- build / surface ----------
  function build(sc) {
    scene_ = sc; group = new THREE.Group(); group.name = 'court';
    matSur = new THREE.MeshLambertMaterial({ color: PAINT[surface].surround });
    matIn = new THREE.MeshLambertMaterial({ color: PAINT[surface].in });
    matOut = new THREE.MeshLambertMaterial({ color: PAINT[surface].out });
    group.add(slabPlane(34.0, 19.2, 0.004, matSur));           // apron: long axis x
    group.add(slabPlane(2 * C.halfW, 2 * C.singlesX, GY, matIn));
    var parts = [
      { g: new THREE.PlaneGeometry(2 * C.halfW, C.dX - C.singlesX), px: 0, pz: (C.singlesX + C.dX) / 2 },
      { g: new THREE.PlaneGeometry(2 * C.halfW, C.dX - C.singlesX), px: 0, pz: -(C.singlesX + C.dX) / 2 },
      { g: new THREE.PlaneGeometry(12.3 - C.halfW, 2 * C.dX), px: (C.halfW + 12.3) / 2, pz: 0 },
      { g: new THREE.PlaneGeometry(12.3 - C.halfW, 2 * C.dX), px: -(C.halfW + 12.3) / 2, pz: 0 }
    ];
    parts.forEach(function (p) {
      p.g.rotateX(-Math.PI / 2); p.g.translate(p.px, GY, p.pz);
    });
    group.add(new THREE.Mesh(HB.UTIL.mergeGeoms(parts), matOut));
    linesMesh = buildLines(); group.add(linesMesh);
    buildNet(); buildBoards(); buildMarks();
    sc.add(group);

    // NAV: court slab + net + board footprints blocked; apron walkable (§5)
    var nav = HB.CORE.nav;
    nav.rect(-12.5, -6.0, 12.5, 6.0, true);                    // slab (players use exact coords)
    nav.rect(16.4, -6.9, 16.7, 6.9, true);                     // board row E (at stand)
    nav.rect(-16.7, -6.9, -16.4, 6.9, true);                   // board row W (at stand)

    HB.CORE.task(function* () {
      while (true) { yield HB.wait(0.25); fadeMarks(0.25); }
    }, { name: 'court:marks', max: 30 });

    HB.bus.on('surface:set', function (d) {
      if (d && d.surface && PAINT[d.surface]) setSurface(d.surface);
    });
    return api;
  }

  function setSurface(s) {
    if (!PAINT[s] || !matIn) return;
    surface = s;
    matIn.color.set(PAINT[s].in);
    matOut.color.set(PAINT[s].out);
    matSur.color.set(PAINT[s].surround);
    matMark.color.set(PAINT[s].mark);
    for (var i = 0; i < MARKS_MAX; i++) {
      markSlots[i].age = 1e9;
      marks.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    }
    marks.instanceMatrix.needsUpdate = true;
  }

  function debugWire(on) {
    group.traverse(function (o) {
      if (o.material && o.material.isMeshLambertMaterial) o.material.wireframe = !!on;
    });
  }
  function debugInfo() {
    linesMesh.geometry.computeBoundingBox();
    var b = linesMesh.geometry.boundingBox;
    return {
      surface: surface, expected: { halfW: 11.885, singlesX: 4.115, dX: 5.485, serviceX: 6.40 },
      linesBounds: { minX: +b.min.x.toFixed(3), maxX: +b.max.x.toFixed(3),
                     minZ: +b.min.z.toFixed(3), maxZ: +b.max.z.toFixed(3) },
      net: { postZ: NETZ, postH: C.netH.post, centreH: C.netH.centre, width: 2 * NETZ },
      groundY: GY
    };
  }

  var api = {
    ready: true, build: build, setSurface: setSurface, mark: mark,
    netInfo: function () { return { postZ: NETZ, postH: C.netH.post, centreH: C.netH.centre }; },
    groundY: function () { return GY; },
    debugWire: debugWire, debugInfo: debugInfo, cutawayList: function () { return []; },
    get surface() { return surface; }
  };
  HB.reg('court', api);
  return api;
})();
