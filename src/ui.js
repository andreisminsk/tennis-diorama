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

    // new match (no-op until FLOW P5): emit and log to feed
    var btnNew = $('btnNew');
    if (btnNew) btnNew.addEventListener('click', function () {
      HB.bus.emit('ui:newmatch', { fmt: $('fmt') && $('fmt').value,
        p0: p0 && p0.value, p1: p1 && p1.value });
    });

    HB.bus.emit('ui:ready', {});
  }

  var api = { init: init };
  HB.reg('ui', api);
  return api;
})();
