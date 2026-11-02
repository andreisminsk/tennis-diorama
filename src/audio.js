// audio.js — HB.AUDIO (P7): procedural WebAudio soundscape, OFF until user gesture,
// enable toggle in panel (ARCH §15 / PLAN P7). BUS-only: audio:all + match events.
// Synth bank: hit (filtered noise burst + pitch by kph), bounce (per-surface
// thump), net buzz, umpire/line blip, crowd bed (looped noise swells) + cheers.
HB.AUDIO = (function () {
  var ok = false, ctx = null, master = null, bed = null, bedGain = null;

  function mk() {                                   // lazy AudioContext (gesture-gated)
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    return ctx;
  }

  // ---- one-shot helpers ----
  function env(g, t0, a, peak, d) {                 // attack/decay envelope
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function noiseBuf(dur) {
    var n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function burst(dur, freq, q, peak, a, d, type) {  // filtered noise burst
    if (!ctx) return;
    var t0 = ctx.currentTime;
    var src = ctx.createBufferSource(); src.buffer = noiseBuf(dur);
    var f = ctx.createBiquadFilter(); f.type = type || 'bandpass';
    f.frequency.value = freq; f.Q.value = q;
    var g = ctx.createGain();
    env(g, t0, a, peak, d);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }
  function tone(freq, dur, peak, a, d, type) {      // simple oscillator blip
    if (!ctx) return;
    var t0 = ctx.currentTime;
    var o = ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    var g = ctx.createGain();
    env(g, t0, a, peak, d);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur);
  }

  // ---- sound bank ----
  function sfx(kind, d) {
    if (!ok || !ctx) return;
    d = d || {};
    if (kind === 'hit') {
      // racket "pock": noise burst, brighter + louder with speed
      var k = U.clamp((d.kph || 120) / 220, 0.4, 1.25);
      burst(0.06, 950 + 700 * k, 2.2, 0.5 * k, 0.004, 0.11);
      tone(210 + 90 * k, 0.1, 0.16 * k, 0.003, 0.09, 'triangle');
    } else if (kind === 'bounce') {
      var sf = HB.CFG.bounce[d.surface] || HB.CFG.bounce.hard;
      var hue = sf.color;                            // surface-tinted thump
      var f = { grass: 300, clay: 260, hard: 380, carpet: 420 }[d.surface] || 320;
      burst(0.09, f, 1.4, 0.4 * (sf.roll || 1), 0.003, 0.09);
      tone(f * 0.5, 0.12, 0.12, 0.002, 0.1, 'sine');
    } else if (kind === 'call') {
      tone(660, 0.14, 0.22, 0.005, 0.12, 'square');  // line-call blip
      tone(440, 0.2, 0.14, 0.005, 0.16, 'sine');
    } else if (kind === 'net') {
      burst(0.18, 180, 0.8, 0.3, 0.002, 0.17, 'lowpass'); // net-cord buzz
    } else if (kind === 'ui') {
      tone(520, 0.07, 0.12, 0.002, 0.05, 'square');
    } else if (kind === 'cheer') {
      swell(U.clamp(d.level || 0.5, 0, 1), 1.6);
    }
  }

  // ---- crowd bed: looped brown-ish noise, gain swells on reactions ----
  function swell(level, dur) {
    if (!ok || !ctx || !bedGain) return;
    var t0 = ctx.currentTime;
    bedGain.gain.cancelScheduledValues(t0);
    bedGain.gain.setValueAtTime(bedGain.gain.value, t0);
    bedGain.gain.linearRampToValueAtTime(0.03 + level * 0.14, t0 + 0.25);
    bedGain.gain.setTargetAtTime(0.035, t0 + dur || 1.4, 0.9);
  }
  function buildBed() {
    var n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = b.getChannelData(0), last = 0;
    for (var i = 0; i < n; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.02);
      last *= 0.995;
      d[i] = last * 3;
    }
    bed = ctx.createBufferSource(); bed.buffer = b; bed.loop = true;
    bedGain = ctx.createGain(); bedGain.gain.value = 0.035;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    bed.connect(f); f.connect(bedGain); bedGain.connect(master);
    bed.start();
  }

  // ---- wiring ----
  HB.bus.on('audio:all', function (d) { sfx(d.kind, d); });
  HB.bus.on('ball:bounce', function (dd) {
    sfx('bounce', { surface: dd.surface });
  });
  HB.bus.on('ball:netcord', function () { sfx('net'); });
  HB.bus.on('crowd:react', function (dd) { swell(dd.level || 0.3, 1.2); });
  HB.bus.on('point:end', function (dd) {
    if (dd.how === 'ace') sfx('cheer', { level: 0.65 });
  });
  HB.bus.on('match:end', function () { sfx('cheer', { level: 1 }); });

  var U = HB.UTIL;
  function enable() {                               // must be called from a user gesture
    if (ok) return true;
    if (!mk()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    if (!bed) buildBed();
    ok = true;
    return true;
  }
  function enabled() { return ok; }

  var api = { ready: true, enable: enable, enabled: enabled };
  HB.reg('audio', api);
  return api;
})();
