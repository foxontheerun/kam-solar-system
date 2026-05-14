import * as THREE from 'three';
import { G, SUN_CAPTURE_RADIUS } from './data.js';
import { instantaneousEcc, placePlanetState, buildOrbitVertices } from './orbital-mechanics.js';

/**
 * N-body gravitational simulator with optional uniform drag and Sun capture.
 * Uses Velocity Verlet integration. Bodies are added via {@link PhysicsEngine#addSun}
 * and {@link PhysicsEngine#addPlanet}; the first added body is treated as the Sun.
 */
export class PhysicsEngine {
  constructor() {
    this.bodies = [];
    this.totalTime = 0;
    this.dragCoefficient = 0;
    this.massScale = 1;

    this._cachedAccs = null;
    this._originalMasses = [];
    this._initialState = [];
    this._consumed = [];

    this._accBufferA = [];
    this._accBufferB = [];
    this._tmpD = new THREE.Vector3();
  }

  /**
   * Add the central body. Must be called before any planets.
   * @param {{m: number, name: string}} sunData
   * @param {THREE.Mesh} mesh
   */
  addSun(sunData, mesh) {
    this.bodies.push({
      mass: sunData.m,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      mesh,
      label: sunData.name,
    });
  }

  /**
   * Add a planet. Initial position and velocity are computed at perihelion
   * from the planet's orbital elements.
   * @param {object} planetData — one entry from the PLANETS array
   * @param {THREE.Mesh} mesh
   */
  addPlanet(planetData, mesh) {
    const sunMass = this.bodies[0].mass;
    const { pos, vel } = placePlanetState(planetData, sunMass);
    this.bodies.push({
      mass: planetData.m,
      pos, vel, mesh,
      label: planetData.name,
      planet: planetData,
    });
  }

  /**
   * Attach a precomputed orbit line to the most recently added body. The line
   * is parented to the Sun so the heliocentric/inertial frame switch handles
   * itself automatically.
   * @param {THREE.Line} orbitLine
   */
  attachOrbitLine(orbitLine) {
    this.bodies[this.bodies.length - 1].orbitLine = orbitLine;
  }

  /**
   * Attach a trail buffer to the most recently added body.
   * @param {{line: THREE.Line, positions: Float32Array, colors: Float32Array, count: number, baseColor: THREE.Color}} trail
   */
  attachTrail(trail) {
    this.bodies[this.bodies.length - 1].trail = trail;
  }

  /**
   * Subtract centre-of-mass position and velocity from every body so the
   * system stays at the scene origin.
   */
  recenterCOM() {
    const M = this.bodies.reduce((s, b) => s + b.mass, 0);
    const com = new THREE.Vector3();
    const vcm = new THREE.Vector3();
    for (const b of this.bodies) {
      com.addScaledVector(b.pos, b.mass);
      vcm.addScaledVector(b.vel, b.mass);
    }
    com.divideScalar(M);
    vcm.divideScalar(M);
    for (const b of this.bodies) {
      b.pos.sub(com);
      b.vel.sub(vcm);
    }
  }

  /**
   * Snapshot current positions and velocities so {@link PhysicsEngine#reset}
   * can return to this state. The first call also records the original
   * masses; subsequent calls leave them untouched, so a `reinitializeFromCurrent`
   * that runs while a mass scale is active does not bake the scale into the
   * original-mass record.
   */
  saveInitialState() {
    if (this._originalMasses.length === 0) {
      this._originalMasses = this.bodies.map(b => b.mass);
    }
    this._initialState = this.bodies.map(b => ({
      pos: b.pos.clone(),
      vel: b.vel.clone(),
    }));
  }

  /**
   * Recompute positions and velocities from the current orbital elements
   * (used after slider changes that re-initialise the system), then resnapshot.
   */
  reinitializeFromCurrent() {
    const sunMass = this.bodies[0].mass;
    this.bodies[0].pos.set(0, 0, 0);
    this.bodies[0].vel.set(0, 0, 0);
    for (let i = 1; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (!b.planet) continue;
      const st = placePlanetState(b.planet, sunMass);
      b.pos.copy(st.pos);
      b.vel.copy(st.vel);
      if (b.orbitLine) {
        const arr = b.orbitLine.geometry.attributes.position.array;
        arr.set(buildOrbitVertices(b.planet));
        b.orbitLine.geometry.attributes.position.needsUpdate = true;
      }
    }
    this.recenterCOM();
    this.saveInitialState();
    this.reset();
    this.applyMassScale(this.massScale);
  }

  /** Restore positions and velocities to the last saved snapshot. */
  reset() {
    this.bodies.forEach((b, i) => {
      b.pos.copy(this._initialState[i].pos);
      b.vel.copy(this._initialState[i].vel);
      if (b.consumed) {
        b.consumed = false;
        b.mesh.visible = true;
      }
      if (b.trail) {
        b.trail.count = 0;
        b.trail.line.geometry.setDrawRange(0, 0);
      }
    });
    this._consumed.length = 0;
    this.totalTime = 0;
    this._cachedAccs = null;
  }

  /**
   * Multiply every planetary mass by a single scale factor. Sun mass is
   * unaffected.
   * @param {number} scale
   */
  applyMassScale(scale) {
    this.massScale = scale;
    for (let i = 1; i < this.bodies.length; i++) {
      this.bodies[i].mass = this._originalMasses[i] * scale;
    }
    this._cachedAccs = null;
  }

  /**
   * Set the linear drag coefficient applied to every planet.
   * Drag enters as an extra acceleration −k·v on each body except the Sun.
   * @param {number} k — non-negative
   */
  setDragCoefficient(k) {
    this.dragCoefficient = k;
    this._cachedAccs = null;
  }

  /**
   * Advance the system by one Velocity-Verlet step.
   * Uses two pre-allocated acceleration buffers (ping-pong) so the hot path
   * does no allocations.
   * @param {number} dt
   */
  step(dt) {
    if (!this._cachedAccs) {
      this._cachedAccs = this._computeAccelerations(this._accBufferA);
    }
    const accs = this._cachedAccs;
    for (let i = 0; i < this.bodies.length; i++) {
      this.bodies[i].vel.addScaledVector(accs[i], dt * 0.5);
    }
    for (let i = 0; i < this.bodies.length; i++) {
      this.bodies[i].pos.addScaledVector(this.bodies[i].vel, dt);
    }
    const otherBuffer = accs === this._accBufferA ? this._accBufferB : this._accBufferA;
    const newAccs = this._computeAccelerations(otherBuffer);
    for (let i = 0; i < this.bodies.length; i++) {
      this.bodies[i].vel.addScaledVector(newAccs[i], dt * 0.5);
    }
    this._cachedAccs = newAccs;
    this.totalTime += dt;
  }

  /**
   * Mark planets that have crossed inside the Sun's capture radius as consumed
   * and hide their visual artefacts.
   * @returns {string[]} labels of newly consumed planets, if any
   */
  checkCaptures() {
    const sun = this.bodies[0];
    const newlyConsumed = [];
    for (let i = 1; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (b.consumed) continue;
      if (b.pos.distanceTo(sun.pos) < SUN_CAPTURE_RADIUS) {
        b.consumed = true;
        b.mesh.visible = false;
        if (b.orbitLine) b.orbitLine.visible = false;
        if (b.trail)     b.trail.line.visible = false;
        this._consumed.push(b.label);
        newlyConsumed.push(b.label);
        this._cachedAccs = null;
      }
    }
    return newlyConsumed;
  }

  /** All consumed-planet labels accumulated since the last reset. */
  get consumedLabels() {
    return [...this._consumed];
  }

  /**
   * Instantaneous heliocentric eccentricity of a body.
   * @param {object} body — one of the engine's bodies
   * @returns {number}
   */
  getInstantaneousEccentricity(body) {
    return instantaneousEcc(body, this.bodies[0]);
  }

  _computeAccelerations(buffer) {
    const N = this.bodies.length;
    const accs = buffer;
    const d = this._tmpD;

    while (accs.length < N) accs.push(new THREE.Vector3());
    accs.length = N;
    for (let i = 0; i < N; i++) accs[i].set(0, 0, 0);

    for (let i = 0; i < N; i++) {
      const bi = this.bodies[i];
      if (bi.consumed) continue;
      const pi = bi.pos;
      const ai = accs[i];
      for (let j = i + 1; j < N; j++) {
        const bj = this.bodies[j];
        if (bj.consumed) continue;
        d.subVectors(bj.pos, pi);
        const r2 = d.lengthSq();
        const inv3 = 1 / (r2 * Math.sqrt(r2));
        const sij = G * bj.mass * inv3;
        const sji = G * bi.mass * inv3;
        ai.x += d.x * sij;
        ai.y += d.y * sij;
        ai.z += d.z * sij;
        const aj = accs[j];
        aj.x -= d.x * sji;
        aj.y -= d.y * sji;
        aj.z -= d.z * sji;
      }
      if (this.dragCoefficient > 0 && i > 0) {
        const k = -this.dragCoefficient;
        ai.x += bi.vel.x * k;
        ai.y += bi.vel.y * k;
        ai.z += bi.vel.z * k;
      }
    }
    return accs;
  }
}
