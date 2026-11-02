// debug.js — HB.DEBUG: error capture, boot params, QA hooks (ARCH §14).
HB.DEBUG = {};
window.__hbErrs = window.__hbErrs || [];
window.addEventListener('error', function (e) {
  window.__hbErrs.push({ type: 'error', msg: String(e.message || e),
    where: (e.filename || '') + ':' + (e.lineno || 0) });
});
window.addEventListener('unhandledrejection', function (e) {
  var r = e.reason;
  window.__hbErrs.push({ type: 'promise', msg: String((r && (r.stack || r.message)) || r) });
});

(function () {
  var raw = String(window.location.search || '').replace(/^\?/, '');
  var p = {};
  raw.split('&').forEach(function (kv) {
    if (!kv) return;
    var i = kv.indexOf('=');
    var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
    var v = i < 0 ? true : decodeURIComponent(kv.slice(i + 1));
    p[k] = v;
  });
  HB.DEBUG.params = p;
})();

HB.DEBUG.dev = HB.DEBUG.params.dev === '1' || HB.DEBUG.params.dev === true;

HB.DEBUG.ff = function (sec) {
  var s = HB.CORE && HB.CORE.sched;
  if (s && s.ff) s.ff(sec);
};
HB.DEBUG.spawn = function (label) { HB.bus.emit('debug:spawn', { name: String(label) }); };
HB.DEBUG.runMatch = function (fmt, surf) {
  return new Promise(function (res) {
    HB.bus.emit('debug:runmatch', { fmt: fmt, surf: surf, done: res });
  });
};
HB.DEBUG.state = function () {
  var s = HB.CORE && HB.CORE.sched;
  return {
    speed: HB.CORE.speed, paused: !!HB.CORE.paused, tasks: s ? s.count() : 0,
    time: s ? s.now : 0,
    cam: (HB.CORE.camera && HB.CORE.camera.state) ? HB.CORE.camera.state.mode : null,
    tod: (HB.CORE.light && HB.CORE.light.current) ? HB.CORE.light.current : null,
    surface: HB.CFG.current ? HB.CFG.current.surface : null,
    errs: window.__hbErrs.length
  };
};
HB.DEBUG.stats = function () {
  var pl = HB.CORE.pipeline;
  return { pixelSize: pl ? pl.P.pixelSize : null, drawCalls: pl ? pl.P.drawCalls : null,
           rt: pl ? [pl.P.rw, pl.P.rh] : null };
};

// qa=calib — run the calibration harness on the real page (PLAN P4b): table to
// console, kept on HB.DEBUG.calib, breaches tick __hbErrs ('calib:OUT') for QA assert.
HB.DEBUG.runCalib = function (n) {
  var res = HB.RALLY.calibrate(n || 2000);
  HB.DEBUG.calib = res;
  var T = { firstServePct: [60, 65], acePct: [4, 8], dfPct: [2, 4], meanRally: [4, 7] };
  var bad = [];
  Object.keys(res).forEach(function (sf) {
    console.log(sf, JSON.stringify(res[sf]));
    Object.keys(T).forEach(function (k) {
      var v = res[sf][k];
      if (v < T[k][0] || v > T[k][1])
        bad.push(sf + '.' + k + '=' + v + ' not in [' + T[k][0] + ',' + T[k][1] + ']');
    });
  });
  if (bad.length) window.__hbErrs.push({ type: 'calib', msg: 'calib:OUT ' + bad.join('; ') });
  return res;
};

HB.reg('debug', HB.DEBUG);
