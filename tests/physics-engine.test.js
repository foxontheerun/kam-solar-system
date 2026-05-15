import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics-engine.js';
import { PLANETS, SUN } from '../src/data.js';

/** Total energy of an N-body system: kinetic + pairwise gravitational. */
function totalEnergy(engine) {
  let E = 0;
  for (const b of engine.bodies) {
    E += 0.5 * b.mass * b.vel.lengthSq();
  }
  for (let i = 0; i < engine.bodies.length; i++) {
    for (let j = i + 1; j < engine.bodies.length; j++) {
      const r = engine.bodies[i].pos.distanceTo(engine.bodies[j].pos);
      E -= (engine.bodies[i].mass * engine.bodies[j].mass) / r;
    }
  }
  return E;
}

/** Centre-of-mass position (mass-weighted average). */
function centerOfMass(engine) {
  const com = new THREE.Vector3();
  let M = 0;
  for (const b of engine.bodies) {
    com.addScaledVector(b.pos, b.mass);
    M += b.mass;
  }
  return com.divideScalar(M);
}

describe('PhysicsEngine — symplectic conservation', () => {
  it('conserves energy of Sun + Earth to < 1e-6 over 1000 steps', () => {
    const engine = new PhysicsEngine();
    engine.addSun(SUN, null);
    const earth = PLANETS.find(p => p.name === 'Earth');
    engine.addPlanet(earth, null);
    engine.recenterCOM();
    engine.saveInitialState();

    const E0 = totalEnergy(engine);
    for (let i = 0; i < 1000; i++) engine.step(0.005);
    const E1 = totalEnergy(engine);

    const relError = Math.abs((E1 - E0) / E0);
    expect(relError).toBeLessThan(1e-6);
  });

  it('keeps centre of mass at origin to machine precision (no drift)', () => {
    const engine = new PhysicsEngine();
    engine.addSun(SUN, null);
    engine.addPlanet(PLANETS[2], null); // Earth
    engine.addPlanet(PLANETS[4], null); // Jupiter
    engine.recenterCOM();
    engine.saveInitialState();

    for (let i = 0; i < 500; i++) engine.step(0.01);

    const com = centerOfMass(engine);
    expect(com.length()).toBeLessThan(1e-12);
  });

  it('conserves total angular momentum to < 1e-8 over 1000 steps', () => {
    const engine = new PhysicsEngine();
    engine.addSun(SUN, null);
    engine.addPlanet(PLANETS[2], null); // Earth
    engine.addPlanet(PLANETS[4], null); // Jupiter
    engine.recenterCOM();
    engine.saveInitialState();

    const totalL = () => {
      const L = new THREE.Vector3();
      for (const b of engine.bodies) {
        L.add(new THREE.Vector3().crossVectors(b.pos, b.vel).multiplyScalar(b.mass));
      }
      return L;
    };

    const L0 = totalL();
    for (let i = 0; i < 1000; i++) engine.step(0.005);
    const L1 = totalL();

    const relError = L1.clone().sub(L0).length() / L0.length();
    expect(relError).toBeLessThan(1e-8);
  });

  it('Earth completes one orbit in ~2π code-time units', () => {
    const engine = new PhysicsEngine();
    engine.addSun(SUN, null);
    const earth = PLANETS.find(p => p.name === 'Earth');
    engine.addPlanet(earth, null);
    engine.recenterCOM();
    engine.saveInitialState();

    const earthBody = engine.bodies[1];
    const initialAngle = Math.atan2(earthBody.pos.z, earthBody.pos.x);

    // Step for slightly more than one expected period
    const expectedPeriod = 2 * Math.PI; // T = 2π · a^(3/2), a=1 → T = 2π
    const steps = Math.ceil((expectedPeriod * 1.1) / 0.005);

    let prevAngle = initialAngle;
    let unwrappedAngle = initialAngle;
    let crossings = 0;
    let returnTime = null;

    for (let i = 0; i < steps; i++) {
      engine.step(0.005);
      const angle = Math.atan2(earthBody.pos.z, earthBody.pos.x);
      // Unwrap 2π discontinuities
      let delta = angle - prevAngle;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      unwrappedAngle += delta;
      prevAngle = angle;

      // Detect full revolution
      if (returnTime === null && Math.abs(unwrappedAngle - initialAngle) >= 2 * Math.PI) {
        returnTime = engine.totalTime;
      }
    }

    expect(returnTime).not.toBeNull();
    // Earth has tiny eccentricity so period deviates ~< 0.1% from 2π
    expect(returnTime).toBeCloseTo(2 * Math.PI, 1);
  });
});

describe('PhysicsEngine — capture and reset', () => {
  it('correctly identifies planet capture by the Sun', () => {
    const engine = new PhysicsEngine();
    engine.addSun(SUN, { visible: true });
    // Mock a body at 0.1 AU (inside SUN_CAPTURE_RADIUS = 0.18)
    engine.bodies.push({
      mass: 3e-6,
      pos: new THREE.Vector3(0.1, 0, 0),
      vel: new THREE.Vector3(),
      mesh: { visible: true },
      label: 'TestBody',
    });

    const consumed = engine.checkCaptures();
    expect(consumed).toEqual(['TestBody']);
    expect(engine.bodies[1].consumed).toBe(true);
  });

  it('does not capture a planet at safe distance', () => {
    const engine = new PhysicsEngine();
    engine.addSun(SUN, { visible: true });
    engine.bodies.push({
      mass: 3e-6,
      pos: new THREE.Vector3(0.3, 0, 0), // beyond 0.18 capture radius
      vel: new THREE.Vector3(),
      mesh: { visible: true },
      label: 'TestBody',
    });
    expect(engine.checkCaptures()).toEqual([]);
  });
});
