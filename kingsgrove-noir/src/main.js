// Film pipeline: per-shot render -> depth of field -> dissolve -> bloom -> grade (tone map, split tone, grain).
// window.NOIR.renderAt(t) draws one frame; the page is captured frame by frame by render.cjs.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { buildShots } from './shots.js';

const W = 1920, H = 804, FPS = 24, DURATION = 36;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = p => 1 - Math.pow(1 - p, 3);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: false, preserveDrawingBuffer: true, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;

function hdrTarget(withDepth, samples = 0) {
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples });
  if (withDepth) { rt.depthTexture = new THREE.DepthTexture(W, H); rt.depthTexture.type = THREE.FloatType; }
  return rt;
}
const sceneRT = [hdrTarget(true, 4), hdrTarget(true, 4)];
const dofRT = [hdrTarget(false), hdrTarget(false)];
const mixRT = hdrTarget(false);

const quadVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

// ---- depth of field: scatter-as-gather over a Vogel disk, rotated per pixel
const dof = new FullScreenQuad(new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, tDepth: { value: null }, uNear: { value: .1 }, uFar: { value: 10 }, uFocus: { value: 1 },
    uAperture: { value: 0 }, uMaxR: { value: 32 }, uRes: { value: new THREE.Vector2(W, H) } },
  vertexShader: quadVS,
  fragmentShader: `
    uniform sampler2D tColor, tDepth; uniform float uNear, uFar, uFocus, uAperture, uMaxR; uniform vec2 uRes; varying vec2 vUv;
    float lin(vec2 uv){ float z = texture2D(tDepth, uv).x; return uNear*uFar/(uFar - z*(uFar-uNear)); }
    float coc(float d){ return min(uMaxR, uAperture*abs(d-uFocus)/d); }
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec3 c0col = texture2D(tColor, vUv).rgb;
      if (uAperture <= 0.) { gl_FragColor = vec4(c0col, 1.); return; }
      float d0 = lin(vUv), c0 = coc(d0);
      float w0 = 1./max(c0*c0, 1.);
      vec3 sum = c0col*w0; float ws = w0;
      float rot = h(gl_FragCoord.xy)*6.2831853;
      const int NS = 56;
      for (int i = 0; i < NS; i++) {
        float fi = float(i)+.5, r = sqrt(fi/float(NS)), th = fi*2.39996323 + rot;
        float dist = r*uMaxR;
        vec2 uv = vUv + vec2(cos(th), sin(th))*dist/uRes;
        float ds = lin(uv), cs = coc(ds);
        float reach = clamp(cs - dist + 1., 0., 1.);
        float behind = ds > d0 ? clamp(c0 - dist + 1., 0., 1.) : 1.;
        float w = reach*behind/max(cs*cs, 1.);
        sum += texture2D(tColor, uv).rgb*w; ws += w;
      }
      gl_FragColor = vec4(sum/ws, 1.);
    }`,
}));

// ---- dissolve + fades
const mixQ = new FullScreenQuad(new THREE.ShaderMaterial({
  uniforms: { tA: { value: null }, tB: { value: null }, uW: { value: 0 }, uGain: { value: 1 } },
  vertexShader: quadVS,
  fragmentShader: `uniform sampler2D tA, tB; uniform float uW, uGain; varying vec2 vUv;
    void main(){ vec3 a = texture2D(tA, vUv).rgb, b = texture2D(tB, vUv).rgb; gl_FragColor = vec4(mix(a, b, uW)*uGain, 1.); }`,
}));

const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.5, 0.9);

// ---- grade: filmic tone map, keep the reds, cool the shadows, warm the highlights, grain, vignette, weave
const grade = new FullScreenQuad(new THREE.ShaderMaterial({
  uniforms: { tHDR: { value: null }, uSeed: { value: 0 }, uExposure: { value: 1 }, uRes: { value: new THREE.Vector2(W, H) } },
  vertexShader: quadVS,
  fragmentShader: `
    uniform sampler2D tHDR; uniform float uSeed, uExposure; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uSeed*1.618)*43758.5453); }
    vec3 aces(vec3 x){ return clamp(x*(2.51*x+.03)/(x*(2.43*x+.59)+.14), 0., 1.); }
    void main(){
      vec2 uv = vUv + vec2(sin(uSeed*.71), cos(uSeed*.53))*.00035;
      vec2 dc = (uv - .5);
      float ca = dot(dc, dc)*.004;
      vec3 col = vec3(texture2D(tHDR, uv + dc*ca).r, texture2D(tHDR, uv).g, texture2D(tHDR, uv - dc*ca).b)*uExposure;
      float l = dot(col, vec3(.2126,.7152,.0722));
      float red = smoothstep(.45, .85, (col.r - max(col.g, col.b)*1.4)/(col.r + 1e-4));
      col = mix(vec3(l), col, mix(.38, 1.1, red));
      col = aces(col);
      col = pow(col, vec3(1./2.2));
      float L = dot(col, vec3(.299,.587,.114));
      col += vec3(-.012, .006, .022)*(1. - smoothstep(0., .45, L));
      col *= mix(vec3(1.), vec3(1.05, 1., .9), smoothstep(.45, 1., L));
      col = col*.965 + .012;
      float v = smoothstep(1.05, .25, length(dc*vec2(1.25, 1.)));
      col *= mix(.55, 1., v);
      float g = h(floor(uv*uRes)) - .5;
      col += g*.075*(1. - L*.55);
      gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
    }`,
}));

let shots = [];

function renderShot(s, t, i) {
  s.update(t - s.start);
  renderer.setRenderTarget(sceneRT[i]);
  renderer.render(s.scene, s.camera);
  const u = dof.material.uniforms;
  u.tColor.value = sceneRT[i].texture; u.tDepth.value = sceneRT[i].depthTexture;
  u.uNear.value = s.camera.near; u.uFar.value = s.camera.far; u.uFocus.value = s.focus;
  u.uAperture.value = s.aperture; u.uMaxR.value = Math.min(40, Math.max(6, s.aperture * 1.4));
  renderer.setRenderTarget(dofRT[i]);
  dof.render(renderer);
  return dofRT[i];
}

// ---- credits (DOM over the canvas)
const CREDITS = [
  ['c0', 1.8, 5.0], ['c1', 7.0, 10.2], ['c2', 12.3, 15.4], ['c3', 18.0, 21.2], ['c4', 23.4, 26.6], ['c5', 28.2, 30.9],
];
const $ = id => document.getElementById(id);
function renderCredits(t) {
  CREDITS.forEach(([id, a, b]) => {
    const el = $(id);
    const p = seg(t, a, a + 1.0) * (1 - seg(t, b - 0.9, b));
    el.style.opacity = p;
    el.style.filter = `blur(${(1 - p) * 5}px)`;
    el.style.letterSpacing = `${0.36 + 0.1 * seg(t, a, b)}em`;
  });
  const tw = seg(t, 32.9, 34.2);
  $('tWord').style.opacity = tw;
  $('tWord').style.filter = `blur(${(1 - tw) * 10}px)`;
  $('tWord').style.letterSpacing = `${0.52 - 0.2 * easeOut(tw)}em`;
  const ts = seg(t, 33.7, 34.5);
  $('tSports').style.opacity = ts;
  $('tRule').style.transform = `scaleX(${easeOut(seg(t, 33.6, 34.6))})`;
  $('tLine').style.opacity = seg(t, 34.4, 35.2);
  $('tUrl').style.opacity = seg(t, 35.0, 35.7) * 0.85;
}

function renderAt(t) {
  t = clamp(t, 0, DURATION - 1e-6);
  const active = shots.filter(s => t >= s.start && t < s.end);
  let A = active[0], B = active[1];
  const texA = renderShot(A, t, 0);
  let w = 0, texB = texA;
  if (B) { texB = renderShot(B, t, 1); w = seg(t, B.start, A.end); }
  const m = mixQ.material.uniforms;
  m.tA.value = texA.texture; m.tB.value = texB.texture; m.uW.value = w;
  m.uGain.value = seg(t, 0.15, 1.6);
  renderer.setRenderTarget(mixRT);
  mixQ.render(renderer);
  const bl = B && w > 0.5 ? B.bloom : A.bloom;
  bloom.strength = bl[0]; bloom.radius = bl[1]; bloom.threshold = bl[2];
  bloom.render(renderer, null, mixRT, 0, false);
  const g = grade.material.uniforms;
  g.tHDR.value = mixRT.texture; g.uSeed.value = Math.floor(t * FPS) % 997;
  renderer.setRenderTarget(null);
  grade.render(renderer);
  renderCredits(t);
}

// cue sheet for the score
function events() {
  return [
    ...shots.map((s, i) => ({ t: s.start, type: 'shot', i })),
    { t: 11.0 + 3.95, type: 'wicket' },
    ...[1.0, 1.62, 2.24, 2.86].map(o => ({ t: 27.2 + o, type: 'flood' })),
    { t: 32.9, type: 'title' },
  ];
}

window.NOIR = { W, H, FPS, DURATION, renderAt, events };
// canvas textures are drawn with the web fonts, so load every face before building the shots
Promise.all(['300 20px Montserrat', '400 20px Montserrat', '500 20px Montserrat', '500 60px "Cormorant Garamond"', '600 60px "Cormorant Garamond"',
  'italic 500 40px "Cormorant Garamond"', '700 50px Caveat', '400 64px "Bebas Neue"'].map(f => document.fonts.load(f)))
  .then(() => document.fonts.ready)
  .then(() => { shots = buildShots(renderer); renderAt(0); window.NOIR_READY = true; })
  .catch(e => { window.NOIR_ERROR = String(e && e.stack || e); });
