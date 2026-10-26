import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadData, buildFighter, tokenColor, rarityOf, VOX } from './voxel.js';

// Same stat table as Mind Arena.
const STATS = {
  Legendary: { hp: 430, atk: 44, spd: 21, crit: 0.14 },
  Epic: { hp: 422, atk: 43, spd: 17, crit: 0.11 },
  Rare: { hp: 414, atk: 42, spd: 14, crit: 0.09 },
  Uncommon: { hp: 407, atk: 41, spd: 12, crit: 0.07 },
  Common: { hp: 400, atk: 40, spd: 10, crit: 0.05 },
};
const GAP = 1.55;          // fighters stand at +-GAP
const $ = s => document.querySelector(s);

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#stage').after(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 3; controls.maxDistance = 20;

scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-3, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
scene.add(sun);

// voxel tile floor, tinted per side with each fighter's background colour
const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.48, 0.12, 0.48), new THREE.MeshLambertMaterial(), 26 * 14);
tiles.receiveShadow = true;
scene.add(tiles);
function paintFloor(colA, colB) {
  const a = new THREE.Color(colA), b = new THREE.Color(colB), m = new THREE.Matrix4(), c = new THREE.Color();
  let i = 0;
  for (let x = 0; x < 26; x++) for (let z = 0; z < 14; z++) {
    const X = (x - 12.5) * 0.5, Z = (z - 6.5) * 0.5;
    m.makeTranslation(X, -0.06 - ((x + z) % 2) * 0.015, Z);
    tiles.setMatrixAt(i, m);
    c.copy(X < 0 ? a : b).multiplyScalar((x + z) % 2 ? 0.78 : 0.92);
    if (Math.abs(X) < 0.3) c.lerp(new THREE.Color(0xd4ff1f), 0.35);
    tiles.setColorAt(i++, c);
  }
  tiles.instanceMatrix.needsUpdate = true;
  tiles.instanceColor.needsUpdate = true;
}

// ---------- particles (voxel debris) ----------
const BITS = 400;
const bitMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), BITS);
bitMesh.frustumCulled = false;
scene.add(bitMesh);
const bits = Array.from({ length: BITS }, () => ({ life: 0 }));
let bitCursor = 0;
function burst(pos, colors, count, power = 1) {
  for (let i = 0; i < count; i++) {
    const b = bits[bitCursor = (bitCursor + 1) % BITS];
    b.p = pos.clone().add(new THREE.Vector3((Math.random() - .5) * .3, (Math.random() - .5) * .4, (Math.random() - .5) * .3));
    b.v = new THREE.Vector3((Math.random() - .5) * 4 * power, (Math.random() * 4 + 1) * power, (Math.random() - .5) * 4 * power);
    b.life = b.max = 0.8 + Math.random() * 0.8;
    b.s = VOX * (1 + Math.random() * 1.5);
    b.c = new THREE.Color(colors[(Math.random() * colors.length) | 0]);
    b.r = Math.random() * 6;
  }
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
function updateBits(dt) {
  for (let i = 0; i < BITS; i++) {
    const b = bits[i];
    if (b.life > 0) {
      b.life -= dt;
      b.v.y -= 9.8 * dt;
      b.p.addScaledVector(b.v, dt);
      if (b.p.y < b.s / 2) { b.p.y = b.s / 2; b.v.y *= -0.35; b.v.x *= 0.7; b.v.z *= 0.7; }
      b.r += dt * 8;
      const k = Math.min(1, b.life / 0.3) * b.s;
      _m.compose(b.p, _q.setFromEuler(_e.set(b.r, b.r * .7, 0)), _s.set(k, k, k));
      bitMesh.setColorAt(i, b.c);
    } else _m.makeScale(0, 0, 0);
    bitMesh.setMatrixAt(i, _m);
  }
  bitMesh.instanceMatrix.needsUpdate = true;
  if (bitMesh.instanceColor) bitMesh.instanceColor.needsUpdate = true;
}
function partColors(root) {
  const out = [], col = root.userData.parts.body.children[0]?.userData.mesh?.geometry.attributes.color;
  const src = col || Object.values(root.userData.parts).find(p => p.userData?.mesh)?.userData.mesh.geometry.attributes.color;
  for (let i = 0; i < 24; i++) {
    const k = ((Math.random() * src.count) | 0) * 3;
    out.push(new THREE.Color(src.array[k], src.array[k + 1], src.array[k + 2]).multiplyScalar(1.2));
  }
  return out;
}

// ---------- fighters ----------
class Fighter {
  constructor(id, side) {
    this.id = id; this.side = side; this.dir = side === 0 ? 1 : -1;
    this.root = buildFighter(id, side === 1);
    this.p = this.root.userData.parts;
    this.home = -this.dir * GAP;
    this.root.position.x = this.home;
    this.root.rotation.y = this.dir * 0.35;          // turn a little toward the opponent
    this.stats = STATS[rarityOf(id)];
    this.hp = this.stats.hp;
    this.act = null; this.flash = 0; this.ko = false; this.win = false; this.drop = 0;
    this.colors = partColors(this.root);
    scene.add(this.root);
  }
  play(type, dur, extra = {}) { this.act = { type, t: 0, dur, ...extra }; }
  update(t, dt) {
    const { p, dir } = this;
    const body = p.body, head = p.head, item = p.item, emote = p.emote;
    // idle base pose
    let bodyY = (body.userData.baseY ??= body.position.y);
    let x = this.home, y = 0, lean = 0, swing = Math.sin(t * 3 + this.side) * 0.08, sq = 1, hop = 0;
    const breathe = Math.abs(Math.sin(t * 4.2 + this.side * 1.3));
    y += breathe * 0.04; sq = 1 - breathe * 0.03;
    let legA = Math.sin(t * 4.2 + this.side) * 0.05, legB = -legA;
    let headTilt = Math.sin(t * 2.1 + this.side) * 0.06;

    if (this.drop > 0) {     // falling in from the sky
      this.drop = Math.max(0, this.drop - dt);
      y += Math.pow(this.drop / 0.7, 2) * 9;
      if (this.drop === 0) { burst(new THREE.Vector3(this.home, 0.1, 0), [0xffffff, 0xd4ff1f], 25, 0.7); shake(0.25); }
    }
    const a = this.act;
    if (a) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      if (a.type === 'attack') {
        const reach = a.target.home + a.target.dir * 0.95;
        if (k < 0.3) { const u = ease(k / 0.3); lean = u * 0.3 * dir; swing = u * 1.4; sq = 1 - u * 0.12; }
        else if (k < 0.5) { const u = ease((k - 0.3) / 0.2); x = this.home + (reach - this.home) * u; lean = (0.3 - u * 0.65) * dir; swing = 1.4 - u * 3.2; legA = u * 0.5; legB = -u * 0.4; hop = Math.sin(u * Math.PI) * 0.25; }
        else if (k < 0.62) { x = reach; lean = -0.35 * dir; swing = -1.8; legA = 0.5; legB = -0.4; if (!a.hit) { a.hit = true; a.onHit?.(); } }
        else { const u = ease((k - 0.62) / 0.38); x = reach + (this.home - reach) * u; lean = -0.35 * dir * (1 - u); swing = -1.8 * (1 - u); hop = Math.sin(u * Math.PI) * 0.3; }
        if (a.crit && k > 0.3 && k < 0.6) y += Math.sin((k - 0.3) / 0.3 * Math.PI) * 0.6;
      } else if (a.type === 'hit') {
        const u = Math.sin(Math.min(1, k * 1.4) * Math.PI);
        x = this.home - dir * u * (a.crit ? 0.7 : 0.35); lean = u * 0.35 * dir; headTilt += u * 0.4 * dir; sq = 1 - u * 0.15;
      } else if (a.type === 'ko') {
        const u = ease(Math.min(1, k * 1.2));
        x = this.home - dir * u * 0.5; y += Math.sin(u * Math.PI) * 0.8;
        this.root.rotation.z = u * dir * Math.PI / 2;
        headTilt = u * 0.5 * dir;
      } else if (a.type === 'win') {
        y += Math.abs(Math.sin(a.t * 6)) * 0.5; swing = Math.sin(a.t * 12) * 0.6 + 1; headTilt = Math.sin(a.t * 6) * 0.2;
        legA = Math.sin(a.t * 12) * 0.3; legB = -legA;
      }
      if (k >= 1 && a.type !== 'ko' && a.type !== 'win') this.act = null;
    }
    if (!this.ko || !a) {
      this.root.position.set(x, y + hop, 0);
      if (!this.ko) this.root.rotation.z = 0;
    } else this.root.position.set(x, Math.max(0.25, y), 0);
    body.rotation.z = lean;
    body.scale.set(1 + (1 - sq) * 0.6, sq, 1);
    body.position.y = bodyY;
    if (head) head.rotation.z = headTilt;
    if (item) item.rotation.z = swing * dir;
    if (emote) { emote.position.y = (emote.userData.baseY ??= emote.position.y) + Math.sin(t * 3) * 0.06; emote.rotation.z = Math.sin(t * 2) * 0.2; }
    if (p.legL) p.legL.rotation.z = legA;
    if (p.legR) p.legR.rotation.z = legB;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.root.userData.material.emissive.setScalar(this.flash);
  }
  dispose() {
    scene.remove(this.root);
    this.root.traverse(o => o.geometry?.dispose());
    this.root.userData.material.dispose();
  }
}
const ease = u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;

// ---------- camera & effects ----------
let shakeAmt = 0, timeScale = 1, slowUntil = 0, camMode = 'orbit', camFocus = new THREE.Vector3(0, 1.1, 0);
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }
function slowmo(s, scale = 0.25) { slowUntil = performance.now() + s * 1000; timeScale = scale; }
function flashScreen(o = 0.8) { const f = $('#flash'); f.style.transition = 'none'; f.style.opacity = o; requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = 0; }); }
function banner(text, ms = 900) {
  const b = $('#banner'); b.innerHTML = text; b.classList.add('on');
  return wait(ms).then(() => b.classList.remove('on'));
}
function pop(text, worldPos, crit) {
  const v = worldPos.clone().project(camera);
  const el = document.createElement('div');
  el.className = 'pop' + (crit ? ' crit' : '');
  el.textContent = text;
  el.style.left = `${(v.x + 1) / 2 * innerWidth}px`;
  el.style.top = `${(1 - v.y) / 2 * innerHeight}px`;
  $('#pops').append(el);
  setTimeout(() => el.remove(), 1000);
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- UI ----------
let A = null, B = null, fighting = false;
function setCard(el, f) {
  const t = f.root.userData.traits;
  el.querySelector('img').src = `data/thumbs/${f.id}.webp`;
  el.querySelector('.name').textContent = `MDG #${f.id}`;
  el.querySelector('.rar').textContent = [rarityOf(f.id).toUpperCase(), t.Legendary, t.Hand, t.Headwear].filter(Boolean).join(' · ');
  setHp(el, f);
}
function setHp(el, f) {
  const k = Math.max(0, f.hp / f.stats.hp);
  el.querySelector('i').style.transform = `scaleX(${k})`;
  el.querySelector('b').style.transform = `scaleX(${k})`;
  el.querySelector('.hp').textContent = `${Math.max(0, Math.round(f.hp))} / ${f.stats.hp} HP · ATK ${f.stats.atk} · SPD ${f.stats.spd}`;
  el.querySelector('i').style.background = k < 0.3 ? 'var(--red)' : 'var(--lime)';
}
function load(side, id) {
  id = Math.max(1, Math.min(3333, id | 0));
  const f = new Fighter(id, side);
  if (side === 0) { A?.dispose(); A = f; $('#idA').value = id; } else { B?.dispose(); B = f; $('#idB').value = id; }
  setCard(side ? $('#cardB') : $('#cardA'), f);
  const st = $('#stage').style;
  st.setProperty(side ? '--bgB' : '--bgA', tokenColor(id));
  if (A && B) paintFloor(tokenColor(A.id), tokenColor(B.id));
  const q = new URLSearchParams(location.search);
  q.set(side ? 'b' : 'a', id);
  history.replaceState(null, '', '?' + q);
  return f;
}
const rnd = () => 1 + ((Math.random() * 3333) | 0);

async function fight() {
  if (fighting) return;
  fighting = true;
  $('#fight').disabled = true;
  // fresh fighters (reset HP and pose)
  load(0, A.id); load(1, B.id);
  camMode = 'fight'; controls.enabled = false;
  A.drop = 0.7; await wait(250); B.drop = 0.7; await wait(700);
  await banner('READY?', 700);
  await banner('FIGHT!', 600);
  let [att, def] = A.stats.spd > B.stats.spd || (A.stats.spd === B.stats.spd && Math.random() < .5) ? [A, B] : [B, A];
  let round = 0;
  while (A.hp > 0 && B.hp > 0 && round++ < 60) {
    const crit = Math.random() < att.stats.crit;
    const dmg = Math.round(att.stats.atk * (0.85 + Math.random() * 0.3) * (crit ? 1.75 : 1));
    camFocus.set(def.home * 0.4, 1.1, 0);
    await new Promise(res => {
      att.play('attack', crit ? 1.0 : 0.75, { target: def, crit, onHit: () => {
        def.hp -= dmg;
        def.flash = 1;
        def.play('hit', 0.45, { crit });
        const at = new THREE.Vector3(def.home + def.dir * 0.2, 1.3, 0.3);
        burst(at, def.colors, crit ? 70 : 28, crit ? 1.4 : 0.9);
        pop(crit ? `CRIT ${dmg}` : `${dmg}`, at.clone().add(new THREE.Vector3(0, 0.9, 0)), crit);
        shake(crit ? 0.35 : 0.12);
        if (crit) { slowmo(0.45); flashScreen(0.7); }
        setHp(def === A ? $('#cardA') : $('#cardB'), def);
        $('#log').textContent = `#${att.id} ${crit ? 'CRITS' : 'hits'} #${def.id} for ${dmg}`;
        setTimeout(res, 380);
      } });
    });
    if (def.hp <= 0) break;
    await wait(180);
    [att, def] = [def, att];
  }
  const winner = A.hp > 0 ? A : B, loser = winner === A ? B : A;
  loser.ko = true; loser.play('ko', 0.9);
  slowmo(0.9, 0.2); flashScreen(1); shake(0.5);
  burst(new THREE.Vector3(loser.home, 1.2, 0), loser.colors, 120, 1.6);
  await wait(900);
  camFocus.set(winner.home, 1.0, 0);
  winner.play('win', 1);
  await banner(`K.O.<br><span style="font-size:.4em">MDG #${winner.id} WINS</span>`, 2400);
  $('#log').textContent = `#${winner.id} wins with ${Math.round(winner.hp)} HP left`;
  camMode = 'orbit'; controls.enabled = true; controls.target.set(0, 1.1, 0);
  fighting = false; $('#fight').disabled = false;
}

$('#fight').onclick = fight;
$('#rndA').onclick = () => !fighting && load(0, rnd());
$('#rndB').onclick = () => !fighting && load(1, rnd());
$('#idA').onchange = e => !fighting && load(0, +e.target.value);
$('#idB').onchange = e => !fighting && load(1, +e.target.value);

// ---------- loop ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 0.8 ? 52 : 35;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
camera.position.set(0, 2.2, camera.aspect < 0.8 ? 10.5 : 8.5);

const clock = new THREE.Clock();
let simT = 0;
const camPos = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  if (performance.now() > slowUntil) timeScale += (1 - timeScale) * 0.15;
  const dt = Math.min(0.05, clock.getDelta()) * timeScale;
  simT += dt;
  A?.update(simT, dt); B?.update(simT, dt);
  updateBits(dt);
  if (camMode === 'fight') {
    const far = camera.aspect < 0.8 ? 11 : 9;
    camPos.set(camFocus.x * 0.6 + Math.sin(simT * 0.4) * 0.8, 2.2, far - (timeScale < 0.9 ? 1.6 : 0));
    camera.position.lerp(camPos, 0.06);
    controls.target.lerp(camFocus, 0.08);
    camera.lookAt(controls.target);
  } else controls.update();
  if (shakeAmt > 0.001) {
    camera.position.x += (Math.random() - .5) * shakeAmt; camera.position.y += (Math.random() - .5) * shakeAmt;
    shakeAmt *= 0.85;
  }
  renderer.render(scene, camera);
}

await loadData();
const q = new URLSearchParams(location.search);
load(0, +q.get('a') || rnd());
load(1, +q.get('b') || rnd());
$('#loading').remove();
frame();
