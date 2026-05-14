import * as THREE from 'three';
import { D2R, G } from './data.js';

/**
 * Convert orbital-frame coordinates to inertial 3D vector.
 * The ecliptic is the XZ plane; Y is the perpendicular axis.
 *
 * @param {number} r — radial distance from focus
 * @param {number} theta — true anomaly plus argument of perihelion (radians)
 * @param {number} Om — longitude of ascending node (radians)
 * @param {number} inc — inclination to ecliptic (radians)
 * @returns {{x: number, y: number, z: number}}
 */
export function orbitalToInertial(r, theta, Om, inc) {
  const cosTh = Math.cos(theta), sinTh = Math.sin(theta);
  const cosOm = Math.cos(Om),    sinOm = Math.sin(Om);
  const cosI  = Math.cos(inc),   sinI  = Math.sin(inc);
  return {
    x: r * (cosTh * cosOm - sinTh * cosI * sinOm),
    y: r *  sinTh * sinI,
    z: r * (cosTh * sinOm + sinTh * cosI * cosOm),
  };
}

/**
 * Compute initial position and velocity of a planet at perihelion.
 *
 * @param {object} planet — one entry from the PLANETS array
 * @param {number} sunMass — mass of the central body
 * @returns {{pos: THREE.Vector3, vel: THREE.Vector3}}
 */
export function placePlanetState(planet, sunMass) {
  const inc = (planet.i  ?? 0) * D2R;
  const Om  = (planet.Om ?? 0) * D2R;
  const om  = (planet.om ?? 0) * D2R;
  const e = planet.e;
  const a = planet.a;
  const r = a * (1 - e);
  const v = Math.sqrt(G * sunMass * (1 + e) / r);
  const P = orbitalToInertial(r, om, Om, inc);
  const V = orbitalToInertial(v, om + Math.PI / 2, Om, inc);
  return {
    pos: new THREE.Vector3(P.x, P.y, P.z),
    vel: new THREE.Vector3(V.x, V.y, V.z),
  };
}

/**
 * Sample N points along a planet's theoretical Kepler ellipse.
 *
 * @param {object} planet — one entry from the PLANETS array
 * @param {number} [segments=256]
 * @returns {Float32Array} — flat XYZ array of length segments * 3
 */
export function buildOrbitVertices(planet, segments = 256) {
  const inc = (planet.i  ?? 0) * D2R;
  const Om  = (planet.Om ?? 0) * D2R;
  const om  = (planet.om ?? 0) * D2R;
  const e = planet.e;
  const a = planet.a;
  const arr = new Float32Array(segments * 3);
  for (let k = 0; k < segments; k++) {
    const nu = (k / (segments - 1)) * 2 * Math.PI;
    const r = a * (1 - e * e) / (1 + e * Math.cos(nu));
    const P = orbitalToInertial(r, om + nu, Om, inc);
    arr[k * 3]     = P.x;
    arr[k * 3 + 1] = P.y;
    arr[k * 3 + 2] = P.z;
  }
  return arr;
}

/**
 * Instantaneous orbital eccentricity of a body in the heliocentric frame.
 * Uses the Laplace–Runge–Lenz vector. Capped at 2 to keep ejected planets
 * from overflowing the display.
 *
 * @param {{pos: THREE.Vector3, vel: THREE.Vector3, mass: number}} body
 * @param {{pos: THREE.Vector3, vel: THREE.Vector3, mass: number}} sun
 * @returns {number} eccentricity in [0, 2]
 */
export function instantaneousEcc(body, sun) {
  const r = body.pos.clone().sub(sun.pos);
  const v = body.vel.clone().sub(sun.vel);
  const mu = G * (sun.mass + body.mass);
  const h = new THREE.Vector3().crossVectors(r, v);
  const eVec = v.clone().cross(h).divideScalar(mu).sub(r.clone().normalize());
  return Math.min(2, eVec.length());
}
