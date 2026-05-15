import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TRAIL_LENGTH, CAMERA_LIMITS } from "./data.js";
import { buildOrbitVertices } from "./orbital-mechanics.js";

/**
 * Build the three.js scene, camera, renderer, and orbit controls.
 * Also adds background stars and ambient light.
 *
 * @param {HTMLElement} container — DOM element that will host the canvas
 * @returns {{scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, controls: OrbitControls}}
 */
export function createScene(container) {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    50,
    innerWidth / innerHeight,
    0.05,
    2000,
  );
  camera.position.set(35, 25, 55);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = CAMERA_LIMITS.minDistance;
  controls.maxDistance = CAMERA_LIMITS.maxDistance;

  addBackgroundStars(scene, isMobile ? 2000 : 4000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));

  return { scene, camera, renderer, controls };
}

function addBackgroundStars(scene, count = 4000) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 200 + Math.random() * 200;
    const t = Math.acos(2 * Math.random() - 1);
    const p = 2 * Math.PI * Math.random();
    positions[i * 3] = r * Math.sin(t) * Math.cos(p);
    positions[i * 3 + 1] = r * Math.sin(t) * Math.sin(p);
    positions[i * 3 + 2] = r * Math.cos(t);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.18,
    sizeAttenuation: true,
    opacity: 0.65,
    transparent: true,
  });
  scene.add(new THREE.Points(geom, mat));
}

/**
 * Build the Sun's scene group. The returned Group is the positional anchor —
 * it follows the Sun's wobble in the inertial frame and is the parent of
 * orbit lines, the asteroid belt, and the point light, none of which should
 * scale with the Sun's visual size. The actual sphere (with its glow billboard
 * as a child) is exposed via `group.userData.sphere` so the visual-scale
 * slider can resize it independently.
 *
 * @param {{size: number, color: number, m: number}} sunData
 * @returns {THREE.Group} container; the visual sphere is at `userData.sphere`
 */
export function makeSunMesh(sunData) {
  const container = new THREE.Group();

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(sunData.size, 48, 32),
    new THREE.MeshBasicMaterial({ color: sunData.color }),
  );
  sphere.add(makeSunGlow());
  container.add(sphere);

  container.add(new THREE.PointLight(0xfde08a, 5, 200, 1.2));

  container.userData.sphere = sphere;
  return container;
}

function makeSunGlow() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const ctx = cv.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255, 207, 63, 0.85)");
  grad.addColorStop(0.3, "rgba(253, 200, 100, 0.35)");
  grad.addColorStop(1, "rgba(253, 200, 100, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sprite.scale.set(0.7, 0.7, 1);
  return sprite;
}

/**
 * Create a planet's mesh.
 * @param {{size: number, color: number}} planet
 * @returns {THREE.Mesh}
 */
export function makePlanetMesh(planet) {
  const geom = new THREE.SphereGeometry(planet.size, 36, 24);
  const mat = new THREE.MeshStandardMaterial({
    color: planet.color,
    roughness: 0.7,
    metalness: 0.05,
    emissive: planet.color,
    emissiveIntensity: 0.1,
  });
  return new THREE.Mesh(geom, mat);
}

/**
 * Build the line representing a planet's theoretical Kepler ellipse.
 * @param {object} planet
 * @returns {THREE.Line}
 */
export function makeOrbitLine(planet) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.BufferAttribute(buildOrbitVertices(planet), 3),
  );
  const mat = new THREE.LineBasicMaterial({
    color: planet.color,
    transparent: true,
    opacity: 0.28,
  });
  return new THREE.Line(geom, mat);
}

/**
 * Build a per-planet trail buffer (line of fading vertices recording recent
 * positions). Returned object can be attached to the body for the integrator
 * to write into.
 * @param {object} planet
 * @returns {{line: THREE.Line, positions: Float32Array, colors: Float32Array, count: number, baseColor: THREE.Color}}
 */
export function makeTrail(planet) {
  const positions = new Float32Array(TRAIL_LENGTH * 3);
  const colors = new Float32Array(TRAIL_LENGTH * 3);
  const baseColor = new THREE.Color(planet.color);

  // The fade gradient is fixed: oldest sample (index 0) is darkest, newest
  // (index TRAIL_LENGTH-1) is brightest. Pre-compute once instead of every
  // sample — turns an O(N) inner loop on every trail write into a no-op.
  for (let k = 0; k < TRAIL_LENGTH; k++) {
    const fade = 0.05 + 0.95 * (k / (TRAIL_LENGTH - 1));
    colors[k * 3] = baseColor.r * fade;
    colors[k * 3 + 1] = baseColor.g * fade;
    colors[k * 3 + 2] = baseColor.b * fade;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geom.setDrawRange(0, 0);
  const colorAttr = geom.attributes.color;
  colorAttr.needsUpdate = true;

  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
  });
  const line = new THREE.Line(geom, mat);
  line.visible = false;
  return { line, positions, colors, count: 0, baseColor };
}

/**
 * Build a billboard label sprite with the given text.
 * @param {string} text
 * @returns {THREE.Sprite}
 */
export function makeLabel(text) {
  const cv = document.createElement("canvas");
  const w = 256,
    h = 64;
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.font = "22px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = 4;
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.scale.set(2.0, 0.5, 1);
  return sprite;
}

/**
 * Build a marker sprite indicating the system's centre of mass (barycenter).
 * Used in the inertial frame to show the point around which the Sun wobbles —
 * which in reality lies outside the Sun's surface for the Sun-Jupiter system,
 * even though our visually inflated Sun appears to contain it.
 *
 * @returns {THREE.Sprite} a small crosshair sprite, initially hidden
 */
export function makeBarycenterMarker() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const ctx = cv.getContext("2d");
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(32, 6);
  ctx.lineTo(32, 58);
  ctx.moveTo(6, 32);
  ctx.lineTo(58, 32);
  ctx.stroke();
  ctx.strokeStyle = "rgba(167, 139, 250, 0.95)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(32, 32, 7, 0, 2 * Math.PI);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(cv);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      sizeAttenuation: false,
    }),
  );
  sprite.scale.set(0.04, 0.04, 1);
  sprite.visible = false;
  return sprite;
}

/**
 * Add a ring system to Saturn. Rings are oriented to match the planet's axial
 * tilt of 26.7°; the geometry's default normal is +Z, so we rotate by −π/2
 * around X to make it horizontal and then add the tilt.
 *
 * @param {THREE.Mesh} saturnMesh
 * @param {number} planetSize
 */
export function addSaturnRings(saturnMesh, planetSize) {
  const geom = new THREE.RingGeometry(planetSize * 1.4, planetSize * 2.3, 64);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xc7b88c,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geom, mat);
  ring.rotation.x = -Math.PI / 2 + (26.7 * Math.PI) / 180;
  saturnMesh.add(ring);
}
