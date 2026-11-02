// ui.js — HB.UI: panel wiring stub for P0 (slider live-RT, mode buttons, selects → BUS).
// Scoreboard/feed/match-centre logic arrives in P5/P6; coach controls enable in P6.
HB.UI = (function () {
  function $(id) { return document.getElementById(id); }

  function init() {
    var p = HB.DEBUG.params;
    if (p.nomenu === '1' || p.nomenu === true) document.body.classList.add('nomenu');
    if (p.layout === 'phone') document.body.classList.add('phone');

    // roster pickers
    var p0 = $('p0'), p1 = $('p1');
    if (p0 && p1) {
      HB.CFG.roster.forEach(function (r, i) {
        p0.add(new Option(r.name, r.id, i === 0, i === 0));
        p1.add(new Option(r.name, r.id, i === 1, i === 1));
      });
      if (p0.options.length > 1) p1.selectedIndex = 1;
    }

    // pixel size → live RT resize (QA-P0 gate)
    var pix = $('pix'), pixV = $('pixV');
    if (pix) {
      pix.value = HB.CORE.pipeline.P.pixelSize;
      pixV.textContent = pix.value;
      pix.addEventListener('input', function () {
        HB.CORE.pipeline.setPixelSize(parseInt(pix.value, 10));
        pixV.textContent = pix.value;
      });
    }

    // speed / pause
    var spd = $('spd'), spdV = $('spdV'), pause = $('btnPause');
    if (spd) spd.addEventListener('input', function () {
      HB.CORE.speed = parseFloat(spd.value);
      spdV.textContent = spd.value + '×';
    });
    if (pause) pause.addEventListener('click', function () {
      HB.CORE.paused = !HB.CORE.paused;
      pause.textContent = HB.CORE.paused ? 'Resume' : 'Pause';
      pause.classList.toggle('on', HB.CORE.paused);
    });

    // surface / tod → BUS (court/light listen; stubs ignore for now)
    var surf = $('surf'), tod = $('tod');
    if (surf) surf.addEventListener('change', function () {
      HB.CFG.current.surface = surf.value;
      HB.bus.emit('surface:set', { surface: surf.value });
    });
    if (tod) tod.addEventListener('change', function () {
      HB.CFG.current.tod = tod.value;
      HB.bus.emit('tod:set', { tod: tod.value });
    });

    // camera mode buttons
    Array.prototype.forEach.call(document.querySelectorAll('#camMode button'),
      function (b) {
        b.addEventListener('click', function () {
          Array.prototype.forEach.call(document.querySelectorAll('#camMode button'),
            function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          HB.CORE.camera.setMode(b.getAttribute('data-cam'));
        });
      });

    // new match → FLOW.startMatch with picked roster + format
    var btnNew = $('btnNew');
    if (btnNew) btnNew.addEventListener('click', function () {
      HB.bus.emit('ui:newmatch', { fmt: $('fmt') && $('fmt').value,
        p0: p0 && p0.value, p1: p1 && p1.value });
    });

    // ---- P5: feed + scoreboard + match centre ----
    var feed = $('feed'), sb = $('scoreboard'), stats = $('stats');
    function pushLog(t, cls) {
      if (!feed) return;
      var li = document.createElement('li');
      if (/^OUT|Fault|Double|Let|Watchdog/i.test(t)) li.className = 'warn';
      if (cls) li.className = cls;
      li.innerHTML = '<span class="t">' + sbClock() + '</span>' + t;
      feed.insertBefore(li, feed.firstChild);
      while (feed.children.length > 60) feed.removeChild(feed.lastChild);
    }
    function sbClock() {
      var s = Math.floor(HB.CORE.sched.now() % 86400);
      var m = Math.floor(s / 60) % 60, h = Math.floor(s / 3600) % 24;
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }
    function byId(v) {
      for (var i = 0; i < HB.CFG.roster.length; i++)
        if (HB.CFG.roster[i].id === v) return HB.CFG.roster[i];
      return null;
    }
    function renderSB(M) {
      if (!sb || !M) return;
      sb.classList.add('on');
      var t = HB.FLOW.scoreText(M);
      for (var i = 0; i < 2; i++) {
        sb.querySelector('[data-sb="name' + i + '"]').textContent = M.players[i].meta.name.split(' ').pop();
        sb.querySelector('[data-sb="srv' + i + '"]').textContent =
          (M.state === 'live' && M.server === i) ? '●' : '';
        sb.querySelector('[data-sb="ptr' + i + '"]').textContent = M.score.tb ? M.score.tb.pts[i] : t.ptr.split('–')[i];
      }
      sb.querySelector('[data-sb="games"]').textContent = t.games;
      sb.querySelector('[data-sb="sets"]').textContent = M.score.sets.join('–');
    }
    HB.bus.on('ui:log', function (d) { pushLog(d.t, d.cls); });
    HB.bus.on('call:umpire', function (d) { pushLog('⟡ ' + d.text); });
    HB.bus.on('call:line', function (d) { pushLog('OUT — ' + d.loc.map(function (v) { return v.toFixed(1); }).join(', ')); });
    HB.bus.on('match:watchdog', function (d) {
      pushLog('Watchdog — ' + d.task + ' stalled ' + d.blocked + ' s; force-resumed.', 'warn');
    });
    HB.bus.on('match:new', function (d) {
      if (stats) stats.textContent = 'New ' + d.fmt + ' match — walk-on.';
    });
    HB.bus.on('match:phase', function (d) { if (d.phase === 'live' && curM()) renderSB(curM()); });
    HB.bus.on('point:end', function (d) {
      var M = curM();
      if (!M) return;
      renderSB(M);
      var names = [M.players[0].meta.name.split(' ').pop(), M.players[1].meta.name.split(' ').pop()];
      pushLog(names[d.winner] + ' wins the point (' + d.how + (d.shots ? ', ' + d.shots + ' shots' : '') + ').');
      if (stats) {
        var S = M.stats, tot = S.rallyShots.length || 1, sum = 0;
        S.rallyShots.forEach(function (v) { sum += v; });
        stats.innerHTML =
          '<b>' + M.players[0].meta.name + '</b> vs <b>' + M.players[1].meta.name + '</b><br>' +
          'Sets ' + M.score.sets[0] + '–' + M.score.sets[1] +
          ' · Games ' + M.score.gamesNow[0] + '–' + M.score.gamesNow[1] + '<br>' +
          '1st in ' + (S.firstTot ? Math.round(100 * S.firstIn / S.firstTot) + '%' : '—') +
          ' · Aces ' + S.aces + ' · DF ' + S.dfs + '<br>' +
          'Mean rally ' + (sum / tot).toFixed(1) +
          ' · Fastest ' + (S.fastest.kph || '—') + ' kph' +
          (S.fastest.who >= 0 ? ' (' + M.players[S.fastest.who].meta.name.split(' ').pop() + ')' : '');
      }
    });
    HB.bus.on('match:end', function (d) {
      if (stats && curM()) {
        var M = curM();
        stats.innerHTML += '<br><b>CHAMPION: ' + M.players[d.winner].meta.name + '</b>';
      }
    });
    function curM() { return HB.FLOW.current(); }

    // ---- P6: coach controls (tactic / serve dir / aim-click) ----
    var tacWrap = $('tactic');
    if (tacWrap) Array.prototype.forEach.call(tacWrap.querySelectorAll('button'),
      function (b) {
        b.addEventListener('click', function () {
          Array.prototype.forEach.call(tacWrap.querySelectorAll('button'),
            function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          HB.bus.emit('coach:tactic', { kind: 'tactic', tactic: b.getAttribute('data-tac') });
        });
      });
    HB.bus.on('coach:tactic', function (d) {                // reflect BUS-injected state (QA)
      if (d.kind === 'serve') {
        if (srvDir) srvDir.value = ({ auto: 'auto', w: 'wide', b: 'body', t: 'tee' })[d.dir] || 'auto';
        return;
      }
      if (tacWrap) Array.prototype.forEach.call(tacWrap.querySelectorAll('button'),
        function (x) { x.classList.toggle('on', x.getAttribute('data-tac') === d.tactic); });
    });
    var srvDir = $('srvDir');
    if (srvDir) srvDir.addEventListener('change', function () {
      var map = { auto: 'auto', wide: 'w', body: 'b', tee: 't' };
      HB.bus.emit('coach:tactic', { kind: 'serve', dir: map[srvDir.value] || 'auto' });
    });
    var btnAim = $('btnAim'), aiming = false, downPt = null, aimRing = null;
    function ring() {
      if (aimRing) return aimRing;
      var g = new THREE.RingGeometry(0.3, 0.44, 18); g.rotateX(-Math.PI / 2);
      aimRing = new THREE.Mesh(g,
        new THREE.MeshBasicMaterial({ color: 0x3ecfb2, transparent: true, opacity: 0.95 }));
      aimRing.position.y = 0.02; aimRing.visible = false;
      HB.CORE.scene.add(aimRing);
      return aimRing;
    }
    function clearRing() { if (aimRing) aimRing.visible = false; }
    if (btnAim) {
      btnAim.addEventListener('click', function () {
        aiming = !aiming;
        btnAim.classList.toggle('on', aiming);
        btnAim.textContent = aiming ? 'Click the court…' : 'Aim next shot (click court)';
      });
      var host = $('glhost');
      host.addEventListener('pointerdown', function (e) { downPt = [e.clientX, e.clientY]; });
      host.addEventListener('pointerup', function (e) {
        if (!aiming || !downPt) return;
        var moved = Math.hypot(e.clientX - downPt[0], e.clientY - downPt[1]);
        downPt = null;
        if (moved > 6) return;                               // was a drag-orbit
        var r = host.getBoundingClientRect();
        var ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1), HB.CORE.camera.object());
        var pt = new THREE.Vector3();
        if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)) return;
        pt.x = Math.max(-11, Math.min(11, pt.x));
        pt.z = Math.max(-5, Math.min(5, pt.z));
        var rg = ring(); rg.position.x = pt.x; rg.position.z = pt.z; rg.visible = true;
        HB.bus.emit('coach:aim', { x: pt.x, z: pt.z });
      });
    }
    HB.bus.on('rally:hit', clearRing);
    HB.bus.on('point:end', clearRing);

    // ---- P8: skip-ceremony + auto-next ----
    var skipCer = $('skipCer'), autoNext = $('autoNext');
    if (skipCer) skipCer.addEventListener('change', function () {
      HB.bus.emit('ui:flags', { skipCeremony: skipCer.checked });
      HB.bus.emit('ui:log', { t: skipCer.checked ? 'Ceremony will be skipped.' : 'Ceremony on.' });
    });
    if (autoNext) autoNext.addEventListener('change', function () {
      HB.bus.emit('ui:flags', { autoNext: autoNext.checked });
      HB.bus.emit('ui:log', { t: autoNext.checked ? 'Auto-next on.' : 'Auto-next off.' });
    });
    // ---- P7: audio toggle (gesture-gated) ----
    var btnAudio = $('btnAudio'), audState = $('audState');
    if (btnAudio) btnAudio.addEventListener('click', function () {
      var good = HB.AUDIO.enable();
      if (good) {
        btnAudio.textContent = 'Sound on';
        btnAudio.classList.add('on');
        audState.textContent = 'on';
        HB.AUDIO.api = null;
      }
    });
    HB.bus.emit('ui:ready', {});
  }

  var api = { init: init };
  HB.reg('ui', api);
  return api;
})();
