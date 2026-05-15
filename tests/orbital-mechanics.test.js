import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  orbitalToInertial,
  placePlanetState,
  buildOrbitVertices,
  instantaneousEcc,
} from '../src/orbital-mechanics.js';

describe('orbitalToInertial', () => {
  it('places a body at +x for θ = 0, Ω = 0, i = 0', () => {
    const { x, y, z } = orbitalToInertial(1, 0, 0, 0);
    expect(x).toBeCloseTo(1, 10);
    expect(y).toBeCloseTo(0, 10);
    expect(z).toBeCloseTo(0, 10);
  });

  it('places a body at +z for θ = π/2, Ω = 0, i = 0', () => {
    const { x, y, z } = orbitalToInertial(1, Math.PI / 2, 0, 0);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(0, 10);
    expect(z).toBeCloseTo(1, 10);
  });

  it('lifts the body out of the ecliptic for non-zero inclination', () => {
    const { y } = orbitalToInertial(1, Math.PI / 2, 0, Math.PI / 4);
    expect(y).toBeCloseTo(Math.sin(Math.PI / 4), 10);
  });

  it('preserves radius magnitude under rotation', () => {
    const r = 3.7;
    const { x, y, z } = orbitalToInertial(r, 0.3, 1.1, 0.5);
    expect(Math.hypot(x, y, z)).toBeCloseTo(r, 10);
  });
});

describe('placePlanetState', () => {
  it('places Earth at perihelion with r = a(1-e)', () => {
    const earth = { a: 1.0, e: 0.017, i: 0, Om: 0, om: 0 };
    const { pos } = placePlanetState(earth, 1.0);
    expect(pos.length()).toBeCloseTo(1.0 * (1 - 0.017), 8);
  });

  it('produces vis-viva speed at perihelion', () => {
    const earth = { a: 1.0, e: 0.017, i: 0, Om: 0, om: 0 };
    const { vel } = placePlanetState(earth, 1.0);
    // v_peri = sqrt(GM * (1+e) / (a(1-e)))
    const expected = Math.sqrt(1 * (1 + 0.017) / (1 * (1 - 0.017)));
    expect(vel.length()).toBeCloseTo(expected, 10);
  });

  it('puts velocity perpendicular to position at perihelion', () => {
    const planet = { a: 1.5, e: 0.3, i: 0.1, Om: 0.4, om: 0.2 };
    const { pos, vel } = placePlanetState(planet, 1.0);
    // r · v = 0 (perpendicular)
    expect(pos.dot(vel)).toBeCloseTo(0, 8);
  });

  it('returns proper THREE.Vector3 instances', () => {
    const planet = { a: 1, e: 0, i: 0, Om: 0, om: 0 };
    const { pos, vel } = placePlanetState(planet, 1.0);
    expect(pos).toBeInstanceOf(THREE.Vector3);
    expect(vel).toBeInstanceOf(THREE.Vector3);
  });
});

describe('buildOrbitVertices', () => {
  it('traces a perfect circle for e = 0', () => {
    const earth = { a: 1.0, e: 0, i: 0, Om: 0, om: 0 };
    const verts = buildOrbitVertices(earth, 128);
    for (let k = 0; k < 128; k++) {
      const r = Math.hypot(verts[k * 3], verts[k * 3 + 1], verts[k * 3 + 2]);
      expect(r).toBeCloseTo(1.0, 6);
    }
  });

  it('produces correct perihelion and aphelion for an ellipse', () => {
    const planet = { a: 1.0, e: 0.5, i: 0, Om: 0, om: 0 };
    const verts = buildOrbitVertices(planet, 512);
    let minR = Infinity;
    let maxR = -Infinity;
    for (let k = 0; k < 512; k++) {
      const r = Math.hypot(verts[k * 3], verts[k * 3 + 1], verts[k * 3 + 2]);
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
    expect(minR).toBeCloseTo(0.5, 2); // a(1-e)
    expect(maxR).toBeCloseTo(1.5, 2); // a(1+e)
  });

  it('returns a Float32Array of length 3·segments', () => {
    const planet = { a: 1, e: 0, i: 0, Om: 0, om: 0 };
    const verts = buildOrbitVertices(planet, 256);
    expect(verts).toBeInstanceOf(Float32Array);
    expect(verts.length).toBe(256 * 3);
  });
});

describe('instantaneousEcc', () => {
  const sun = {
    pos: new THREE.Vector3(0, 0, 0),
    vel: new THREE.Vector3(0, 0, 0),
    mass: 1,
  };

  it('returns 0 for a circular orbit', () => {
    const r = 1.0;
    const v = Math.sqrt(1 / r); // circular velocity v² = GM/r
    const body = {
      pos: new THREE.Vector3(r, 0, 0),
      vel: new THREE.Vector3(0, 0, v),
      mass: 3e-6,
    };
    expect(instantaneousEcc(body, sun)).toBeCloseTo(0, 6);
  });

  it('returns e = 0.5 at perihelion of a known ellipse', () => {
    // For a=1, e=0.5: at perihelion r = a(1-e) = 0.5,
    // v_peri = sqrt(GM(1+e)/(a(1-e))) = sqrt(1.5/0.5) = sqrt(3)
    const r = 0.5;
    const v = Math.sqrt(3);
    const body = {
      pos: new THREE.Vector3(r, 0, 0),
      vel: new THREE.Vector3(0, 0, v),
      mass: 3e-6,
    };
    expect(instantaneousEcc(body, sun)).toBeCloseTo(0.5, 4);
  });

  it('clamps hyperbolic trajectories at 2', () => {
    // Velocity well above escape (v_esc = sqrt(2/r) at r=1 is ~1.414)
    const body = {
      pos: new THREE.Vector3(1, 0, 0),
      vel: new THREE.Vector3(0, 0, 10),
      mass: 3e-6,
    };
    expect(instantaneousEcc(body, sun)).toBe(2);
  });
});
