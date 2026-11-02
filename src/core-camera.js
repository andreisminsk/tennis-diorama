// core-camera.js — orthographic iso rig (elev 31°, az 0 = from south), modes,
// Q/E quarter turns (0.6 s ease), wheel zoom, drag orbit / shift-drag pan,
// doll's-house cutaway quadrant emitter (ARCH §7). State lives on HB.CORE.camera.
HB.CORE.camera = (function () {
  var cam, host;
  var st = {
    mode: 'club', az: 0, azT: 0, azStart: 0, azMoveT: 1,
    target: new THREE.Vector3(0, 2, 0), fit: 46,      // ortho height (m)
    elev: HB.CFG.cam.elev, dist: 120, quad: 0
  };
  var MODES = {
    club:  { fit: 46, target: [0, 2, 0] },
    tv:    { fit: 15, target: [0, 1.6, 0] },
    close: { fit: 7.5, target: [0, 1.2, 0] }
  };
  var EASE = 0.6;

  function applyFrustum() {
    if (!cam || !host) return;
    var a = Math.max(0.2, host.clientWidth / Math.max(1, host.clientHeight));
    var h = st.fit / 2, w = h * a;
    cam.left = -w; cam.right = w; cam.top = h; cam.bottom = -h;
    cam.near = 1; cam.far = st.dist * 12;
    cam.updateProjectionMatrix();
  }

  function place() {
    var ce = Math.cos(st.elev), se = Math.sin(st.elev);
    var sa = Math.sin(st.az), ca = Math.cos(st.az);
    cam.position.set(
      st.target.x + st.dist * sa * ce,
      st.target.y + st.dist * se,
      st.target.z + st.dist * ca * ce);
    cam.up.set(0, 1, 0);
    cam.lookAt(st.target);
  }

  function quadOf(az) {
    var d = ((az % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.round(d / (Math.PI / 2)) % 4;   // 0=south,1=west?,per turn direction
  }

  function init(hostEl) {
    host = hostEl;
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
    var p = HB.DEBUG.params;
    if (p.view && MODES[p.view]) setMode(p.view, true);
    else { applyFrustum(); }
    place();

    var dragging = 0, lx = 0, ly = 0;
    var el = renderer_hostCanvas();
    el.addEventListener('pointerdown', function (e) {
      dragging = (e.shiftKey || e.button === 2) ? 2 : 1;
      lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId);
      el.classList.add('drag');
      e.preventDefault();
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (dragging === 1) {                 // orbit: azimuth free, elevation 10°–60°
        st.azT = st.az = st.az - dx * 0.006;
        st.elev = HB.UTIL.clamp(st.elev + dy * 0.004, 0.175, 1.05);
        st.azMoveT = 1;
        emitCut();
      } else {                              // pan in view plane
        var ce = Math.cos(st.elev), scale = st.fit / Math.max(1, host.clientHeight);
        var sa = Math.sin(st.az), ca = Math.cos(st.az);
        var rx = ca, rz = -sa;              // screen right
        var uy = -ce, ux = se * sa, uz = se * ca; // screen up projected
        st.target.x += (-dx * rx - dy * ux) * scale;
        st.target.z += (-dx * rz - dy * uz) * scale;
        st.target.y += (-dy * uy) * scale;
      }
    });
    function endDrag(e) { dragging = 0; el.classList.remove('drag'); }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      st.fit = HB.UTIL.clamp(st.fit * Math.exp(e.deltaY * 0.001), 4, 120);
      applyFrustum();
    }, { passive: false });

    window.addEventListener('keydown', function (e) {
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === 'q' || e.key === 'Q') turn(-1);
      if (e.key === 'e' || e.key === 'E') turn(1);
    });
    window.addEventListener('resize', function () { applyFrustum(); });
    return api;
  }
  function renderer_hostCanvas() {
    var c = host.querySelector('canvas');
    if (!c) { c = document.createElement('canvas'); host.appendChild(c); }
    return c;
  }

  function turn(dir) { // dir: ±1 quarter turns
    st.azT += dir * Math.PI / 2;
    st.azStart = st.az; st.azMoveT = 0;
    HB.bus.emit('cam:turn', { dir: dir, azT: st.azT });
  }

  function setMode(m, silent) {
    if (!MODES[m]) return;
    st.mode = m;
    st.fit = MODES[m].fit;
    st.target.set(MODES[m].target[0], MODES[m].target[1], MODES[m].target[2]);
    applyFrustum();
    if (!silent) HB.bus.emit('cam:mode', { mode: m });
  }

  function emitCut() {
    var q = quadOf(st.az);
    if (q !== st.quad) { st.quad = q; HB.bus.emit('cam:cutaway', { quad: q, az: st.az }); }
  }

  function update(dt) {
    if (st.azMoveT < 1) {                   // ease quarter turn
      st.azMoveT = Math.min(1, st.azMoveT + dt / EASE);
      var k = HB.UTIL.easeInOut(st.azMoveT);
      st.az = st.azStart + (st.azT - st.azStart) * k;
      if (st.azMoveT >= 1) { st.az = st.azT; emitCut(); }
    }
    place();
  }

  var api = {
    init: init, update: update, turn: turn, setMode: setMode,
    zoom: function (fit) { st.fit = HB.UTIL.clamp(fit, 2, 120); applyFrustum(); },
    object: function () { return cam; },
    state: st, MODES: MODES,
    focus: function (x, y, z) { st.target.set(x, y, z); }   // follow hooks (P4/P8)
  };
  HB.reg('camera', api);
  return api;
})();
