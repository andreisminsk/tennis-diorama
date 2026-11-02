// club.js — HB.CLUB (P1b): stands (instanced seats, doll's-house cutaway),
// clubhouse (clock, flags, banners), animated LED video board, NAV blocks (ARCH §5/§7).
HB.CLUB = (function () {
  var U = HB.UTIL;
  var G, cut = [];       // cut: [{grp, k, target, __cut{quad}, __mats, __seats}]
  var ledTex, ledCtx, ledMesh, clockTex, clockCtx, flags = [], ledT = 0;

  function tx(x, y, z) { var m = new THREE.Matrix4(); m.makeTranslation(x, y, z); return m; }
  function vcMat() {
    return new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true,
      transparent: true });
  }

  // ---- one grandstand: merged steps + instanced seats, tag for cutaway ----
  function stand(len, rows, cols) {
    var grp = new THREE.Group();
    var steps = [], stepH = 0.52, stepD = 0.92;
    for (var r = 0; r < rows; r++)
      steps.push({ g: new THREE.BoxGeometry(len, stepH, stepD),
        m: tx(0, stepH / 2 + r * stepH, r * stepD), color: r % 2 ? '#7d7469' : '#8f8578' });
    steps.push({ g: new THREE.BoxGeometry(len, 1.05, 0.3), m: tx(0, 0.5, -0.15),
      color: '#5e564d' });
    grp.add(new THREE.Mesh(U.mergeGeoms(steps), vcMat()));
    var seatG = new THREE.BoxGeometry(0.44, 0.5, 0.44);
    var seatM = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true });
    var n = rows * cols, im = new THREE.InstancedMesh(seatG, seatM, n);
    im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    var ACC = ['#c8102e', '#f2f2f2', '#1e3a8a', '#f7c531', '#3ecfb2', '#f28cb1', '#64748b'];
    var m4 = new THREE.Matrix4(), col = new THREE.Color();
    var pitch = len / cols, i = 0;
    for (var rr = 0; rr < rows; rr++)
      for (var cc = 0; cc < cols; cc++) {
        m4.makeTranslation(-len / 2 + pitch * (cc + 0.5), stepH * rr + stepH + 0.25,
          rr * stepD + stepD / 2);
        im.setMatrixAt(i, m4);
        col.set(ACC[(i * 7 + rr * 3) % ACC.length]);
        im.setColorAt(i, col);
        i++;
      }
    im.instanceColor.needsUpdate = true;
    grp.add(im);
    grp.__seats = im;
    grp.__mats = [grp.children[0].material, seatM];
    grp.__cutQ = 0;                       // real quad assigned in buildStands()
    return grp;
  }

  function buildStands() {
    // long axis of court is X: big stands on N/S sidelines, small on baseline ends
    function place(grp, x, z, ry, quad, phi) {
      grp.position.set(x, 0, z); grp.rotation.y = ry; G.add(grp);
      cut.push({ grp: grp, k: 0, phi: phi, __cut: { quad: quad },
                 __mats: grp.__mats, __seats: grp.__seats });
    }
    place(stand(27, 4, 20), 0, 8.6, 0, 0, 0);               // south sideline (4 rows: plaza behind)
    place(stand(27, 8, 22), 0, -8.6, Math.PI, 2, Math.PI);  // north sideline (LED above)
    place(stand(16, 4, 12), 16.9, 0, Math.PI / 2, 1, Math.PI / 2);   // east baseline
    place(stand(14, 4, 10), -16.4, 0, -Math.PI / 2, 3, -Math.PI / 2); // west baseline (shorter: plaza passage on its south)
  }

  // ---- clubhouse (north) ----
  function clockCanvas() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    clockCtx = c.getContext('2d');
    var t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    clockTex = t;
    drawClock(10 * 3600 + 24 * 60);
  }
  function drawClock(secs) {                  // fat strokes: must survive RT half-res
    var g = clockCtx, cx = 64, cy = 64;
    g.fillStyle = '#f2f2f2'; g.beginPath(); g.arc(cx, cy, 58, 0, 7); g.fill();
    g.strokeStyle = '#101317'; g.lineWidth = 12; g.stroke();
    g.fillStyle = '#101317';
    [[0,-46],[46,0],[0,46],[-46,0]].forEach(function (t2) {
      g.fillRect(cx + t2[0] - 4, cy + t2[1] - 4, 8, 8);   // 12/3/6/9 ticks
    });
    var h = (secs / 3600) % 12, m = (secs / 60) % 60;
    g.lineCap = 'round';
    g.lineWidth = 11; g.beginPath(); g.moveTo(cx, cy);
    g.lineTo(cx + 27 * Math.sin(h / 12 * 2 * Math.PI),
      cy - 27 * Math.cos(h / 12 * 2 * Math.PI)); g.stroke();
    g.lineWidth = 8; g.beginPath(); g.moveTo(cx, cy);
    g.lineTo(cx + 40 * Math.sin(m / 60 * 2 * Math.PI),
      cy - 40 * Math.cos(m / 60 * 2 * Math.PI)); g.stroke();
    g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill();
    clockTex.needsUpdate = true;
  }
  function buildClubhouse() {
    var items = [
      { g: new THREE.BoxGeometry(22, 6, 5.6), m: tx(0, 3, -20.2), color: '#c19a6b' },
      { g: new THREE.BoxGeometry(23, 0.5, 6.6), m: tx(0, 6.1, -20.2), color: '#6b4a2f' },
      { g: new THREE.BoxGeometry(24.5, 0.35, 8.2), m: tx(0, 6.45, -20.2), color: '#8a4a2b' },
      { g: new THREE.BoxGeometry(4.4, 3.2, 0.25), m: tx(0, 1.6, -17.36), color: '#4a423b' },
      { g: new THREE.BoxGeometry(1.1, 2.3, 0.12), m: tx(-8.5, 1.15, -17.36), color: '#5e564d' },
      { g: new THREE.BoxGeometry(1.1, 2.3, 0.12), m: tx(8.5, 1.15, -17.36), color: '#5e564d' }
    ];
    for (var i = -2; i <= 2; i++)
      items.push({ g: new THREE.BoxGeometry(3.0, 1.5, 0.16), m: tx(i * 4.2, 3.9, -17.34),
        color: '#8fbfe0' });
    G.add(new THREE.Mesh(U.mergeGeoms(items), vcMat()));
    clockCanvas();
    var face = new THREE.Mesh(new THREE.CircleGeometry(1.05, 24),
      new THREE.MeshBasicMaterial({ map: clockTex }));
    face.position.set(6.6, 5.0, -17.3);
    G.add(face);
    var FA = ['#c8102e', '#f7c531', '#00a3c8'];
    [-6, 0, 6].forEach(function (x, i) {
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.8, 6),
        new THREE.MeshLambertMaterial({ color: '#a3abb5' }));
      pole.position.set(x, 8.4, -20.9);
      var fl = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.25),
        new THREE.MeshLambertMaterial({ color: FA[i], side: THREE.DoubleSide,
          transparent: true }));
      fl.position.set(x + 1.1, 9.7, -20.9);
      G.add(pole); G.add(fl); flags.push(fl);
    });
  }

  // ---- LED video board (north stand top, faces court) ----
  function buildLED() {
    var c = document.createElement('canvas'); c.width = 512; c.height = 128;
    ledCtx = c.getContext('2d');
    ledTex = new THREE.CanvasTexture(c);
    ledTex.magFilter = ledTex.minFilter = THREE.NearestFilter;
    var body = new THREE.Mesh(new THREE.BoxGeometry(11.4, 3.0, 0.35),
      new THREE.MeshLambertMaterial({ color: '#101317' }));
    body.position.set(0, 7.0, -15.4);                    // on top of north sideline stand
    ledMesh = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.6),
      new THREE.MeshBasicMaterial({ map: ledTex }));
    ledMesh.position.set(0, 7.0, -15.2);
    G.add(body); G.add(ledMesh);
  }
  function drawLED(scroll) {
    var g = ledCtx;
    g.fillStyle = '#0a0f14'; g.fillRect(0, 0, 512, 128);
    var msg = 'HOLLYBROOK OPEN · SINGLES FINAL · WELCOME TO CENTRE COURT · ';
    g.font = '900 54px Arial'; g.textBaseline = 'middle';
    var w = Math.max(64, g.measureText(msg).width);
    var x = -((scroll * 40) % w);                 // true marquee: tile by measured width
    g.fillStyle = '#3ef2d0';
    for (var cx2 = x; cx2 < 512; cx2 += w) g.fillText(msg, cx2, 66);
    g.fillStyle = '#ffd23e'; g.fillRect(0, 0, 512, 6); g.fillRect(0, 122, 512, 6);
    ledTex.needsUpdate = true;
  }

  function cutawayQuad(az) {
    var d = ((az % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.round(d / (Math.PI / 2)) % 4;
  }
  // Continuous doll's-house: each stand lifts/fades as a smooth function of the
  // angular gap between camera azimuth and the stand's outward normal. No
  // quadrant snapping → no popping while orbiting.
  function applyCut(dt) {
    var az = HB.CORE.camera.state.az;
    for (var i = 0; i < cut.length; i++) {
      var c = cut[i];
      var d = Math.abs((((az - c.phi) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
      var t = 1 - HB.UTIL.smoothstep(0.52, 0.92, d);   // crisper: full lift <30°, none >53°
      c.k += (t - c.k) * Math.min(1, dt / 0.3);        // short smoothing lag
      if (c.k < 0.004 && t === 0) { c.grp.visible = true; c.grp.position.y = 0;
        c.__mats.forEach(function (m) { m.opacity = 1; });
        c.__seats.material.opacity = 1; continue; }
      var y = c.k * 0.4;                               // slight settle-up only
      c.grp.position.y = y;
      if (c.k > 0.98) { c.grp.visible = false; continue; }
      c.grp.visible = true;
      var op = 1 - c.k;                                // ghost-free full fade
      c.__mats.forEach(function (m) { m.opacity = op; });
      c.__seats.material.opacity = op;
    }
  }

  function build(sc) {
    G = new THREE.Group(); G.name = 'club';
    buildStands(); buildClubhouse(); buildLED();
    sc.add(G);
    // NAV from TRUE geometry: stands' front row at the group origin, rows rising
    // outward (south: z 8.5→12.4; north: z −16.1→−8.5; east/west: x ±16.7→±20.9,
    // length 16 → z ±8.2). Plaza passage between west-stand south end and the
    // marquee runs at x −16.5..−15.5, z 8.0..14+ (kept free on purpose).
    var n = HB.CORE.nav;
    n.rect(-11.4, -23.2, 11.4, -17.4, true);      // clubhouse
    n.rect(-13.7, -16.1, 13.7, -8.5, true);       // north stand (8 rows)
    n.rect(-13.7, 8.5, 13.7, 12.4, true);         // south stand (4 rows)
    n.rect(-20.9, -8.2, -16.7, 8.2, true);        // west baseline stand
    n.rect(16.7, -8.2, 20.9, 8.2, true);          // east baseline stand

    HB.CORE.task(function* () {                    // LED scroll + flags
      var t = 0;
      while (true) {
        yield HB.wait(0.4, 20);
        t += 0.4;
        drawLED(t / 8);
        flags.forEach(function (f, i) { f.rotation.y = Math.sin(t * 1.7 + i) * 0.35; });
      }
    }, { name: 'club:anim', max: 30 });
    HB.CORE.task(function* () {                    // cutaway easing
      while (true) {
        applyCut(HB.CORE.sched.delta());
        yield HB.wait(0.05, 5);
      }
    }, { name: 'club:cutaway', max: 5 });
    applyCut(1);                                   // default cam = south → lift south stand
    return api;
  }

  var api = { ready: true, build: build, cutawayList: function () { return cut; } };
  HB.reg('club', api);
  return api;
})();
