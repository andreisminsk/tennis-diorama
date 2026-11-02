// core-pipeline.js — renderer, RT, post shader: depth outline + OKLab palette snap +
// Bayer 8×8 dither (ARCH §6). Exposes HB.CORE.pipeline.P = {pixelSize, drawCalls, rw, rh}.
HB.CORE.pipeline = (function () {
  var pal = HB.CFG.palette.map(function (h) { return HB.UTIL.hex2rgb(h); });
  var DARK = 0; // index of darkest grey in palette

  var P = { pixelSize: 2, drawCalls: 0, rw: 0, rh: 0 };
  var renderer, rt, postScene, postCam, postMat, host;
  var dev = false;

  var VERT = [
    'varying vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D tColor;',
    'uniform sampler2D tDepth;',
    'uniform sampler2D tBayer;',
    'uniform sampler2D tPal;',
    'uniform vec2 uTexel;',        // 1 / RT size
    'uniform vec2 uScrTexel;',    // 1 / canvas size
    'uniform float uOutline;',    // depth-edge threshold
    'uniform float uDither;',     // dither amplitude (luminance fraction)
    'uniform float uDev;',        // dev checker strip on/off
    '',
    'vec3 srgb2lin(vec3 c){ return pow(max(c, vec3(0.0)), vec3(2.2)); }',
    // OKLab (Björn Ottosson), linear sRGB in
    'vec3 oklab(vec3 lin){',
    '  float l = 0.4122214708*lin.r + 0.5363325363*lin.g + 0.0514459929*lin.b;',
    '  float m = 0.2119034982*lin.r + 0.6806995451*lin.g + 0.1073969566*lin.b;',
    '  float s = 0.0883024619*lin.r + 0.2817188376*lin.g + 0.6299787005*lin.b;',
    '  vec3 lms = vec3(l,m,s);',
    '  lms = sign(lms)*pow(abs(lms), vec3(1.0/3.0));',
    '  return vec3(',
    '    0.2104542553*lms.x + 0.7936177850*lms.y - 0.0040720468*lms.z,',
    '    1.9779984951*lms.x - 2.4285922050*lms.y + 0.4505937099*lms.z,',
    '    0.0259040371*lms.x + 0.7827717662*lms.y - 0.8086757660*lms.z);',
    '}',
    'vec3 snapPalette(vec3 col){',
    '  vec3 L = oklab(srgb2lin(col));',
    '  float best = 1e12; float bi = 0.0;',
    '  for (int i = 0; i < 90; i++){',
    '    vec3 pc = texture2D(tPal, vec2((float(i)+0.5)/90.0, 0.5)).rgb;',
    '    vec3 d = L - oklab(srgb2lin(pc));',
    '    float dist = dot(d,d);',
    '    if (dist < best){ best = dist; bi = float(i); }',
    '  }',
    '  return texture2D(tPal, vec2((bi+0.5)/90.0, 0.5)).rgb;',
    '}',
    '',
    'void main(){',
    '  vec2 uvPix = vUv;',
    '  vec3 col = texture2D(tColor, uvPix).rgb;',
    '  float depth = texture2D(tDepth, uvPix).x;',
    // depth-based outline: 4-neighbour gradient in RT space (1 px)
    '  float dL = texture2D(tDepth, uvPix + vec2(-uTexel.x, 0.0)).x;',
    '  float dR = texture2D(tDepth, uvPix + vec2( uTexel.x, 0.0)).x;',
    '  float dU = texture2D(tDepth, uvPix + vec2(0.0,  uTexel.y)).x;',
    '  float dD = texture2D(tDepth, uvPix + vec2(0.0, -uTexel.y)).x;',
    '  float grad = max(max(abs(depth-dL), abs(depth-dR)), max(abs(depth-dU), abs(depth-dD)));',
    '  float edge = step(uOutline, grad) * step(0.000001, depth);',
    // dev QA strip: smooth gradients (proves quantize + dither) at screen bottom
    '  if (uDev > 0.5){',
    '    vec2 px = floor(vUv / uScrTexel);',
    '    if (vUv.y < 0.055){',
    '      float t = vUv.x;',
    '      float band = vUv.y < 0.02 ? 0.0 : (vUv.y < 0.036 ? 0.5 : 1.0);',
    '      vec3 g = vec3(t*band + (1.0-band)*t*t, t*0.8*band, (1.0-t)*band + (1.0-band)*t);',
    '      col = mix(col, g, 0.999);',
    '    }',
    '  }',
    // Bayer 8x8 dither in luminance before snapping
    '  float bayer = texture2D(tBayer, vUv * vec2(1.0) / uScrTexel / (uTexel*8.0) ).r;',
    '  bayer = texture2D(tBayer, mod(vUv/uTexel, 8.0)/8.0).r;',
    '  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  float lum2 = lum + (bayer - 0.5) * uDither * max(lum, 0.06);',
    '  col *= (lum > 0.0005) ? (lum2 / lum) : 1.0;',
    '  col = snapPalette(col);',
    '  col = mix(col, texture2D(tPal, vec2((float(' + DARK + ')+0.5)/90.0, 0.5)).rgb, edge);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function makeBayerTex() {
    var M = [0,32,8,40,2,34,10,42, 48,16,56,24,50,18,58,26,
             12,44,4,36,14,46,6,38,  60,28,52,20,62,30,54,22,
             3,35,11,43,1,33,9,41,   51,19,59,27,49,17,57,25,
             15,47,7,39,13,45,5,37,  63,31,55,23,61,29,53,21];
    var data = new Uint8Array(64);
    for (var i = 0; i < 64; i++) data[i] = Math.round((M[i] + 0.5) / 64 * 255);
    var t = new THREE.DataTexture(data, 8, 8, THREE.LuminanceFormat);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  }

  function makePalTex() {
    var data = new Uint8Array(90 * 4);
    for (var i = 0; i < 90; i++) {
      data[i*4] = Math.round(pal[i][0]*255);
      data[i*4+1] = Math.round(pal[i][1]*255);
      data[i*4+2] = Math.round(pal[i][2]*255);
      data[i*4+3] = 255;
    }
    var t = new THREE.DataTexture(data, 90, 1, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  }

  function init(hostEl, opts) {
    host = hostEl;
    dev = !!(opts && opts.dev);
    P.pixelSize = HB.UTIL.clamp(Number(HB.DEBUG.params.pix) || (opts && opts.pixelSize) || 2, 1, 6);
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.autoClear = true;
    host.appendChild(renderer.domElement);

    var palTex = makePalTex(), bayerTex = makeBayerTex();
    postMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null },
        tBayer: { value: bayerTex }, tPal: { value: palTex },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uScrTexel: { value: new THREE.Vector2(1, 1) },
        uOutline: { value: 0.0028 }, uDither: { value: 0.16 }, uDev: { value: dev ? 1 : 0 }
      },
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false
    });
    postScene = new THREE.Scene();
    postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
    postCam = new THREE.Camera();

    var depth = new THREE.DepthTexture(8, 8);
    depth.type = THREE.UnsignedShortType;   // 16-bit depth: fine for ortho outline
    rt = new THREE.WebGLRenderTarget(8, 8, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat, depthTexture: depth
    });

    window.addEventListener('resize', rebuild);
    rebuild();
    return api;
  }

  function rebuild() {
    if (!renderer || !host) return;
    var w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    var rw = Math.max(2, Math.ceil(w / P.pixelSize));
    var rh = Math.max(2, Math.ceil(h / P.pixelSize));
    rt.setSize(rw, rh);
    rt.depthTexture.image.width = rw; rt.depthTexture.image.height = rh;
    rt.depthTexture.dispose(); rt.depthTexture.needsUpdate = true;
    P.rw = rw; P.rh = rh;
    postMat.uniforms.uTexel.value.set(1 / rw, 1 / rh);
    postMat.uniforms.uScrTexel.value.set(1 / w, 1 / h);
  }

  function setPixelSize(n) {
    P.pixelSize = HB.UTIL.clamp(Math.round(n), 1, 6);
    rebuild();
  }

  function render(scene, camera) {
    renderer.setRenderTarget(rt);
    renderer.setClearColor(scene.background || new THREE.Color(0x0e1216), 1);
    renderer.clear();
    if (scene) renderer.render(scene, camera);
    P.drawCalls = renderer.info.render.calls;   // scene-pass draw calls
    postMat.uniforms.tColor.value = rt.texture;
    postMat.uniforms.tDepth.value = rt.depthTexture;
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
  }

  var api = { init: init, render: render, setPixelSize: setPixelSize, rebuild: rebuild, P: P };
  Object.defineProperty(api, 'P', { get: function () { return P; } });
  HB.reg('pipeline', api);
  return api;
})();
