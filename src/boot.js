// boot.js — scene assembly + main loop (ARCH §2). Order: pipeline → scene/light →
// camera → UI. Placeholder island top so QA-P0 has visible geometry before P1b.
HB.CORE.boot = (function () {
  var scene, clock, raf = 0;

  function buildScene() {
    scene = new THREE.Scene();
    HB.CORE.scene = scene;                      // world modules attach meshes here
    // placeholder island top (P1b replaces with full island):
    var g = new THREE.CircleGeometry(1, 48);
    g.scale(HB.CFG.island.rx, HB.CFG.island.rz, 1);
    g.rotateX(-Math.PI / 2);
    var m = new THREE.MeshLambertMaterial({ color: 0x2a6a26 });
    var isl = new THREE.Mesh(g, m);
    isl.name = 'islandTop';
    scene.add(isl);
    var rock = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 0.55, HB.CFG.island.rockDepth, 48, 1, true),
      new THREE.MeshLambertMaterial({ color: 0x39424e, side: THREE.DoubleSide }));
    rock.geometry.scale(HB.CFG.island.rx, 1, HB.CFG.island.rz);
    rock.name = 'islandRock';
    rock.position.y = -HB.CFG.island.rockDepth / 2;
    scene.add(rock);
  }

  function start() {
    var host = document.getElementById('glhost');
    HB.CORE.pipeline.init(host, { dev: HB.DEBUG.dev, pixelSize: 2 });
    buildScene();
    HB.CORE.light.init(scene);
    HB.CORE.camera.init(host);
    HB.UI.init();
    [HB.COURT, HB.GROUNDS, HB.CLUB].forEach(function (m) {
      if (m && m.ready && m.build) m.build(scene);
    });
    var ps = HB.DEBUG.params.surface;              // forced state (QA shortcut)
    if (ps && HB.CFG.bounce[ps]) {
      HB.CFG.current.surface = ps;
      var sel = document.getElementById('surf');
      if (sel) { sel.value = ps; HB.bus.emit('surface:set', { surface: ps }); }
    }
    // P3 default: the island is inhabited on load — officials + both players
    // walk in from the plaza after a short beat (no click needed until P5 flow).
    HB.PEOPLE.officials();
    HB.CORE.task(function* () {
      yield HB.wait(1.2, 10);
      yield* HB.PEOPLE.walkOn([
        { meta: HB.CFG.roster[0], side: -1, from: [-18, -12], to: [-13.0, 0.6] },
        { meta: HB.CFG.roster[1], side: 1, from: [-18, -10.6], to: [13.0, -0.6] }
      ]);
    }, { name: 'boot:walkon', max: 60 });
    HB.CORE.nav.rect(-32, -20, 32, -19, true);  // island rim sanity (real layout P1b)

    var fmt = HB.DEBUG.params;                  // QA boot params (ARCH §14)
    if (fmt.ff) HB.CORE.sched.ff(parseFloat(fmt.ff) || 0);
    if (fmt.pix) HB.CORE.pipeline.setPixelSize(parseInt(fmt.pix, 10) || 2);

    clock = new THREE.Clock();
    loop();
    HB.bus.emit('world:boot', { when: HB.CORE.sched.now() });
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    var dt = Math.min(clock.getDelta(), 0.1);
    HB.CORE.sched.step(dt);
    HB.CORE.camera.update(dt);
    if (HB.PEOPLE && HB.PEOPLE.pose) {
      var rigs = HB.PEOPLE.actors();
      for (var i = 0; i < rigs.length; i++) HB.PEOPLE.pose(rigs[i], dt);
    }
    HB.CORE.pipeline.render(scene, HB.CORE.camera.object());
  }

  var api = { start: start, scene: function () { return scene; } };
  HB.reg('boot', api);
  return api;
})();

HB.CORE.boot.start();
