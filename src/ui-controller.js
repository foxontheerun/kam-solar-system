import { CAMERA_PRESETS, KAM_PRESETS } from './data.js';

/**
 * Osculating semi-major axis: the `a` of the Keplerian orbit that osculates
 * (touches) the current trajectory at this instant. Recovered from current
 * position and velocity via vis-viva: 1/a = 2/r − v²/μ. With code units
 * GM_sun = 1, the formula simplifies to 1/a = 2/r − v². Returns +Infinity
 * for unbound trajectories (e ≥ 1).
 */
function osculatingA(body, sun) {
  const r = body.pos.distanceTo(sun.pos);
  const vRel = body.vel.clone().sub(sun.vel);
  const denom = 2 / r - vRel.lengthSq();
  return denom > 0 ? 1 / denom : Infinity;
}

function osculatingPeriodRatio(outer, inner, sun) {
  const aOuter = osculatingA(outer, sun);
  const aInner = osculatingA(inner, sun);
  if (!Number.isFinite(aOuter) || !Number.isFinite(aInner) || aInner <= 0) {
    return NaN;
  }
  return Math.pow(aOuter / aInner, 1.5);
}

/**
 * Wires every DOM control on the HUD to the simulation. Owns the per-slider
 * scale factors (mass, eccentricity, inclination, drag, speed, visual scales)
 * and applies KAM presets in batch with a single re-initialisation at the end.
 */
export class UIController {
  /**
   * @param {object} deps
   * @param {import('./physics-engine.js').PhysicsEngine} deps.physics
   * @param {import('./asteroid-belt.js').AsteroidBelt} deps.belt
   * @param {Array<object>} deps.planets — the PLANETS array (mutated by ecc/inc sliders)
   * @param {THREE.PerspectiveCamera} deps.camera
   * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} deps.controls
   * @param {THREE.Mesh} deps.sunMesh
   * @param {Array<THREE.Mesh>} deps.planetMeshes
   * @param {THREE.Sprite} deps.barycenterMarker
   */
  constructor({ physics, belt, planets, sun, camera, controls, sunMesh, planetMeshes, barycenterMarker }) {
    this.physics = physics;
    this.belt = belt;
    this.planets = planets;
    this.sun = sun;
    this.camera = camera;
    this.controls = controls;
    this.sunMesh = sunMesh;
    this.planetMeshes = planetMeshes;
    this.barycenterMarker = barycenterMarker;

    this._origEcc = planets.map(p => p.e);
    this._origInc = planets.map(p => p.i);
    this._origA   = planets.map(p => p.a);

    this.speed = 10;
    this.paused = false;
    this.frameMode = 'heliocentric';

    this.maxEcc = { Mercury: 0, Earth: 0, Mars: 0 };
    this._suspendReinit = false;
    this._dom = this._collectDOM();
    this._bindEvents();
    this._applySpeed();
    this._refreshToggleVisibility();
    this._renderLegend();
  }

  /**
   * Render the legend (planet name, colour swatch, orbital period) into both
   * the fixed top-left card and the in-HUD mobile section. Period is computed
   * from the current semi-major axis via Kepler's third law, so KAM presets
   * that move Jupiter inward show its new period instead of the original
   * 11.86-year value.
   */
  _renderLegend() {
    const bodies = [this.sun, ...this.planets];
    const rows = bodies.map(b => {
      let periodStr = '—';
      if (b.a !== undefined) {
        const T = Math.pow(b.a, 1.5);
        periodStr = `${T.toFixed(T < 10 ? 2 : 1)} years`;
      }
      const swatch = `#${b.color.toString(16).padStart(6, '0')}`;
      return `<div class="row">
        <span class="row-left">
          <span class="dot" style="background:${swatch}"></span>
          <span class="name">${b.name}</span>
        </span>
        <span class="meta">${periodStr}</span>
      </div>`;
    }).join('');
    const note = '<div class="legend-note">Periods are Keplerian — computed from each body\'s current semi-major axis via T = a<sup>3/2</sup>. KAM presets that move Jupiter inward update its period in real time. Under perturbation the true N-body period drifts slightly from the nominal value shown here.</div>';
    for (const id of ['legend', 'legendInner']) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = rows + note;
    }
  }

  _collectDOM() {
    const ids = [
      'speed', 'speedVal',
      'tOrbits', 'tTrails', 'tLabels', 'tBelt', 'tInertial', 'tBarycenter', 'tPause',
      'elapsed', 'mercuryOrbits', 'jupiterOrbits',
      'massScale', 'massScaleVal',
      'eccScale', 'eccScaleVal',
      'incScale', 'incScaleVal',
      'drag', 'dragVal',
      'sunScale', 'sunScaleVal',
      'planetScale', 'planetScaleVal',
      'resetSim',
      'ecMercury', 'ecEarth', 'ecMars', 'tsTj',
      'consumedRow', 'consumed', 'consumedList',
      'hudToggle', 'hud', 'pauseBtn',
    ];
    const dom = {};
    for (const id of ids) dom[id] = document.getElementById(id);
    return dom;
  }

  _bindEvents() {
    const d = this._dom;
    d.speed.addEventListener('input', () => this._applySpeed());

    d.massScale.addEventListener('input', e => {
      const x = parseFloat(e.target.value);
      const scale = Math.pow(10, x);
      d.massScaleVal.textContent = scale < 10
        ? scale.toFixed(1) + '×'
        : Math.round(scale) + '×';
      this.physics.applyMassScale(scale);
    });

    d.eccScale.addEventListener('input', e => {
      const m = parseFloat(e.target.value);
      d.eccScaleVal.textContent = m.toFixed(1) + '×';
      for (let i = 0; i < this.planets.length; i++) {
        this.planets[i].e = Math.min(0.85, this._origEcc[i] * m);
      }
      this._reinit();
    });

    d.incScale.addEventListener('input', e => {
      const m = parseFloat(e.target.value);
      d.incScaleVal.textContent = m.toFixed(1) + '×';
      for (let i = 0; i < this.planets.length; i++) {
        this.planets[i].i = Math.min(45, this._origInc[i] * m);
      }
      this._reinit();
    });

    d.drag.addEventListener('input', e => {
      const x = parseFloat(e.target.value);
      const k = x === 0 ? 0 : Math.pow(10, -5 + 3 * (x / 100));
      d.dragVal.textContent = x === 0 ? '0' : k.toExponential(1);
      this.physics.setDragCoefficient(k);
    });

    d.sunScale.addEventListener('input', e => {
      const s = parseFloat(e.target.value);
      d.sunScaleVal.textContent = `${s.toFixed(1)}× (≈ ${Math.round(s * 35).toLocaleString('en-US')}× real)`;
      this.sunMesh.scale.set(s, s, s);
    });

    d.planetScale.addEventListener('input', e => {
      const s = parseFloat(e.target.value);
      d.planetScaleVal.textContent = `${s.toFixed(1)}× (≈ ${Math.round(s * 2000).toLocaleString('en-US')}× real avg)`;
      for (const m of this.planetMeshes) m.scale.set(s, s, s);
    });

    d.resetSim.addEventListener('click', () => this._reinit());

    // Auto-enable inertial frame when the user turns on the barycenter
    // marker. Without inertial frame the Sun is pinned to the origin and the
    // marker is geometrically inside its mesh, so the toggle would silently
    // do nothing. We don't auto-disable inertial when barycenter is turned
    // off — inertial frame is useful on its own (shows Sun wobble).
    d.tBarycenter.addEventListener('change', () => {
      if (d.tBarycenter.checked && !d.tInertial.checked) {
        d.tInertial.checked = true;
        d.tInertial.dispatchEvent(new Event('change'));
      }
    });

    [d.tOrbits, d.tTrails, d.tLabels, d.tBelt, d.tInertial, d.tBarycenter, d.tPause]
      .forEach(el => el.addEventListener('change', () => this._refreshToggleVisibility()));

    document.querySelectorAll('[data-cam]').forEach(btn =>
      btn.addEventListener('click', () => this._applyCameraPreset(btn.dataset.cam))
    );

    document.querySelectorAll('[data-jup]').forEach(btn =>
      btn.addEventListener('click', () => this._applyKAMPreset(btn.dataset.jup))
    );

    d.hudToggle.addEventListener('click', () => {
      const collapsed = d.hud.classList.toggle('hud--collapsed');
      d.hudToggle.classList.toggle('hud-toggle--shown', !collapsed);
      d.hudToggle.title = collapsed ? 'Show panel' : 'Hide panel';
    });

    d.pauseBtn.addEventListener('click', () => this._togglePause());

    document.addEventListener('keydown', e => {
      if (e.code !== 'Space') return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
      this._togglePause();
    });
  }

  _applySpeed() {
    const x = parseFloat(this._dom.speed.value);
    this.speed = Math.pow(10, x);
    this._dom.speedVal.textContent = this.speed < 10
      ? this.speed.toFixed(1) + ' years/s'
      : Math.round(this.speed) + ' years/s';
  }

  _applyCameraPreset(name) {
    const p = CAMERA_PRESETS[name];
    if (!p) return;
    this.camera.position.set(...p.pos);
    this.controls.target.set(...p.target);
    this.controls.update();
  }

  _applyKAMPreset(name) {
    const p = KAM_PRESETS[name];
    if (!p) return;
    this._suspendReinit = true;
    const d = this._dom;
    if (p.massX !== undefined) {
      d.massScale.value = Math.log10(p.massX);
      d.massScale.dispatchEvent(new Event('input'));
    }
    if (p.eccX !== undefined) {
      d.eccScale.value = p.eccX;
      d.eccScale.dispatchEvent(new Event('input'));
    }
    if (p.incX !== undefined) {
      d.incScale.value = p.incX;
      d.incScale.dispatchEvent(new Event('input'));
    }
    if (p.dragV !== undefined) {
      d.drag.value = p.dragV;
      d.drag.dispatchEvent(new Event('input'));
    }
    if (p.jupA !== undefined) this.planets[4].a = p.jupA;
    if (p.hideBelt !== undefined) {
      const shouldShow = !p.hideBelt;
      if (d.tBelt.checked !== shouldShow) {
        d.tBelt.checked = shouldShow;
        d.tBelt.dispatchEvent(new Event('change'));
      }
    }
    this._suspendReinit = false;
    this._reinit();
  }

  _reinit() {
    if (this._suspendReinit) return;
    this.physics.reinitializeFromCurrent();
    Object.keys(this.maxEcc).forEach(k => this.maxEcc[k] = 0);
    // After reinit, consumed planets are restored. Re-apply current toggle
    // state to make their trails and orbit lines visible again — otherwise
    // they stay hidden from the previous capture event.
    this._refreshToggleVisibility();
    this._renderLegend();
  }

  _refreshToggleVisibility() {
    const d = this._dom;
    const trailsOn = d.tTrails.checked;
    for (const b of this.physics.bodies) {
      if (b.consumed) continue;
      if (b.orbitLine) b.orbitLine.visible = d.tOrbits.checked;
      if (b.trail) {
        // Transitioning off → on: clear the stale buffer so the new trail
        // doesn't bridge old positions to current ones with a straight line.
        if (trailsOn && !b.trail.line.visible) {
          b.trail.count = 0;
          b.trail.line.geometry.setDrawRange(0, 0);
        }
        b.trail.line.visible = trailsOn;
      }
      if (b.labelSprite) b.labelSprite.visible = d.tLabels.checked;
    }
    this.belt.visible = d.tBelt.checked;
    this.paused = d.tPause.checked;
    if (d.pauseBtn) d.pauseBtn.classList.toggle('is-paused', this.paused);

    const newMode = d.tInertial.checked ? 'inertial' : 'heliocentric';
    if (newMode !== this.frameMode) {
      this.frameMode = newMode;
      for (const b of this.physics.bodies) {
        if (b.trail) {
          b.trail.count = 0;
          b.trail.line.geometry.setDrawRange(0, 0);
        }
      }
    }
    this._refreshBarycenterVisibility();
  }

  _togglePause() {
    const d = this._dom;
    d.tPause.checked = !d.tPause.checked;
    d.tPause.dispatchEvent(new Event('change'));
  }

  _refreshBarycenterVisibility() {
    if (!this.barycenterMarker) return;
    this.barycenterMarker.visible =
      this._dom.tBarycenter.checked && this.frameMode === 'inertial';
  }

  /**
   * Hide the asteroid belt and uncheck its toggle. Called automatically when
   * the system enters a catastrophic regime (a planet is consumed by the Sun),
   * because the belt is decorative and would mislead the viewer by orbiting
   * peacefully while the inner system collapses.
   */
  autoHideBelt() {
    const t = this._dom.tBelt;
    if (t.checked) {
      t.checked = false;
      t.dispatchEvent(new Event('change'));
    }
  }

  /**
   * Push current diagnostics to the HUD. Called every frame by the loop.
   * @param {{years: number, mercuryOrbits: number, jupiterOrbits: number, consumed: string[]}} stats
   */
  updateHUD(stats) {
    const d = this._dom;
    d.elapsed.textContent = stats.years < 100
      ? stats.years.toFixed(1)
      : stats.years.toFixed(0);
    d.mercuryOrbits.textContent = stats.mercuryOrbits.toFixed(0);
    d.jupiterOrbits.textContent = stats.jupiterOrbits.toFixed(2);
    d.ecMercury.textContent = this.maxEcc.Mercury.toFixed(3);
    d.ecEarth.textContent   = this.maxEcc.Earth.toFixed(3);
    d.ecMars.textContent    = this.maxEcc.Mars.toFixed(3);

    // Saturn:Jupiter period ratio from osculating semi-major axes recovered
    // from current position and velocity via vis-viva: 1/a = 2/r − v²/μ.
    // Using osculating (not preset) `a` lets the ratio respond to in-run
    // secular drift and resonance dynamics, not just to KAM-preset jumps.
    const sun = this.physics.bodies[0];
    const jup = this.physics.bodies[5];
    const sat = this.physics.bodies[6];
    const ratio = osculatingPeriodRatio(sat, jup, sun);
    d.tsTj.textContent = Number.isFinite(ratio) ? ratio.toFixed(3) : '—';

    if (stats.consumed.length) {
      d.consumedRow.style.display = '';
      d.consumed.textContent = stats.consumed.length;
      d.consumedList.textContent = stats.consumed.join(', ');
    } else {
      d.consumedRow.style.display = 'none';
    }
  }
}
