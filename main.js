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
  physics, belt, planets: PLANETS,
  camera, controls,
  sunMesh: sunSphere, planetMeshes, barycenterMarker,
});

renderLegend([SUN, ...PLANETS]);

const loop = new AnimationLoop({ physics, belt, ui, scene, camera, renderer, controls });
loop.start();

function renderLegend(bodies) {
  const el = document.getElementById('legend');
  el.innerHTML = bodies.map(b => {
    const period = b.T !== undefined
      ? `${b.T.toFixed(b.T < 10 ? 2 : 1)} years`
      : '—';
    const swatch = `#${b.color.toString(16).padStart(6, '0')}`;
    return `<div class="row">
      <span class="dot" style="background:${swatch}"></span>
      <span class="name">${b.name}</span>
      <span class="meta">${period}</span>
    </div>`;
  }).join('');
}
