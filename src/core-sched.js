// core-sched.js — generator-coroutine scheduler + watchdogs (ARCH §8).
// Yield helpers: HB.wait(s[,max]) HB.until(fn[,max]) HB.par([gens][,max]) HB.seq([gens][,max]).
// Watchdog: an 'until' parked longer than its max (default 25 s) force-resumes and
// emits match:watchdog — a match never hard-locks; pause is the only full stop.
HB.CORE.sched = (function () {
  var tasks = [];
  var seqId = 0;
  var now = 0;        // scaled scheduler seconds since boot
  var delta = 0;      // scheduler seconds advanced by the last step()
  var speed = 1, paused = false, ffLeft = 0;
  var WD = { point: 25, ball: 12, ceremony: 30 };

  function errs(kind, msg) {
    (window.__hbErrs = window.__hbErrs || []).push({ type: kind, msg: msg });
  }

  function Task(gen, opts) {
    opts = opts || {};
    // accept a generator function (normal) or a ready generator object
    this.gen = (typeof gen === 'function') ? gen() : gen;
    this.labelName = opts.name || ('task#' + (++seqId));
    this.max = opts.max || opts.timeout || 25;   // watchdog budget while parked (s)
    this.parkedAt = 0;
    this.yield_ = null;
    this.resumeAt = null;
    this.done = false;
    this._cbs = null;
  }
  Task.prototype.onDone = function (fn) { (this._cbs = this._cbs || []).push(fn); };
  Task.prototype.finish = function () {
    if (this.done) return;
    this.done = true;
    var cbs = this._cbs; this._cbs = null;
    if (cbs) for (var i = 0; i < cbs.length; i++) { try { cbs[i](this); } catch (e) { errs('sched', 'onDone "' + this.labelName + '": ' + e.message); } }
  };

  function task(gen, opts) {
    var t = new Task(gen, opts);
    tasks.push(t);
    return t;
  }

  // ---- yield builders ----
  function waitY(secs, maxBlock) {
    secs = Math.max(0, Number(secs) || 0);
    return { y: 'wait', secs: secs, maxBlock: (maxBlock != null) ? maxBlock : (secs + 10) };
  }
  function untilY(fn, maxBlock) {
    return { y: 'until', fn: fn, maxBlock: maxBlock || WD.point, start: null };
  }
  function parY(gens, maxBlock) {
    var st = { n: gens.length };
    var y = untilY(function () { return st.n <= 0; }, maxBlock || 30);
    y.start = function () {
      gens.forEach(function (g, i) {
        var child = task(function* () { yield* g; },
                         { name: 'par[' + i + ']:' + fnName(g), max: maxBlock || 30 });
        child.onDone(function () { st.n--; });
      });
    };
    return y;
  }
  function seqY(gens, maxBlock) {
    var st = { done: false };
    var y = untilY(function () { return st.done; }, maxBlock || 40);
    y.start = function () {
      (function run(i) {
        if (i >= gens.length) { st.done = true; return; }
        var child = task(function* () { yield* gens[i]; },
                         { name: 'seq[' + i + ']:' + fnName(gens[i]), max: maxBlock || 40 });
        child.onDone(function () { run(i + 1); });
      })(0);
    };
    return y;
  }
  function fnName(g) { return (g && g.name) || 'gen'; }

  // ---- pump: run a task until it parks or finishes ----
  function pump(t) {
    var guard = 64; // synchronous chain limit per step
    while (!t.done && guard-- > 0) {
      var r;
      try { r = t.gen.next(); }
      catch (err) {
        errs('sched', 'task "' + t.labelName + '" threw: ' + String((err && err.message) || err));
        t.finish(); return;
      }
      if (r.done) { t.finish(); return; }

      var v = r.value, y;
      if (v && v.y) y = v;
      else if (typeof v === 'number') y = waitY(v, t.max);   // yield 2 == wait 2 s
      else y = waitY(0, t.max);                              // raw yield == rest of step

      if (y.y === 'wait') {
        t.yield_ = y; t.resumeAt = now + y.secs; t.parkedAt = now; return;
      }
      if (y.y === 'until') {
        if (y.start) { var s = y.start; y.start = null; s(); }
        var ok;
        try { ok = y.fn(); }
        catch (err) { errs('sched', 'until() in "' + t.labelName + '" threw: ' + String((err && err.message) || err)); ok = true; }
        if (ok) continue;                       // resolved immediately → keep pumping
        t.yield_ = y; t.resumeAt = null; t.parkedAt = now; return;
      }
      // unknown yield kind: treat as one-step park
      t.yield_ = waitY(0, t.max); t.resumeAt = now; t.parkedAt = now; return;
    }
    if (!t.done && guard <= 0)
      errs('sched', 'task "' + t.labelName + '" spin-guard tripped (64 chained yields)');
  }

  function step(dtRaw) {
    delta = 0;
    if (paused) return;
    var adv = dtRaw * speed;
    if (ffLeft > 0) { adv = Math.min(Math.max(adv, 0.2), ffLeft); ffLeft -= adv; } // fast-forward
    adv = Math.min(adv, 0.5);            // tab-jank cap — never teleport a match
    if (adv <= 0) return;
    now += adv; delta = adv;

    var wdHits = [];
    var i, t;
    for (i = tasks.length - 1; i >= 0; i--) {
      t = tasks[i];
      if (t.done) { tasks.splice(i, 1); continue; }
      if (t.yield_) {
        if (t.resumeAt != null) {              // parked on wait
          if (now < t.resumeAt) continue;
          t.yield_ = null; t.resumeAt = null;
        } else {                               // parked on until
          var ok;
          try { ok = t.yield_.fn(); }
          catch (err) { ok = true; errs('sched', 'until() in "' + t.labelName + '" threw: ' + String((err && err.message) || err)); }
          if (!ok) {
            var blocked = now - t.parkedAt;
            if (blocked > t.yield_.maxBlock) {
              wdHits.push({ task: t.labelName, blocked: Math.round(blocked * 10) / 10 });
              t.yield_ = null;                 // watchdog force-resume
            } else continue;
          } else { t.yield_ = null; }
        }
      }
      pump(t);
    }
    for (i = 0; i < wdHits.length; i++) HB.bus.emit('match:watchdog', wdHits[i]);
  }

  return {
    task: task, step: step,
    wait: waitY, until: untilY, par: parY, seq: seqY,
    now: function () { return now; },
    delta: function () { return delta; },
    count: function () { return tasks.length; },
    wd: WD,
    ff: function (sec) { ffLeft = Math.max(0, ffLeft + Math.max(0, sec)); },
    get speed() { return speed; },
    set speed(v) { speed = Math.min(8, Math.max(0.5, Number(v) || 1)); },
    get paused() { return paused; },
    set paused(v) { paused = !!v; }
  };
})();

// HB-level aliases (ARCH §8: generator authors write HB.wait / HB.until / HB.par / HB.seq)
HB.wait = HB.CORE.sched.wait;
HB.until = HB.CORE.sched.until;
HB.par = HB.CORE.sched.par;
HB.seq = HB.CORE.sched.seq;
HB.CORE.task = HB.CORE.sched.task;
Object.defineProperty(HB.CORE, 'speed', {
  get: function () { return HB.CORE.sched.speed; },
  set: function (v) { HB.CORE.sched.speed = v; }
});
Object.defineProperty(HB.CORE, 'paused', {
  get: function () { return HB.CORE.sched.paused; },
  set: function (v) { HB.CORE.sched.paused = v; }
});

HB.reg('sched', HB.CORE.sched);
