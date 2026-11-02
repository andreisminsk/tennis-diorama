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
    if (HB.CROWD && HB.CROWD.ready) HB.CROWD.build(scene);
    if (HB.BALL && HB.BALL.ready) HB.BALL.build(scene);
    if (HB.PEOPLE && HB.PEOPLE.ready) HB.PEOPLE.ready = HB.PEOPLE.ready;  // passive module
    var ps = HB.DEBUG.params.surface;              // forced state (QA shortcut)
    if (ps && HB.CFG.bounce[ps]) {
      HB.CFG.current.surface = ps;
      var sel = document.getElementById('surf');
      if (sel) { sel.value = ps; HB.bus.emit('surface:set', { surface: ps }); }
    }
    // P3 default: the island is inhabited on load — officials + players idle in
    // their pre-match spots (no walking detours at boot; walk-on is FLOW's P5 job).
    HB.PEOPLE.officials();
    HB.PEOPLE.courtActor(HB.CFG.roster[0], -1);
    HB.PEOPLE.courtActor(HB.CFG.roster[1], 1);
    // a single short ambient stroll so the island feels alive (one line judge)
    var ljs = null;
    HB.CORE.task(function* () {
      yield HB.wait(6, 12);
      var bench = HB.CORE.nav.path(2.5, 7.2, -10.5, 7.2);
      if (bench && bench.length > 2) yield* HB.PEOPLE.walkOn([
        { meta: HB.CFG.roster[3], side: 1, from: [2.5, 7.2], to: [-10.5, 7.2] }
      ]);
    }, { name: 'ambient:stroll', max: 40 });
    HB.CORE.nav.rect(-32, -20, 32, -19, true);  // island rim sanity (real layout P1b)

    var fmt = HB.DEBUG.params;                  // QA boot params (ARCH §14)
    if (fmt.ff) HB.CORE.sched.ff(parseFloat(fmt.ff) || 0);
    if (fmt.pix) HB.CORE.pipeline.setPixelSize(parseInt(fmt.pix, 10) || 2);
    if (fmt.speed) HB.CORE.speed = parseFloat(fmt.speed) || 1;
    if (fmt.qa === 'calib') HB.DEBUG.runCalib(parseInt(fmt.n, 10) || 2000);
    if (fmt.qa === 'match') HB.DEBUG.qaMatch();
    if (fmt.qa === 'wd') { // watchdog proof: stall the scheduler's point task
      HB.DEBUG.qaMatch(function () { console.log('qa=wd match done'); });
      var W0 = HB.CORE.sched.wd.point;
      HB.CORE.sched.wd.point = 3;      // 3 s stall ceiling for the test
      setTimeout(function () { HB.CORE.sched.wd.point = W0; }, 2000);
    }

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
    if (HB.BALL && HB.BALL.ready) HB.BALL.step(Math.min(dt, 0.1) * HB.CORE.speed);
    HB.CORE.pipeline.render(scene, HB.CORE.camera.object());
  }

  var api = { start: start, scene: function () { return scene; } };
  HB.reg('boot', api);
  return api;
})();

HB.CORE.boot.start();
