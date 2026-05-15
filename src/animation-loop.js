import { TRAIL_LENGTH } from './data.js';

const SIM_DT = 0.005;
const TRAIL_SAMPLE_BASE = 4;
// Cap on physics steps per animation frame. With nine bodies this is cheap;
// 30000 lets the speed slider stay honest up to ~1000 years/s on 60 fps.
const MAX_STEPS_PER_FRAME = 30000;
// Push HUD updates at ~10 Hz instead of every frame — six textContent writes
// and a display toggle per frame is wasted work; the eye can't tell.
const HUD_PUSH_EVERY_FRAMES = 6;

/**
 * Drives the simulation. Reads `speed` and `paused` from the UI, advances the
 * physics engine the right number of steps per frame, samples trails, updates
 * the asteroid belt and the HUD, and renders the scene.
 */
export class AnimationLoop {
  /**
   * @param {object} deps
   * @param {import('./physics-engine.js').PhysicsEngine} deps.physics
   * @param {import('./asteroid-belt.js').AsteroidBelt} deps.belt
   * @param {import('./ui-controller.js').UIController} deps.ui
   * @param {THREE.Scene} deps.scene
   * @param {THREE.PerspectiveCamera} deps.camera
   * @param {THREE.WebGLRenderer} deps.renderer
   * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} deps.controls
   */
  constructor({ physics, belt, ui, scene, camera, renderer, controls }) {
    this.physics = physics;
    this.belt = belt;
    this.ui = ui;
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;

    this._stepCounter = 0;
    this._hudCounter = 0;
    this._lastWallTime = performance.now();
    this._frame = this._frame.bind(this);

    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
  }

  start() {
    requestAnimationFrame(this._frame);
  }

  _frame() {
    const now = performance.now();
    const wallDt = Math.min(0.05, (now - this._lastWallTime) / 1000);
    this._lastWallTime = now;

    if (!this.ui.paused) {
      this._advancePhysics(wallDt);
      const newlyConsumed = this.physics.checkCaptures();
      if (newlyConsumed.length > 0) this.ui.autoHideBelt();
      this._syncMeshPositions();
      this.belt.update(this.physics.totalTime);
      this._updateMaxEcc();
      if (++this._hudCounter >= HUD_PUSH_EVERY_FRAMES) {
        this._hudCounter = 0;
        this._pushHUD();
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._frame);
  }

  _advancePhysics(wallDt) {
    const targetSimTime = this.ui.speed * wallDt * (2 * Math.PI);
    const steps = Math.min(MAX_STEPS_PER_FRAME, Math.max(1, Math.round(targetSimTime / SIM_DT)));
    // At low speeds sample every 4 steps as before. At high speeds, scale the
    // interval so we never write more points per frame than the trail buffer
    // can hold — otherwise we'd just overwrite the buffer multiple times per
    // frame for no visual benefit and significant cost in color-fade work.
    const sampleEvery = Math.max(TRAIL_SAMPLE_BASE, Math.ceil(steps / TRAIL_LENGTH));
    for (let s = 0; s < steps; s++) {
      this.physics.step(SIM_DT);
      if (++this._stepCounter >= sampleEvery) {
        this._stepCounter = 0;
        this._sampleTrails();
      }
    }
  }

  _sampleTrails() {
    const heliocentric = this.ui.frameMode === 'heliocentric';
    const sunPos = this.physics.bodies[0].pos;
    for (const b of this.physics.bodies) {
      if (!b.trail || !b.trail.line.visible) continue;
      const t = b.trail;
      const cap = t.positions.length / 3;
      let writeIndex;
      if (t.count >= cap) {
        t.positions.copyWithin(0, 3);
        writeIndex = cap - 1;
      } else {
        writeIndex = t.count;
        t.count++;
      }
      const i3 = writeIndex * 3;
      if (heliocentric) {
        t.positions[i3]     = b.pos.x - sunPos.x;
        t.positions[i3 + 1] = b.pos.y - sunPos.y;
        t.positions[i3 + 2] = b.pos.z - sunPos.z;
      } else {
        t.positions[i3]     = b.pos.x;
        t.positions[i3 + 1] = b.pos.y;
        t.positions[i3 + 2] = b.pos.z;
      }
      t.line.geometry.setDrawRange(0, t.count);
      t.line.geometry.attributes.position.needsUpdate = true;
    }
  }

  _syncMeshPositions() {
    const bodies = this.physics.bodies;
    if (this.ui.frameMode === 'heliocentric') {
      const sunPos = bodies[0].pos;
      bodies[0].mesh.position.set(0, 0, 0);
      for (let k = 1; k < bodies.length; k++) {
        bodies[k].mesh.position.copy(bodies[k].pos).sub(sunPos);
      }
    } else {
      for (const b of bodies) b.mesh.position.copy(b.pos);
    }
  }

  _updateMaxEcc() {
    for (const b of this.physics.bodies) {
      if (!b.planet) continue;
      if (b.planet.name in this.ui.maxEcc) {
        const e = this.physics.getInstantaneousEccentricity(b);
        if (e > this.ui.maxEcc[b.planet.name]) {
          this.ui.maxEcc[b.planet.name] = e;
        }
      }
    }
  }

  _pushHUD() {
    const years = this.physics.totalTime / (2 * Math.PI);
    this.ui.updateHUD({
      years,
      mercuryOrbits: years / 0.241,
      jupiterOrbits: years / 11.86,
      consumed: this.physics.consumedLabels,
    });
  }
}
