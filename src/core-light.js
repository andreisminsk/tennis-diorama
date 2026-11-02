// core-light.js — day/dusk/night presets: sun, hemi, 4 floodlight spots, sky/fog,
// emissive driver value for night surfaces (boards/LED pick this up later) (ARCH §13).
HB.CORE.light = (function () {
  var scene, sun, hemi, amb, spot, glow;
  var FLOOD = HB.CFG.masts;                       // [[x,z]×4]
  var FH = 14;                                    // mast head height (m)

  var PRESETS = {
    day: {
      bg: 0x9fc4e0, fog: 0x9fc4e0, fogNear: 60, fogFar: 190, fogOn: true,
      sun: { pos: [40, 55, 25], col: 0xfff2d8, it: 0.95 },
      hemi: { sky: 0xbcd7ee, gnd: 0x59604a, it: 0.55 },
      flood: 0.0, emissive: 0.0
    },
    dusk: {
      bg: 0x4a4666, fog: 0x4a4666, fogNear: 50, fogFar: 170, fogOn: true,
      sun: { pos: [-55, 14, 10], col: 0xff9a52, it: 0.65 },
      hemi: { sky: 0x6a6280, gnd: 0x3a3230, it: 0.4 },
      flood: 0.55, emissive: 0.55
    },
    night: {
      bg: 0x121721, fog: 0x121721, fogNear: 40, fogFar: 150, fogOn: true,
      sun: { pos: [-30, 40, -20], col: 0x8fa8cc, it: 0.18 },
      hemi: { sky: 0x2c3846, gnd: 0x20262c, it: 0.42 },
      flood: 2.4, floodSpread: Math.PI / 3.4, emissive: 1.0,
      amb: { col: 0x44557a, it: 0.55 }        // crowd/stands stay readable
    }
  };
  var currentName = null;

  var booted = false;
  function apply(name, silent) {
    var p = PRESETS[name];
    if (!p || !scene) return;
    var first = !booted && !currentName;
    currentName = name;
    if (!first) booted = true;
    scene.background = new THREE.Color(p.bg);
    scene.fog = new THREE.Fog(p.fog, p.fogNear, p.fogFar);
    sun.position.set(p.sun.pos[0], p.sun.pos[1], p.sun.pos[2]);
    sun.color.setHex(p.sun.col);
    sun.intensity = p.sun.it;
    hemi.color.setHex(p.hemi.sky);
    hemi.groundColor.setHex(p.hemi.gnd);
    hemi.intensity = p.hemi.it;
    for (var i = 0; i < spot.length; i++) {
      spot[i].intensity = 1.05 * p.flood;
      if (p.floodSpread) { spot[i].angle = p.floodSpread; spot[i].penumbra = 0.45; }
    }
    if (amb) { amb.intensity = p.amb ? p.amb.it : 0; if (p.amb) amb.color.setHex(p.amb.col); }
    glow.visible = p.flood > 0.01;
    if (scene.traverse) tuneEmissive(scene, p.emissive * 0.6 + p.flood * 0.4);
    if (booted && !silent) {                       // API/QA caller: sync HUD select (no BUS echo)
      var sel = document.getElementById('tod');
      if (sel) sel.value = name;
    }
  }
  function tuneEmissive(root, k) {
    root.traverse(function (o) {
      if (o.material && o.material.__emissive) {
        o.material.emissiveIntensity = (o.material.__emissive || 1) * k;
      }
    });
  }

  function init(sc) {
    scene = sc;
    sun = new THREE.DirectionalLight(0xffffff, 1);
    hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.5);
    scene.add(sun); scene.add(hemi); scene.add(sun.target);
    spot = []; glow = new THREE.Group();
    FLOOD.forEach(function (m) {
      var s = new THREE.SpotLight(0xe8f0ff, 0, 90, Math.PI / 5, 0.5, 1);
      s.position.set(m[0], FH, m[1]);
      s.target.position.set(m[0] * 0.22, 0, m[1] * 0.22);  // aim nearer centre: apron spill
      scene.add(s); scene.add(s.target);
      spot.push(s);
      // cone glow (unlit, additive): cheap night readability
      var cone = new THREE.Mesh(
        new THREE.ConeGeometry(5.2, FH, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xcfe0ff, transparent: true, opacity: 0.045,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        }));
      cone.position.set(m[0], FH / 2 + 0.5, m[1]);
      glow.add(cone);
    });
    scene.add(glow);
    apply(HB.DEBUG.params.tod && PRESETS[HB.DEBUG.params.tod] ? HB.DEBUG.params.tod : 'day', true);
    HB.bus.on('tod:set', function (d) {
      if (d && d.tod && PRESETS[d.tod]) apply(d.tod, true);   // UI emits; light applies silently (no echo)
    });
    booted = true;
    var sel = document.getElementById('tod');
    if (sel) { sel.value = currentName; }        // HUD matches boot-forced TOD
    return api;
  }

  var api = {
    init: init, apply: apply,
    get current() { return currentName; },
    presets: PRESETS
  };
  HB.reg('light', api);
  return api;
})();
