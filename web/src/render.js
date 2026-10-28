// Renderer, camera rig, toon outline post-process, bloom, particles and screen FX.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VOX } from './nft.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('view').append(renderer.domElement);
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 300);
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 3; controls.maxDistance = 24;
controls.enabled = false;

export const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.4);
export const sun = new THREE.DirectionalLight(0xfff3e0, 2.4);
sun.position.set(-5, 10, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, far: 40 });
export const rim = new THREE.DirectionalLight(0xbfd4ff, 1.4);
rim.position.set(4, 6, -9);
scene.add(hemi, sun, rim);

// ---------- toon outline: edges where depth jumps (silhouettes and overlaps) ----------
const depthRT = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
const outline = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: depthRT.depthTexture }, res: { value: new THREE.Vector2(1, 1) },
    near: { value: camera.near }, far: { value: camera.far }, width: { value: 1.5 }, color: { value: new THREE.Color(0x0b0b10) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform vec2 res; uniform float near, far, width; uniform vec3 color; varying vec2 vUv;
    float lin(vec2 uv){ float z = texture2D(tDepth, uv).r * 2. - 1.; return 2. * near * far / (far + near - z * (far - near)); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 p = width / res;
      float d = lin(vUv);
      float e = max(max(d - lin(vUv + vec2(p.x, 0.)), d - lin(vUv - vec2(p.x, 0.))), max(d - lin(vUv + vec2(0., p.y)), d - lin(vUv - vec2(0., p.y))));
      float edge = smoothstep(0.035, 0.07, e / max(d, 0.5));
      c.rgb = mix(c.rgb, color, edge);
      gl_FragColor = c; }`,
});
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(outline);
export const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.35, 2.4);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let quality = 'high';
export function setQuality(q) {
  quality = q;
  bloom.enabled = q === 'high';
  renderer.shadowMap.enabled = q !== 'low';
  renderer.setPixelRatio(q === 'low' ? 1 : Math.min(devicePixelRatio, 2));
  resize();
}
export function resize() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
  renderer.setSize(w, h);
  composer.setSize(w, h);
  const pr = renderer.getPixelRatio();
  depthRT.setSize(w * pr, h * pr);
  outline.uniforms.res.value.set(w * pr, h * pr);
  outline.uniforms.width.value = 1.2 * pr;
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 0.8 ? 50 : 36;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- camera rig ----------
const rig = { pos: new THREE.Vector3(0, 3, 11), look: new THREE.Vector3(0, 1, 0), k: 0.06 };
const curLook = new THREE.Vector3(0, 1, 0);
export function camTo(pos, look, k = 0.06) { rig.pos.copy(pos); rig.look.copy(look); rig.k = k; }
export function camSnap(pos, look) { camTo(pos, look); camera.position.copy(pos); curLook.copy(look); camera.lookAt(look); }
let shakeAmt = 0, slowUntil = 0;
export let timeScale = 1;
export const shake = a => { shakeAmt = Math.max(shakeAmt, a); };
export function slowmo(s, scale = 0.3) { slowUntil = performance.now() + s * 1000; timeScale = scale; }
export function flash(o = 0.7, color = '#fff') {
  const f = document.getElementById('flash');
  f.style.background = color; f.style.transition = 'none'; f.style.opacity = o;
  requestAnimationFrame(() => { f.style.transition = 'opacity .4s'; f.style.opacity = 0; });
}

// ---------- particles ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
function makePool(n, material) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, n);
  mesh.frustumCulled = false;
  mesh.setColorAt(0, new THREE.Color());
  scene.add(mesh);
  return { mesh, items: Array.from({ length: n }, () => ({ life: 0 })), cursor: 0 };
}
const pools = { lit: makePool(600, new THREE.MeshLambertMaterial()), glow: makePool(900, new THREE.MeshBasicMaterial({ toneMapped: false })) };
export function spawn({ pos, vel, color, life = 1.2, size = VOX * 3, gravity = 9.8, glow = false, bounce = true, drag = 0 }) {
  const pool = pools[glow ? 'glow' : 'lit'], b = pool.items[pool.cursor = (pool.cursor + 1) % pool.items.length];
  Object.assign(b, { p: pos.clone(), v: vel.clone(), life, max: life, s: size, g: gravity, bounce, drag, r: Math.random() * 6 });
  b.c = new THREE.Color(color);
  if (glow) b.c.multiplyScalar(3.2);
}
export function burst(pos, colors, count, power = 1, glow = false) {
  for (let i = 0; i < count; i++) spawn({
    pos: pos.clone().add(new THREE.Vector3((Math.random() - .5) * .3, (Math.random() - .5) * .4, (Math.random() - .5) * .3)),
    vel: new THREE.Vector3((Math.random() - .5) * 4 * power, (Math.random() * 4 + 1) * power, (Math.random() - .5) * 4 * power),
    color: colors[(Math.random() * colors.length) | 0], life: 0.7 + Math.random() * 0.8, size: VOX * (3 + Math.random() * 4), glow,
  });
}
// a rising column of glowing bits (heals, buffs) or a ring (shields)
export function rise(pos, color, n = 24, spread = 0.5) {
  for (let i = 0; i < n; i++) spawn({ pos: pos.clone().add(new THREE.Vector3((Math.random() - .5) * spread, Math.random() * 0.3, (Math.random() - .5) * spread)),
    vel: new THREE.Vector3(0, 1 + Math.random() * 1.5, 0), color, life: 0.8 + Math.random() * 0.6, size: VOX * (2 + Math.random() * 3), gravity: 0, glow: true, bounce: false });
}
export function ring(pos, color, n = 36, r = 0.8) {
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    spawn({ pos: pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.1, Math.sin(a) * r)), vel: new THREE.Vector3(Math.cos(a) * 0.4, 1.2, Math.sin(a) * 0.4),
      color, life: 0.7, size: VOX * 3, gravity: 0, glow: true, bounce: false });
  }
}
function updateBits(dt) {
  for (const { mesh, items } of Object.values(pools)) {
    items.forEach((b, i) => {
      if (b.life > 0) {
        b.life -= dt;
        b.v.y -= b.g * dt;
        if (b.drag) b.v.multiplyScalar(1 - b.drag * dt);
        b.p.addScaledVector(b.v, dt);
        if (b.bounce && b.p.y < b.s / 2) { b.p.y = b.s / 2; b.v.y *= -0.35; b.v.x *= 0.7; b.v.z *= 0.7; }
        b.r += dt * 6;
        const k = Math.min(1, b.life / 0.35, (b.max - b.life) / 0.12 + 0.2) * b.s;
        _m.compose(b.p, _q.setFromEuler(_e.set(b.r, b.r * .7, 0)), _s.set(k, k, k));
        mesh.setColorAt(i, b.c);
      } else _m.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, _m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
}

// ---------- floating text ----------
export function popText(text, worldPos, cls = '') {
  const v = worldPos.clone().project(camera);
  if (v.z > 1) return;
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  el.style.left = `${(v.x + 1) / 2 * innerWidth}px`;
  el.style.top = `${(1 - v.y) / 2 * innerHeight}px`;
  document.getElementById('pops').append(el);
  setTimeout(() => el.remove(), 1200);
}
export function toScreen(worldPos) {
  const v = worldPos.clone().project(camera);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, visible: v.z < 1 };
}

// ---------- loop ----------
const clock = new THREE.Clock();
const hooks = new Set();
export const onFrame = fn => { hooks.add(fn); return () => hooks.delete(fn); };
export let simTime = 0;
export let speedSetting = 1;
export const setSpeed = s => { speedSetting = s; };
function frame() {
  requestAnimationFrame(frame);
  if (performance.now() > slowUntil) timeScale += (1 - timeScale) * 0.15;
  const raw = Math.min(0.05, clock.getDelta()), dt = raw * timeScale * speedSetting;
  simTime += dt;
  for (const h of hooks) h(dt, simTime, raw);
  updateBits(dt);
  if (!Number.isFinite(camera.position.x + camera.position.y + camera.position.z)) camera.position.set(0, 4, 14);   // recover from a bad frame
  if (!Number.isFinite(curLook.x + curLook.y + curLook.z)) curLook.set(0, 1, 0);
  if (controls.enabled) controls.update();
  else {
    camera.position.lerp(rig.pos, rig.k);
    curLook.lerp(rig.look, rig.k * 1.3);
    camera.lookAt(curLook);
  }
  if (shakeAmt > 0.001) {
    camera.position.x += (Math.random() - .5) * shakeAmt; camera.position.y += (Math.random() - .5) * shakeAmt;
    shakeAmt *= 0.86;
  }
  // depth pre-pass for the outline
  // (2D sprites use their own alpha-tested depth material so only the drawn pixels get outlined)
  const swapped = [];
  scene.traverse(o => { if (o.isMesh || o.isInstancedMesh) { swapped.push([o, o.material]); o.material = o.userData.depthMat || depthMat; } });
  renderer.setRenderTarget(depthRT);
  renderer.clear();                 // post passes can leave autoClear off; stale depth = ghost outlines over the painted backdrop
  const bg = scene.background; scene.background = null;
  renderer.render(scene, camera);
  scene.background = bg;
  renderer.setRenderTarget(null);
  for (const [o, m] of swapped) o.material = m;
  composer.render();
}
resize();
frame();
