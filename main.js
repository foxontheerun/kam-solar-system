import { PLANETS, SUN } from './src/data.js';
import { PhysicsEngine } from './src/physics-engine.js';
import {
  createScene, makePlanetMesh, makeSunMesh,
  makeOrbitLine, makeTrail, makeLabel, addSaturnRings,
  makeBarycenterMarker,
} from './src/scene-builder.js';
import { AsteroidBelt } from './src/asteroid-belt.js';
import { UIController } from './src/ui-controller.js';
import { AnimationLoop } from './src/animation-loop.js';

try {
  bootSimulation();
} catch (err) {
  console.error(err);
  document.getElementById('app').innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:32px;text-align:center;color:#c8d3e6;font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.6;">' +
    'This simulation requires WebGL. Try enabling hardware acceleration in your browser settings, or open the page in a recent version of Chrome, Safari, or Firefox.' +
    '</div>';
}

function bootSimulation() {
const { scene, camera, renderer, controls } = createScene(document.getElementById('app'));

const sunGroup = makeSunMesh(SUN);
const sunSphere = sunGroup.userData.sphere;
scene.add(sunGroup);

const physics = new PhysicsEngine();
physics.addSun(SUN, sunGroup);

const planetMeshes = [];
PLANETS.forEach(planet => {
  const mesh = makePlanetMesh(planet);
  scene.add(mesh);
  planetMeshes.push(mesh);
  physics.addPlanet(planet, mesh);

  const orbitLine = makeOrbitLine(planet);
  sunGroup.add(orbitLine);
  physics.attachOrbitLine(orbitLine);

  const trail = makeTrail(planet);
  scene.add(trail.line);
  physics.attachTrail(trail);

  const label = makeLabel(planet.name);
  label.position.set(0, planet.size * 1.8 + 0.4, 0);
  mesh.add(label);
  physics.bodies[physics.bodies.length - 1].labelSprite = label;

  if (planet.name === 'Saturn') addSaturnRings(mesh, planet.size);
});

physics.recenterCOM();
physics.saveInitialState();

const belt = new AsteroidBelt(sunGroup);

const barycenterMarker = makeBarycenterMarker();
scene.add(barycenterMarker);

const ui = new UIController({
  physics, belt, planets: PLANETS, sun: SUN,
  camera, controls,
  sunMesh: sunSphere, planetMeshes, barycenterMarker,
});

if (window.matchMedia('(max-width: 768px)').matches) {
  document.getElementById('hud').classList.add('hud--collapsed');
} else {
  document.getElementById('hudToggle').classList.add('hud-toggle--shown');
}

const loop = new AnimationLoop({ physics, belt, ui, scene, camera, renderer, controls });
loop.start();

document.getElementById('screenshotBtn').addEventListener('click', () => {
  renderer.render(scene, camera);
  const dataURL = renderer.domElement.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataURL;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  link.download = `solar-system-${stamp}.png`;
  link.click();
});

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const pauseToggle = document.getElementById('tPause');
  pauseToggle.checked = true;
  pauseToggle.dispatchEvent(new Event('change'));
}

}
