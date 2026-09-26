// The six CG shots plus the title plate. Each shot is a pure function of its local time.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as TX from './tex.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const easeOut = p => 1 - Math.pow(1 - p, 3);
const lerp = (a, b, p) => a + (b - a) * p;

let T = null;          // shared textures, built once
function textures() {
  if (T) return T;
  T = {
    leather: TX.leather(), willow: TX.willow(21), stumpWood: TX.willow(22), grip: TX.grip(),
    wall: TX.concrete(41, [52, 54, 57]), floor: TX.concrete(42, [40, 41, 43]), asphalt: TX.asphalt(),
    grass: TX.grass(), pitch: TX.pitch(), tape: TX.tape(), chalk: TX.chalkBat(), blinds: TX.blinds(),
    dot: TX.softDot(), desk: TX.darkWood(), score: TX.scorebook(), circle: TX.redCircle(),
    markers: [1, 2, 3].map(TX.marker),
  };
  return T;
}

function darkEnv(renderer, scene, intensity) {
  // a faint room-like environment so lacquer, gold foil and wet surfaces have something to reflect
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x020203);
  const box = (w, h, x, y, z, c) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  box(4, 1, 0, 5, 2, new THREE.Color(1.4, 1.1, 0.8));
  box(2, 6, -6, 1, -2, new THREE.Color(0.25, 0.35, 0.45));
  box(3, 2, 5, 2, -4, new THREE.Color(0.5, 0.4, 0.3));
  scene.environment = pm.fromScene(env, 0.02).texture;
  scene.environmentIntensity = intensity;
}

// ------------------------------------------------------------------ reusable models
const R_BALL = 0.036;
function seamHeight(a) {                      // a = latitude in radians, seam on the equator
  const band = 0.1;
  const x = Math.abs(a) / band;
  return x < 1 ? 0.024 * (1 - x * x) * (1 - x * x) : 0;
}

let BALL = null;
export function makeBall() {
  if (!BALL) BALL = buildBall();
  const ball = new THREE.Group();
  BALL.forEach(m => { const c = m.clone(); ball.add(c); });
  return ball;
}
function buildBall() {
  const tx = textures();
  const g = new THREE.SphereGeometry(R_BALL, 384, 512);
  const pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const lat = Math.asin(clamp(v.y / R_BALL, -1, 1));
    v.multiplyScalar(1 + seamHeight(lat));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({
    map: tx.leather.map, bumpMap: tx.leather.bump, bumpScale: 0.7,
    roughnessMap: tx.leather.orm, metalnessMap: tx.leather.orm, roughness: 1, metalness: 1,
    clearcoat: 0.5, clearcoatRoughness: 0.36,
  });
  const shell = new THREE.Mesh(g, mat);
  shell.castShadow = shell.receiveShadow = true;

  // three rows of stitching either side of the seam
  const perRow = 150, rows = [-0.078, -0.054, -0.03, 0.03, 0.054, 0.078];
  const sg = new THREE.SphereGeometry(1, 10, 6);
  const sm = new THREE.MeshStandardMaterial({ color: 0xe9ddc4, roughness: 0.78 });
  const inst = new THREE.InstancedMesh(sg, sm, perRow * rows.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(), tan = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3();
  const basis = new THREE.Matrix4(), tilt = new THREE.Quaternion();
  let k = 0;
  rows.forEach((lat, ri) => {
    for (let i = 0; i < perRow; i++) {
      const lon = (i + (ri % 2) * 0.5) / perRow * Math.PI * 2;
      const r = R_BALL * (1 + seamHeight(lat)) + 0.00012;
      nrm.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      p.copy(nrm).multiplyScalar(r);
      tan.set(-Math.sin(lon), 0, Math.cos(lon));
      bin.crossVectors(nrm, tan);
      basis.makeBasis(tan, nrm, bin);
      q.setFromRotationMatrix(basis);
      tilt.setFromAxisAngle(up.set(0, 1, 0), (lat > 0 ? 1 : -1) * 0.34);
      q.multiply(tilt);
      s.set(0.00112, 0.00022, 0.00029);
      m.compose(p, q, s);
      inst.setMatrixAt(k, m);
      const shade = 0.82 + ((i * 7919 + ri * 131) % 17) / 100;
      inst.setColorAt(k, new THREE.Color(shade, shade * 0.97, shade * 0.9));
      k++;
    }
  });
  inst.castShadow = true;
  return [shell, inst];
}

export function makeBat() {
  const tx = textures();
  const bat = new THREE.Group();
  // blade cross-section: flat face, edges, raised spine at the back
  const sh = new THREE.Shape();
  sh.moveTo(-0.054, 0); sh.lineTo(0.054, 0); sh.lineTo(0.054, 0.034);
  sh.quadraticCurveTo(0.03, 0.036, 0.012, 0.058); sh.quadraticCurveTo(0, 0.064, -0.012, 0.058);
  sh.quadraticCurveTo(-0.03, 0.036, -0.054, 0.034); sh.lineTo(-0.054, 0);
  const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.56, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.004, bevelSegments: 4, curveSegments: 24 });
  blade.rotateX(-Math.PI / 2);                   // length along +y, flat face towards +z, spine behind
  const uv = blade.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4 + 0.5, uv.getY(i) * 1.6);
  const bm = new THREE.MeshStandardMaterial({ map: tx.willow.map, bumpMap: tx.willow.bump, bumpScale: 0.35, roughness: 0.46 });
  const bladeMesh = new THREE.Mesh(blade, bm);
  bladeMesh.castShadow = bladeMesh.receiveShadow = true;
  bat.add(bladeMesh);
  // handle with grip
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.017, 0.3, 48, 1),
    new THREE.MeshStandardMaterial({ map: tx.grip.map, bumpMap: tx.grip.bump, bumpScale: 1.2, roughness: 0.62 }));
  h.position.set(0, 0.566 + 0.15, -0.028); h.castShadow = true;
  bat.add(h);
  // face sticker near the shoulder
  const [c, x] = (() => { const cc = document.createElement('canvas'); cc.width = 512; cc.height = 256; return [cc, cc.getContext('2d')]; })();
  x.fillStyle = '#0b0b0c'; x.fillRect(0, 0, 512, 256);
  x.strokeStyle = '#b8913f'; x.lineWidth = 6; x.strokeRect(14, 14, 484, 228);
  x.fillStyle = '#c9a24a'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '600 74px "Cormorant Garamond"'; x.letterSpacing = '8px'; x.fillText('KINGSGROVE', 256, 112);
  x.font = '500 26px Montserrat'; x.letterSpacing = '16px'; x.fillText('ENGLISH WILLOW', 262, 186);
  const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace; st.anisotropy = 8;
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.094, 0.047),
    new THREE.MeshStandardMaterial({ map: st, roughness: 0.32, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -2 }));
  sticker.position.set(0, 0.46, 0.0046);
  sticker.receiveShadow = true;
  bat.add(sticker);
  bat.userData.face = sticker;
  return bat;
}

function makeBail() {
  const pts = [[0, 0], [0.0035, 0], [0.0035, 0.011], [0.0058, 0.013], [0.0062, 0.03], [0.0052, 0.034], [0.0066, 0.04],
    [0.0066, 0.07], [0.0052, 0.076], [0.0062, 0.08], [0.0058, 0.097], [0.0035, 0.099], [0.0035, 0.1096], [0, 0.1096]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 32);
  g.translate(0, -0.0548, 0); g.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: textures().stumpWood.map, roughness: 0.38 }));
  m.castShadow = true;
  return m;
}

function makeStumps() {
  const tx = textures();
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: tx.stumpWood.map, bumpMap: tx.stumpWood.bump, bumpScale: 0.2, roughness: 0.34 });
  const stumps = [-0.0953, 0, 0.0953].map(x => {
    const g = new THREE.CylinderGeometry(0.0185, 0.019, 0.711, 40);
    g.translate(0, 0.3555, 0);
    const m = new THREE.Mesh(g, mat);
    m.position.x = x; m.castShadow = m.receiveShadow = true;
    grp.add(m);
    return m;
  });
  const bails = [-0.0476, 0.0476].map(x => { const b = makeBail(); b.position.set(x, 0.717, 0); grp.add(b); return b; });
  return { grp, stumps, bails };
}

// Volumetric-looking light cone (additive, soft at the silhouette, fading with distance).
function lightCone(height, radius, color, strength) {
  const g = new THREE.ConeGeometry(radius, height, 64, 1, true);
  g.translate(0, -height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uH: { value: height } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vY = -position.y; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; uniform float uH; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ float f = pow(abs(dot(vN, vV)), 2.2); float along = clamp(vY/uH, 0., 1.);
        float a = f * pow(1.-along, 1.3) * smoothstep(0., .08, along) * uStrength;
        gl_FragColor = vec4(uColor*a, 1.); }`,
  });
  return new THREE.Mesh(g, mat);
}

function dust(count, box, size, seed, color = 0xffe2b8) {
  const rand = TX.makeRand(seed);
  const pos = new Float32Array(count * 3), ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() - 0.5) * box[0]; pos[i * 3 + 1] = (rand() - 0.5) * box[1]; pos[i * 3 + 2] = (rand() - 0.5) * box[2];
    ph[i] = rand() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: size }, uColor: { value: new THREE.Color(color) }, uMap: { value: textures().dot }, uGain: { value: 1 } },
    vertexShader: `attribute float phase; uniform float uTime; uniform float uSize; varying float vA;
      void main(){ vec3 p = position + vec3(sin(uTime*.3+phase)*.004, cos(uTime*.23+phase*1.3)*.004 + uTime*.0015, 0.);
        vec4 mv = modelViewMatrix*vec4(p,1.); gl_PointSize = uSize / -mv.z; vA = .35+.65*abs(sin(uTime*.8+phase)); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; uniform float uGain; varying float vA;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA * uGain; gl_FragColor = vec4(uColor*a, 1.); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.userData.tick = t => { mat.uniforms.uTime.value = t; };
  return pts;
}

// ------------------------------------------------------------------ shot base
const ray = new THREE.Raycaster();
function shot(start, end, near, far) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(30, 1920 / 804, near, far);
  const s = { start, end, scene, camera, focus: 1, aperture: 0, bloom: [0.6, 0.5, 0.9], exposure: 1, update() {} };
  // distance to whatever is under screen point (x, y) in NDC; falls back to the current focus
  s.autofocus = (x, y, objs) => {
    camera.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    const hit = ray.intersectObjects(objs, true)[0];
    if (hit) s.focus = hit.distance;
    return s.focus;
  };
  return s;
}

// ------------------------------------------------------------------ 1. the seam
function shotSeam(renderer) {
  const s = shot(0.0, 6.4, 0.003, 3);
  darkEnv(renderer, s.scene, 0.06);
  const ball = makeBall();
  ball.rotation.z = 0.08;
  s.scene.add(ball);
  const key = new THREE.SpotLight(0xffb070, 0.55, 2, 0.5, 0.8, 2);
  key.position.set(0.27, 0.035, 0.02); key.target = ball; key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.00002; key.shadow.camera.near = 0.05; key.shadow.camera.far = 1;
  s.scene.add(key);
  const rim = new THREE.SpotLight(0x86a6cc, 0.5, 2, 0.4, 0.8, 2); rim.position.set(-0.1, 0.22, -0.16); rim.target = ball; s.scene.add(rim);
  const d = dust(22, [0.05, 0.03, 0.03], 0.9, 5); d.position.set(0.01, 0.012, 0.02); s.scene.add(d);
  s.camera.fov = 24;
  s.update = tl => {
    ball.rotation.y = 0.9 - tl * 0.06;
    const p = ease(seg(tl, 0, 6.4));
    s.camera.position.set(lerp(-0.014, 0.004, p), lerp(0.012, 0.009, p), lerp(0.084, 0.072, p));
    s.camera.lookAt(0.007, 0.0015, 0.02);
    s.camera.updateProjectionMatrix();
    key.intensity = 0.4 * seg(tl, 0.2, 2.2);
    rim.intensity = 0.5 * seg(tl, 0.8, 3.0);
    d.userData.tick(tl);
    s.autofocus(0.0, -0.12, [ball.children[0]]);
    s.aperture = 9;
  };
  s.bloom = [0.55, 0.6, 0.85];
  return s;
}

// ------------------------------------------------------------------ 2. the bat, blinds light sweeping
function shotBat(renderer) {
  const tx = textures();
  const s = shot(6.0, 11.6, 0.01, 12);
  darkEnv(renderer, s.scene, 0.12);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshStandardMaterial({ map: tx.wall.map, bumpMap: tx.wall.bump, bumpScale: 1.5, roughness: 0.9 }));
  wall.position.set(0, 1.2, -0.12); wall.receiveShadow = true; s.scene.add(wall);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ map: tx.floor.map, bumpMap: tx.floor.bump, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.scene.add(floor);
  const bat = makeBat();
  bat.position.set(0, 0.004, 0.02);
  bat.rotation.x = -0.14;
  bat.rotation.y = 0.18;
  s.scene.add(bat);
  const blind = new THREE.SpotLight(0xffc98a, 26, 8, 0.42, 0.25, 2);
  blind.map = tx.blinds; blind.castShadow = true; blind.shadow.mapSize.set(2048, 2048); blind.shadow.bias = -0.0002;
  const tgt = new THREE.Object3D(); s.scene.add(tgt); blind.target = tgt;
  s.scene.add(blind);
  const fill = new THREE.DirectionalLight(0x5a78a0, 0.03); fill.position.set(-1, 1, 1); s.scene.add(fill);
  const d = dust(60, [0.9, 0.9, 0.35], 5, 7); d.position.set(0, 0.5, -0.02); d.material.uniforms.uGain.value = 0.4; s.scene.add(d);
  s.camera.fov = 30;
  s.update = tl => {
    const p = ease(seg(tl, 0, 5.6));
    // a car passes outside: the slatted light slides across the room
    const sweep = seg(tl, 0.2, 5.4);
    blind.position.set(lerp(1.6, -1.2, sweep), 1.4, 1.6);
    tgt.position.set(lerp(-0.2, 0.3, sweep), 0.5, 0);
    blind.intensity = 26 * Math.sin(Math.PI * clamp(sweep * 1.05));
    const aim = bat.localToWorld(new THREE.Vector3(0, lerp(0.2, 0.6, p), -0.02));
    s.camera.position.set(aim.x + lerp(0.34, 0.2, p), aim.y + lerp(-0.08, 0.02, p), aim.z + lerp(0.3, 0.38, p));
    s.camera.lookAt(aim);
    s.camera.updateProjectionMatrix();
    d.userData.tick(tl + 3);
    s.autofocus(0, 0, [bat]);
    s.aperture = 5;
  };
  s.bloom = [0.5, 0.55, 0.9];
  return s;
}

// ------------------------------------------------------------------ 3. stumps in the rain; the bails go
function rain(count, box, seed) {
  const rand = TX.makeRand(seed);
  const base = Array.from({ length: count }, () => [(rand() - 0.5) * box[0], rand() * box[1], (rand() - 0.5) * box[2], 0.7 + rand() * 0.6]);
  const pos = new Float32Array(count * 6), col = new Float32Array(count * 6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  lines.userData.tick = (t, lightPos, lightDir, cosCut, slow = 1) => {
    const v = new THREE.Vector3();
    base.forEach(([x, y, z, sp], i) => {
      const fall = 8 * sp * slow;
      let yy = (y - t * fall) % box[1]; if (yy < 0) yy += box[1];
      const len = 0.12 * sp * slow + 0.01;
      pos.set([x, yy, z, x - 0.01, yy + len, z], i * 6);
      v.set(x, yy, z).sub(lightPos).normalize();
      const inCone = clamp((v.dot(lightDir) - cosCut) / (1 - cosCut) * 4);
      const b = 0.02 + inCone * 0.55;
      col.set([b * 1.0, b * 0.8, b * 0.55, b * 0.5, b * 0.4, b * 0.3], i * 6);
    });
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  };
  return lines;
}

function pitchGround(s, tx, withPitch = true) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: tx.grass.map, roughness: 0.55 }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; s.scene.add(g);
  if (withPitch) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 20.12), new THREE.MeshStandardMaterial({ map: tx.pitch.map, roughness: 0.3, metalness: 0 }));
    p.rotation.x = -Math.PI / 2; p.position.set(0, 0.002, -10.06 + 1.22); p.receiveShadow = true; s.scene.add(p);
  }
}

function shotStumps(renderer) {
  const tx = textures();
  const s = shot(11.0, 17.4, 0.05, 120);
  darkEnv(renderer, s.scene, 0.08);
  s.scene.fog = new THREE.FogExp2(0x05070a, 0.07);
  pitchGround(s, tx);
  const { grp, stumps, bails } = makeStumps();
  s.scene.add(grp);
  const lamp = new THREE.SpotLight(0xffae62, 95, 30, 0.34, 0.55, 1.6);
  lamp.position.set(1.4, 7.5, 1.8); lamp.target = grp; lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048); lamp.shadow.bias = -0.0003; lamp.shadow.camera.near = 2; lamp.shadow.camera.far = 14;
  s.scene.add(lamp);
  const cone = lightCone(8.2, 2.9, 0xffb46a, 0.16);
  cone.position.copy(lamp.position);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), lamp.position).normalize());
  s.scene.add(cone);
  const moon = new THREE.DirectionalLight(0x50688a, 0.08); moon.position.set(-3, 4, -6); s.scene.add(moon);
  const drops = rain(2600, [7, 7, 7], 9); s.scene.add(drops);
  // distant lights for bokeh
  const far = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.8) }));
    m.position.set(-18 + i * 4.3, 2 + (i % 3) * 0.6, -34 - (i % 2) * 6); far.add(m);
  }
  s.scene.add(far);
  const bailRest = bails.map(b => b.position.clone());
  const HIT = 3.95, SLOW = 0.3;
  const lightDir = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), lamp.position).normalize();
  s.camera.fov = 28;
  s.update = tl => {
    const p = ease(seg(tl, 0, 6.4));
    s.camera.position.set(lerp(0.9, 0.45, p), lerp(0.42, 0.52, p), lerp(3.4, 1.55, p));
    s.camera.lookAt(0, 0.55, 0);
    s.camera.updateProjectionMatrix();
    // the wicket is broken by something nobody sees, in slow motion
    const ht = Math.max(0, tl - HIT) * SLOW;
    const vel = [[-0.9, 2.1, -1.6, 7, 3], [0.7, 2.4, -1.9, -9, 5]];
    bails.forEach((b, i) => {
      const [vx, vy, vz, wz, wx] = vel[i];
      if (ht <= 0) { b.position.copy(bailRest[i]); b.rotation.set(0, 0, 0); return; }
      let y = bailRest[i].y + vy * ht - 4.9 * ht * ht;
      const tLand = (vy + Math.sqrt(vy * vy + 4 * 4.9 * (bailRest[i].y - 0.006))) / 9.8;
      let tt = ht;
      if (ht > tLand) { tt = tLand; y = 0.006 + Math.max(0, 0.6 * (ht - tLand) - 4.9 * (ht - tLand) ** 2); }
      b.position.set(bailRest[i].x + vx * tt, Math.max(0.006, y), vz * tt);
      b.rotation.set(wx * tt, 0, wz * tt);
    });
    stumps[1].rotation.x = -0.12 * easeOut(clamp(ht / 0.12));
    stumps[0].rotation.z = 0.03 * easeOut(clamp(ht / 0.2));
    drops.userData.tick(tl, lamp.position, lightDir, Math.cos(0.36), ht > 0 ? 0.45 : 1);
    s.focus = s.camera.position.distanceTo(new THREE.Vector3(0, 0.55, 0));
    s.aperture = 7;
  };
  s.bloom = [0.7, 0.6, 0.85];
  return s;
}

// ------------------------------------------------------------------ 4. evidence on wet asphalt
function markerTent(tex) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 });
  for (const sgn of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.112), mat);
    f.position.set(0, 0.052, sgn * 0.022); f.rotation.x = sgn * 0.4; if (sgn < 0) f.rotation.y = Math.PI;
    f.castShadow = true; g.add(f);
  }
  return g;
}

function shotEvidence(renderer) {
  const tx = textures();
  const s = shot(16.8, 22.8, 0.02, 60);
  darkEnv(renderer, s.scene, 0.08);
  s.scene.fog = new THREE.FogExp2(0x04060a, 0.12);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ map: tx.asphalt.map, roughnessMap: tx.asphalt.rough, bumpMap: tx.asphalt.bump, bumpScale: 1.2, roughness: 1, metalness: 0.05 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; s.scene.add(ground);
  const ball = makeBall(); ball.position.set(0, R_BALL * 1.02, 0); ball.rotation.set(0.4, 2.2, 0.2); s.scene.add(ball);
  const m1 = markerTent(tx.markers[0]); m1.position.set(-0.13, 0, 0.05); m1.rotation.y = 0.5; s.scene.add(m1);
  const bail = makeBail(); bail.position.set(0.55, 0.006, -0.35); bail.rotation.y = 0.7; s.scene.add(bail);
  const m2 = markerTent(tx.markers[1]); m2.position.set(0.45, 0, -0.26); m2.rotation.y = -0.3; s.scene.add(m2);
  const chalk = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.93), new THREE.MeshStandardMaterial({ map: tx.chalk, transparent: true, roughness: 0.9, depthWrite: false }));
  chalk.rotation.x = -Math.PI / 2; chalk.rotation.z = 1.1; chalk.position.set(1.05, 0.003, -1.0); s.scene.add(chalk);
  const m3 = markerTent(tx.markers[2]); m3.position.set(0.72, 0, -0.78); m3.rotation.y = 0.2; s.scene.add(m3);
  // police tape: "BOUNDARY  DO NOT CROSS"
  const tg = new THREE.PlaneGeometry(7, 0.075, 80, 1);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i); tp.setY(i, tp.getY(i) - 0.12 * (1 - (x / 3.5) ** 2)); tp.setZ(i, Math.sin(x * 1.3) * 0.05); }
  tg.computeVertexNormals();
  const tapeMesh = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: tx.tape, roughness: 0.45, side: THREE.DoubleSide }));
  tapeMesh.position.set(0.3, 0.24, -1.9); tapeMesh.rotation.y = -0.12; s.scene.add(tapeMesh);
  const torch = new THREE.SpotLight(0xdfe8ff, 13, 10, 0.22, 0.5, 1.5);
  torch.castShadow = true; torch.shadow.mapSize.set(2048, 2048); torch.shadow.bias = -0.0002;
  const tt = new THREE.Object3D(); s.scene.add(tt); torch.target = tt; s.scene.add(torch);
  const red = new THREE.PointLight(0xff2020, 0, 12, 1.4); red.position.set(-3, 1.2, -2.5); s.scene.add(red);
  const blue = new THREE.PointLight(0x2050ff, 0, 12, 1.4); blue.position.set(-2.6, 1.2, -3.2); s.scene.add(blue);
  s.camera.fov = 32;
  s.update = tl => {
    const p = ease(seg(tl, 0, 6));
    s.camera.position.set(lerp(-0.42, 0.12, p), 0.28, lerp(0.62, 0.52, p));
    s.camera.lookAt(lerp(-0.02, 0.52, p), 0.07, lerp(-0.08, -0.5, p));
    s.camera.updateProjectionMatrix();
    // a torch beam searching the ground
    const sw = tl * 0.55;
    torch.position.set(-0.6 + Math.sin(sw) * 0.3, 1.6, 1.2);
    tt.position.set(lerp(-0.05, 0.6, ease(seg(tl, 0.5, 5.2))) + Math.sin(tl * 1.7) * 0.05, 0, lerp(0.02, -0.45, ease(seg(tl, 0.5, 5.2))));
    // red / blue from a car we never see
    const ph = (tl * 2.4) % 1;
    red.intensity = ph < 0.5 ? 3 * Math.sin(ph * 2 * Math.PI) : 0;
    blue.intensity = ph >= 0.5 ? 3 * Math.sin((ph - 0.5) * 2 * Math.PI) : 0;
    // rack focus from the ball (1) to the bail (2)
    const rack = ease(seg(tl, 2.6, 3.6));
    const f1 = s.camera.position.distanceTo(new THREE.Vector3(0, 0.04, 0));
    const f2 = s.camera.position.distanceTo(new THREE.Vector3(0.52, 0.02, -0.33));
    s.focus = lerp(f1, f2, rack);
    s.aperture = 11;
  };
  s.bloom = [0.55, 0.5, 0.9];
  return s;
}

// ------------------------------------------------------------------ 5. the scorebook
function shotScore(renderer) {
  const tx = textures();
  const s = shot(22.2, 27.8, 0.01, 10);
  darkEnv(renderer, s.scene, 0.1);
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ map: tx.desk.map, bumpMap: tx.desk.bump, roughness: 0.5 }));
  desk.rotation.x = -Math.PI / 2; desk.receiveShadow = true; s.scene.add(desk);
  const BW = 0.44, BH = BW * TX.SCORE.H / TX.SCORE.W;
  const bg = new THREE.PlaneGeometry(BW, BH, 120, 20);
  const bp = bg.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i) / (BW / 2);
    bp.setZ(i, 0.008 * (1 - Math.exp(-Math.abs(x) * 7)) + 0.004 * (1 - x * x));
  }
  bg.computeVertexNormals();
  const book = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ map: tx.score, roughness: 0.82 }));
  book.rotation.x = -Math.PI / 2; book.receiveShadow = true; book.castShadow = true; s.scene.add(book);
  // red circle around the duck
  const u = TX.DUCK.x / TX.SCORE.W, v = TX.DUCK.y / TX.SCORE.H;
  const dx = (u - 0.5) * BW, dz = (v - 0.5) * BH;
  const circ = new THREE.Mesh(new THREE.PlaneGeometry(0.046, 0.046), new THREE.MeshStandardMaterial({ map: tx.circle, transparent: true, roughness: 0.5, depthWrite: false }));
  circ.rotation.x = -Math.PI / 2; circ.position.set(dx, 0.0118, dz); s.scene.add(circ);
  // a red pen resting after the fact
  const pen = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.13, 24), new THREE.MeshPhysicalMaterial({ color: 0x8a0c10, roughness: 0.25, clearcoat: 0.8 }));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.012, 24), new THREE.MeshStandardMaterial({ color: 0xb8b8b8, metalness: 1, roughness: 0.3 }));
  tip.position.y = -0.071; tip.rotation.x = Math.PI;
  pen.add(body, tip); pen.children.forEach(c => { c.castShadow = true; });
  pen.rotation.set(Math.PI / 2, 0, 0.9); pen.position.set(dx + 0.07, 0.016, dz + 0.05); s.scene.add(pen);
  const lamp = new THREE.SpotLight(0xffbf7a, 2.4, 3, 0.36, 0.75, 1.5);
  lamp.position.set(-0.35, 0.7, -0.15); lamp.target = circ; lamp.castShadow = true; lamp.shadow.mapSize.set(2048, 2048); lamp.shadow.bias = -0.0001;
  s.scene.add(lamp);
  s.camera.fov = 30;
  s.update = tl => {
    const p = ease(seg(tl, 0, 5.6));
    s.camera.position.set(lerp(dx - 0.2, dx - 0.02, p), lerp(0.2, 0.14, p), lerp(dz + 0.18, dz + 0.1, p));
    s.camera.lookAt(lerp(dx - 0.14, dx, p), 0.01, lerp(dz - 0.02, dz, p));
    s.camera.updateProjectionMatrix();
    tx.circle.draw(ease(seg(tl, 2.2, 3.5)));
    pen.visible = tl > 3.5;
    s.autofocus(0, 0, [book]);
    s.aperture = 9;
  };
  s.bloom = [0.35, 0.5, 0.95];
  return s;
}

// ------------------------------------------------------------------ 6. floodlights in the fog
function shotLights(renderer) {
  const tx = textures();
  const s = shot(27.2, 31.8, 0.1, 400);
  darkEnv(renderer, s.scene, 0.05);
  s.scene.fog = new THREE.FogExp2(0x06080c, 0.012);
  pitchGround(s, tx);
  const { grp } = makeStumps(); grp.position.set(0.3, 0, 0.6); s.scene.add(grp);
  const towers = [];
  const angles = [-0.55, 0.05, 0.62, 1.15];
  angles.forEach((a, i) => {
    const t = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 42, 12), new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.8 }));
    col.position.y = 21; t.add(col);
    const head = new THREE.Group(); head.position.y = 43;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(9, 5.4, 0.6), new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.7 }));
    head.add(frame);
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.46, 20), lampMat);
      l.position.set(-3.6 + c * 1.2, -1.8 + r * 1.2, 0.32); head.add(l);
    }
    head.rotation.x = 0.45;
    t.add(head);
    const R = 85 + i * 6;
    t.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
    t.lookAt(0, 0, 0);
    const cone = lightCone(95, 30, 0xfff1d8, 0);
    cone.position.set(0, 43, 0.6); cone.rotation.x = -1.1; t.add(cone);
    const sl = new THREE.SpotLight(0xfff0d6, 0, 200, 0.5, 0.6, 1.2);
    sl.position.set(0, 43, 0); const st = new THREE.Object3D(); st.position.set(0, 0, R); t.add(st); sl.target = st; t.add(sl);
    s.scene.add(t);
    towers.push({ lampMat, cone, sl, on: 1.0 + i * 0.62 });
  });
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(120, 120, 9, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x07080a, side: THREE.BackSide, roughness: 1 }));
  stand.position.y = 4.5; s.scene.add(stand);
  s.camera.fov = 34;
  s.update = tl => {
    const p = ease(seg(tl, 0, 4.6));
    s.camera.position.set(-0.4, 0.5, 2.6);
    s.camera.lookAt(lerp(-24, 8, p), lerp(34, 22, p), -80);
    s.camera.updateProjectionMatrix();
    towers.forEach(tw => {
      const k = tl < tw.on ? 0 : (tl < tw.on + 0.12 ? (Math.floor((tl - tw.on) * 60) % 2) * 0.5 : Math.min(1, 0.4 + (tl - tw.on) * 2));
      tw.lampMat.color.setRGB(7 * k, 6.2 * k, 4.8 * k);
      tw.cone.material.uniforms.uStrength.value = 0.035 * k;
      tw.sl.intensity = 260 * k;
    });
    s.focus = 60; s.aperture = 2.5;
  };
  s.bloom = [0.55, 0.35, 1.2];
  return s;
}

// ------------------------------------------------------------------ 7. the ball in darkness, gold stamp catching the light
function shotTitle(renderer) {
  const s = shot(31.2, 36.0, 0.01, 5);
  darkEnv(renderer, s.scene, 0.05);
  const ball = makeBall(); s.scene.add(ball);
  const slit = new THREE.SpotLight(0xffd9a0, 1.3, 2, 0.16, 0.7, 2);
  slit.position.set(0.2, 0.35, 0.3); slit.target = ball; s.scene.add(slit);
  const rim = new THREE.SpotLight(0x8aa6c8, 0.35, 2, 0.3, 0.9, 2); rim.position.set(-0.3, 0.1, -0.35); rim.target = ball; s.scene.add(rim);
  s.camera.fov = 22;
  s.update = tl => {
    ball.rotation.set(0.3, (tl - 1.25) * 0.42, 0.06);
    s.camera.position.set(0, 0.012, 0.25 - tl * 0.006);
    s.camera.lookAt(0, 0.004, 0);
    s.camera.updateProjectionMatrix();
    const fade = 1 - seg(tl, 1.7, 2.6);
    slit.intensity = 1.3 * seg(tl, 0, 0.7) * fade;
    rim.intensity = 0.35 * seg(tl, 0, 0.7) * fade;
    s.autofocus(0, 0, [ball.children[0]]); s.aperture = 4;
  };
  s.bloom = [0.8, 0.6, 0.8];
  return s;
}

export function buildShots(renderer) {
  return [shotSeam, shotBat, shotStumps, shotEvidence, shotScore, shotLights, shotTitle].map(f => f(renderer));
}
