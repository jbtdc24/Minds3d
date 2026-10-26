// Themed arenas: a floating voxel island stage plus sky, fog, lighting, scenery and ambient particles.
import * as THREE from 'three';
import { scene, hemi, sun, rim, spawn } from './render.js';
import { toonRamp, VOX } from './nft.js';

export const THEMES = {
  meadow: {
    name: 'Sunny Isles', sky: ['#5fb4ff', '#dff3ff'], fog: ['#cfe8ff', 22, 80],
    tiles: ['#86cf6e', '#77c060'], edge: '#fff2a8', dirt: ['#7a5434', '#5e3f27'],
    light: { hemi: ['#eef7ff', '#5a7a3a', 1.35], sun: ['#fff1d6', 2.5], rim: ['#cfe2ff', 1.2] },
    motes: { colors: ['#ffffff', '#fff3a0'], rate: 4, fall: false },
  },
  neon: {
    name: 'Neon Night', sky: ['#07051a', '#3a1660'], fog: ['#1c0f3c', 16, 60],
    tiles: ['#211d42', '#2a2552'], edge: '#ff3bd4', dirt: ['#2a2440', '#1b1730'], grid: '#29f0ff',
    light: { hemi: ['#e6e0ff', '#2a2050', 1.25], sun: ['#ffffff', 1.9], rim: ['#ff5ad8', 2.0] },
    motes: { colors: ['#29f0ff', '#ff3bd4'], rate: 6, fall: false },
  },
  frost: {
    name: 'Frost Peaks', sky: ['#7fbfff', '#f4fbff'], fog: ['#e4f3ff', 18, 70],
    tiles: ['#eaf6ff', '#d3ebfb'], edge: '#a8ecff', dirt: ['#8fb4cc', '#6f93ab'],
    light: { hemi: ['#f2f9ff', '#7da0c0', 1.4], sun: ['#ffffff', 2.2], rim: ['#a8d8ff', 1.4] },
    motes: { colors: ['#ffffff', '#e2f4ff'], rate: 14, fall: true },
  },
};

const toon = () => new THREE.MeshToonMaterial({ gradientMap: toonRamp });
const glowMat = new THREE.MeshBasicMaterial({ toneMapped: false });
// Build an InstancedMesh of cubes from [{p:[x,y,z], s:[sx,sy,sz] | number, c:'#hex', rot}]
function cubes(list, material = toon(), shadows = true) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  list.forEach((b, i) => {
    const s = Array.isArray(b.s) ? b.s : [b.s, b.s, b.s];
    q.setFromEuler(new THREE.Euler(0, b.rot || 0, b.tilt || 0));
    m.compose(new THREE.Vector3(...b.p), q, new THREE.Vector3(...s));
    mesh.setMatrixAt(i, m);
    c.set(b.c);
    if (material === glowMat) c.multiplyScalar(b.boost || 2.6);
    mesh.setColorAt(i, c);
  });
  mesh.castShadow = shadows; mesh.receiveShadow = true;
  return mesh;
}
const R = (a, b) => a + Math.random() * (b - a);
const T = 0.3;                  // stage tile size

function island(th, rx, rz, cx = 0, cz = 0, y0 = 0, deco = true) {
  const top = [], body = [];
  for (let x = -rx; x <= rx; x++) for (let z = -rz; z <= rz; z++) {
    const d = Math.hypot(x / rx, z / rz);
    if (d > 1) continue;
    const X = cx + x * T, Z = cz + z * T;
    const edge = d > 1 - 1.4 / Math.min(rx, rz);
    top.push({ p: [X, y0 - T / 2 - ((x + z) & 1) * 0.01, Z], s: T, c: edge && deco ? th.edge : th.tiles[(x + z) & 1] });
    const depth = 1 + Math.floor((1 - d) * Math.min(rx, rz) * 0.9 + ((x * 7 + z * 13) & 3));
    for (let k = 1; k <= depth; k++) body.push({ p: [X, y0 - T / 2 - k * T, Z], s: T, c: k < 2 ? th.dirt[0] : th.dirt[1] });
  }
  return [top, body];
}
function tree(x, z, y, snowy) {
  const out = [], h = 3 + ((Math.random() * 3) | 0), s = 0.22;
  for (let i = 0; i < h; i++) out.push({ p: [x, y + i * s + s / 2, z], s, c: '#7a5434' });
  const leaves = snowy ? ['#2f6b4f', '#3d7f5c'] : ['#4fae4a', '#63c25a', '#3f9a3f'];
  for (let l = 0; l < 3; l++) {
    const r = 3 - l;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      if (Math.abs(a) + Math.abs(b) > r + 0.5 || Math.random() < 0.12) continue;
      const top = snowy && (l === 2 || Math.random() < 0.3);
      out.push({ p: [x + a * s, y + (h + l) * s + s / 2, z + b * s], s, c: top ? '#ffffff' : leaves[(a + b + l) & 1 ? 0 : leaves.length - 1] });
    }
  }
  return out;
}

let current = null;
export function buildEnv(name) {
  if (current) { scene.remove(current.group); current.group.traverse(o => { o.geometry?.dispose(); }); }
  const th = THEMES[name] || THEMES.meadow, g = new THREE.Group();
  // sky dome
  const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(th.sky[0]) }, bot: { value: new THREE.Color(th.sky[1]) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = smoothstep(-0.25, 0.6, vP.y); gl_FragColor = vec4(mix(bot, top, h), 1.); }',
  }));
  g.add(sky);
  scene.fog = new THREE.Fog(th.fog[0], th.fog[1], th.fog[2]);
  hemi.color.set(th.light.hemi[0]); hemi.groundColor.set(th.light.hemi[1]); hemi.intensity = th.light.hemi[2];
  sun.color.set(th.light.sun[0]); sun.intensity = th.light.sun[1];
  rim.color.set(th.light.rim[0]); rim.intensity = th.light.rim[1];

  // main stage (wide ellipse for 3v3) + satellite islands
  const [top, body] = island(th, 20, 11);
  const extra = [], glows = [];
  for (const [cx, cz, rx, rz, y] of [[-9, -9, 5, 4, -1.6], [10, -11, 6, 4, -0.8], [-14, -3, 3, 3, 1.4], [15, -2, 4, 3, -2.4], [2, -18, 7, 5, 0.6]]) {
    const [t2, b2] = island(th, rx, rz, cx, cz, y, false);
    extra.push(...t2, ...b2);
  }
  g.add(cubes(top), cubes([...body, ...extra], toon(), false));

  const decor = [];
  const animated = [];
  if (name === 'meadow' || name === 'frost') {
    const snowy = name === 'frost';
    for (const [x, z, y] of [[-6.2, -2, 0], [6.4, -1.6, 0], [-4.8, -3.0, 0], [5.0, -3.1, 0], [-9, -9, -1.6], [9.5, -11, -0.8], [11, -12, -0.8], [-14, -3, 1.4], [2, -18, 0.6], [4, -19, 0.6]])
      decor.push(...tree(x, z, y, snowy));
    for (let i = 0; i < 26; i++) {           // flowers / rocks along the stage rim
      const a = Math.random() * Math.PI * 2, x = Math.cos(a) * 5.4, z = Math.sin(a) * 2.9;
      if (z > 0.5 && Math.abs(x) < 4.5) continue;
      decor.push(snowy ? { p: [x, 0.08, z], s: [0.18, 0.16, 0.18], c: '#ffffff' } : { p: [x, 0.08, z], s: 0.12, c: ['#ff8fb0', '#fff2a8', '#ffffff', '#c9a6ff'][i % 4] });
    }
    // clouds
    const cloud = [];
    for (let c = 0; c < 9; c++) {
      const cx = R(-30, 30), cy = R(6, 14), cz = R(-40, -12);
      for (let i = 0; i < 9; i++) cloud.push({ p: [cx + R(-2.5, 2.5), cy + R(-0.4, 0.6), cz + R(-1, 1)], s: [R(1.2, 2.4), R(0.8, 1.2), R(1, 2)], c: '#ffffff' });
    }
    const cm = cubes(cloud, toon(), false);
    g.add(cm); animated.push(t => { cm.position.x = Math.sin(t * 0.03) * 6; });
    if (snowy) {                              // glowing ice crystals
      for (const [x, z, h] of [[-5.6, -2.4, 1.2], [5.8, -2.0, 1.5], [-3.2, -3.2, 0.8], [3.4, -3.3, 1.0], [-9.4, -8.6, 1.8], [10.6, -10.4, 1.4]])
        glows.push({ p: [x, h / 2 - 0.05, z], s: [0.25, h, 0.25], c: '#a8ecff', boost: 1.6, tilt: R(-0.3, 0.3) });
    }
  } else if (name === 'neon') {
    // grid lines on the stage + skyline with lit windows
    for (let x = -20; x <= 20; x += 4) glows.push({ p: [x * T, 0.005, 0], s: [0.03, 0.02, 6.4], c: th.grid, boost: 1.4 });
    for (let z = -10; z <= 10; z += 4) glows.push({ p: [0, 0.005, z * T], s: [11.8, 0.02, 0.03], c: th.grid, boost: 1.4 });
    for (let i = 0; i < 46; i++) {
      const a = R(Math.PI * 1.05, Math.PI * 1.95), r = R(18, 34), x = Math.cos(a) * r, z = Math.sin(a) * r, h = R(4, 18), w = R(1.5, 3.5);
      decor.push({ p: [x, h / 2 - 6, z], s: [w, h, w], c: i % 3 ? '#181430' : '#221a40', rot: R(0, 1) });
      for (let k = 0; k < 6; k++) glows.push({ p: [x + R(-w / 2, w / 2) * 0.8, R(-5, h - 6), z + w / 2 + 0.02], s: [0.25, 0.18, 0.05], c: Math.random() < 0.5 ? '#29f0ff' : '#ff3bd4', boost: 1.8 });
    }
    const holo = cubes(Array.from({ length: 10 }, () => ({ p: [R(-14, 14), R(3, 8), R(-20, -10)], s: R(0.2, 0.45), c: Math.random() < 0.5 ? '#29f0ff' : '#ff3bd4', boost: 1.2, rot: R(0, 3) })), glowMat, false);
    g.add(holo); animated.push(t => { holo.rotation.y = Math.sin(t * 0.2) * 0.1; holo.position.y = Math.sin(t * 0.7) * 0.3; });
  }
  if (decor.length) g.add(cubes(decor));
  if (glows.length) g.add(cubes(glows, glowMat, false));
  scene.add(g);
  let acc = 0;
  current = {
    group: g, theme: th, name,
    update(dt, t) {
      for (const a of animated) a(t);
      acc += dt * th.motes.rate;
      while (acc > 1) {
        acc--;
        const fall = th.motes.fall;
        spawn({ pos: new THREE.Vector3(R(-8, 8), fall ? R(5, 8) : R(-0.5, 1), R(-5, 3)),
          vel: new THREE.Vector3(R(-0.2, 0.2), fall ? R(-0.9, -0.5) : R(0.3, 0.7), 0), color: th.motes.colors[(Math.random() * th.motes.colors.length) | 0],
          life: R(4, 8), size: VOX * R(1.5, 3), gravity: 0, glow: !fall, bounce: false });
      }
    },
  };
  return current;
}
export const envUpdate = (dt, t) => current?.update(dt, t);
