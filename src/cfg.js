// cfg.js — HB.CFG: constants, world dims, 90-colour palette, roster, sponsors (ARCH §10).
// First file in the build: creates the single window.HB root with HB.reg().
(function () {
  if (window.HB) return;
  var HBroot = {
    version: 'p0',
    api: {},
    reg: function (key, api) {
      if (HBroot.api[key]) throw new Error('HB.reg: duplicate key "' + key + '"');
      HBroot.api[key] = api;
    }
  };
  window.HB = HBroot;
  // HB.CORE hosts bus-adjacent engine modules; created here (cfg.js loads first)
  // so core-*.js can attach: sched / pipeline / camera / light / boot.
  HBroot.CORE = {};
})();

HB.CFG = (function () {
  var PAL = [
    // greys 8
    '#07080a', '#101317', '#1a1f26', '#262d36', '#39424e', '#525e6c', '#74818f', '#a3abb5',
    // skin/hair 6
    '#f3c9a5', '#dfa07b', '#b57a52', '#8a5a3b', '#2e2a26', '#c8b08b',
    // grass 8
    '#1d4a1e', '#2a6a26', '#3f8a2f', '#57a838', '#77c14a', '#a3d36a', '#cde694', '#5e8f43',
    // clay 8
    '#6e3320', '#8a4a2b', '#a05f38', '#b87344', '#ce8d58', '#e2a874', '#f2c692', '#57391f',
    // hard 7
    '#1f5f8a', '#2f7fb0', '#4d9fce', '#7db9de', '#1a3a55', '#b8d9ec', '#2a4a68',
    // carpet 6
    '#382a6e', '#4d3f92', '#6a5cb0', '#8b7ecb', '#241a4a', '#b3a5e0',
    // court paint 8
    '#1a4a7a', '#2b63a0', '#3a7ab8', '#4d8fc4', '#6aa6d2', '#8fbfe0', '#b8d8ee', '#12335a',
    // kit accents 16
    '#c8102e', '#e8365a', '#f2f2f2', '#111318', '#f7c531', '#f2a007', '#e2591f', '#8a2be2',
    '#00a3c8', '#28c76f', '#1e3a8a', '#64748b', '#f28cb1', '#7fb069', '#d95d39', '#3ecfb2',
    // wood/stone 12
    '#6b4a2f', '#85613f', '#a37c53', '#c19a6b', '#7d7469', '#96897c', '#b2a698', '#d4cabb',
    '#4a423b', '#5e564d', '#8f8578', '#cfc5b4',
    // foliage 6
    '#14330f', '#1f4d18', '#2f6b20', '#48882b', '#6da83e', '#97c35c',
    // neon/LED 5
    '#ff2f6d', '#ffd23e', '#3ef2d0', '#3ea8ff', '#f2f6ff'
  ];
  if (PAL.length !== 90) throw new Error('HB.CFG: palette must have exactly 90 colours');

  // World (ARCH §5): metres, Y up, court centre at origin.
  // COURT: W total 23.77, baselines z=±11.885, singles x=±4.115, doubles x=±5.485.
  var COURT = { W: 23.77, halfW: 11.885, singlesX: 4.115, dX: 5.485,
                apron: { x: 9.6, z: 17.0 }, netH: { post: 1.07, centre: 0.914 } };

  var island = { rx: 32, rz: 22, rockDepth: 7 };   // 64×44 m ("~64×40" §5; +z for clubhouse)
  var masts = [[-18, -14], [18, -14], [-18, 14], [18, 14]]; // 4 floodlight masts (x,z)

  var roster = [
    { id: 'voss',  name: 'Dario Voss',      sex: 'M', hand: 'R',
      kit: { shirt: '#c8102e', shorts: '#111318', skin: '#f3c9a5', hair: '#2e2a26' },
      pow: 92, place: 78, cons: 70,
      serve: { kphMean: 196, sd: 14, dir: { w: 0.38, b: 0.34, t: 0.28 }, dRate: 0.05 },
      tactic: { net: 34, drop: 22, lob: 18, risk: 74 } },
    { id: 'andersson', name: 'Milo Andersson', sex: 'M', hand: 'L',
      kit: { shirt: '#00a3c8', shorts: '#f2f2f2', skin: '#dfa07b', hair: '#c8b08b' },
      pow: 84, place: 90, cons: 84,
      serve: { kphMean: 188, sd: 12, dir: { w: 0.42, b: 0.30, t: 0.28 }, dRate: 0.03 },
      tactic: { net: 26, drop: 30, lob: 24, risk: 48 } },
    { id: 'anand', name: 'Priya Anand', sex: 'W', hand: 'R',
      kit: { shirt: '#f7c531', shorts: '#1e3a8a', skin: '#b57a52', hair: '#2e2a26' },
      pow: 78, place: 88, cons: 90,
      serve: { kphMean: 172, sd: 12, dir: { w: 0.40, b: 0.32, t: 0.28 }, dRate: 0.03 },
      tactic: { net: 24, drop: 36, lob: 30, risk: 52 } },
    { id: 'kovar', name: 'Jana Kovář', sex: 'W', hand: 'R',
      kit: { shirt: '#28c76f', shorts: '#111318', skin: '#e2a874', hair: '#f2a007' },
      pow: 86, place: 80, cons: 68,
      serve: { kphMean: 178, sd: 15, dir: { w: 0.36, b: 0.36, t: 0.28 }, dRate: 0.06 },
      tactic: { net: 42, drop: 26, lob: 20, risk: 70 } }
  ];

  var sponsors = {
    boards: ['HOLLYBROOK OPEN', 'CLUB NORDIC', 'AERLY', 'BRAMBLE & CO', 'KITE AIRWAYS',
             'MARLOW WATCHES', 'OSPREY SPORT'],
    marquee: 'HOLLYBROOK OPEN — SINGLES FINAL',
    led: ['HOLLYBROOK OPEN', 'WELCOME TO CENTRE COURT', 'PLAY FAIR']
  };

  var bounce = { // per-surface ball params (ARCH §11)
    grass:  { rest: 0.62, mu: 0.35, skid: 0.55, roll: 0.62, speedMix: 1.00, color: '#57a838' },
    clay:   { rest: 0.68, mu: 0.70, skid: 0.10, roll: 0.40, speedMix: 0.93, color: '#b87344' },
    hard:   { rest: 0.71, mu: 0.50, skid: 0.30, roll: 0.50, speedMix: 0.97, color: '#2f7fb0' },
    carpet: { rest: 0.66, mu: 0.28, skid: 0.85, roll: 0.70, speedMix: 1.05, color: '#6a5cb0' }
  };

  var surfaces = ['grass', 'clay', 'hard', 'carpet'];
  var tods = ['day', 'dusk', 'night'];
  var formats = { short: 'FAST4', set: 'One set', bo3: 'Best of 3' };

  var current = { surface: 'hard', tod: 'day' };

  return { palette: PAL, COURT: COURT, island: island, masts: masts, roster: roster,
           sponsors: sponsors, bounce: bounce, surfaces: surfaces, tods: tods,
           formats: formats, current: current, cam: { elev: 31 * Math.PI / 180, az0: 0 } };
})();

HB.reg('cfg', HB.CFG);
