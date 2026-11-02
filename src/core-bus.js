// core-bus.js — HB.bus: tiny event hub; modules communicate ONLY through it (ARCH §9).
HB.bus = (function () {
  var map = {}; // ev -> [fn]
  var any = []; // fns(*, {ev, data})

  function on(ev, fn) {
    (map[ev] = map[ev] || []).push(fn);
    return function off() {
      var a = map[ev], i = a ? a.indexOf(fn) : -1;
      if (i >= 0) a.splice(i, 1);
    };
  }
  function once(ev, fn) {
    var off = on(ev, function (d) { off(); fn(d); });
    return off;
  }
  function emit(ev, data) {
    var a = map[ev] || [], i;
    for (i = 0; i < a.length; i++) { try { a[i](data); } catch (err) { record(ev, err); } }
    for (i = 0; i < any.length; i++) { try { any[i](data, { ev: ev }); } catch (err) { record(ev, err); } }
  }
  function record(ev, err) {
    (window.__hbErrs = window.__hbErrs || []).push({
      type: 'bus', msg: 'BUS handler failed for "' + ev + '": ' + String(err && err.message || err) });
  }

  return {
    on: on, once: once, emit: emit,
    any: function (fn) { any.push(fn); return function () { any = any.filter(function (f) { return f !== fn; }); }; },
    count: function (ev) { return (map[ev] || []).length; }
  };
})();

HB.reg('bus', HB.bus);
