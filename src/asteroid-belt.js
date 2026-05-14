import * as THREE from 'three';
import { ASTEROID_BELT } from './data.js';

/**
 * A field of small bodies on independent circular orbits between Mars and
 * Jupiter. Each particle keeps its own semi-major axis, phase, mean motion
 * (Kepler's third law), and out-of-plane offset; positions are recomputed
 * every frame from the simulation time.
 *
 * The belt is rendered as a single `THREE.Points` object with a custom shader
 * that sizes points by depth and fades them to a soft circle.
 */
export class AsteroidBelt {
  /**
   * @param {THREE.Object3D} parent — typically the Sun's mesh, so the belt
   *     stays at the heliocentric origin and reorients with frame switches.
   */
  constructor(parent) {
    const { count, innerRadius, outerRadius, thickness } = ASTEROID_BELT;
    this.count = count;

    this._a   = new Float32Array(count);
    this._phi = new Float32Array(count);
    this._n   = new Float32Array(count);
    this._y   = new Float32Array(count);

    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = innerRadius + Math.random() * (outerRadius - innerRadius);
      this._a[i]   = r;
      this._phi[i] = Math.random() * 2 * Math.PI;
      this._n[i]   = Math.pow(r, -1.5);
      this._y[i]   = (Math.random() - 0.5) * thickness;

      positions[i * 3]     = r * Math.cos(this._phi[i]);
      positions[i * 3 + 1] = this._y[i];
      positions[i * 3 + 2] = r * Math.sin(this._phi[i]);

      const c = 0.45 + Math.random() * 0.45;
      colors[i * 3]     = c * 0.92;
      colors[i * 3 + 1] = c * 0.85;
      colors[i * 3 + 2] = c * 0.72;
    }
    this._positions = positions;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: 4.5 },
        uPixelRatio: { value: devicePixelRatio },
      },
      vertexShader: `
        attribute vec3 color;
        varying vec3 vColor;
        uniform float uSize;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uPixelRatio * (1.0 / -mv.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d);
          if (r > 0.5) discard;
          float alpha = smoothstep(0.5, 0.32, r);
          gl_FragColor = vec4(vColor, alpha * 0.85);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    this.points = new THREE.Points(geom, mat);
    parent.add(this.points);
  }

  /**
   * Recompute particle positions for the given simulation time.
   * @param {number} time — total simulation time
   */
  update(time) {
    const { _a, _phi, _n, _y, _positions, count } = this;
    for (let i = 0; i < count; i++) {
      const ang = _phi[i] + _n[i] * time;
      _positions[i * 3]     = _a[i] * Math.cos(ang);
      _positions[i * 3 + 1] = _y[i];
      _positions[i * 3 + 2] = _a[i] * Math.sin(ang);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  set visible(v) { this.points.visible = v; }
  get visible()  { return this.points.visible; }
}
