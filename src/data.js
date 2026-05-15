import { COLORS } from "./theme.js";

export const D2R = Math.PI / 180;
export const G = 1;
export const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * Real orbital elements of the eight planets.
 * Units: G = 1, M_sun = 1, distance in AU, time such that one year equals 2π.
 * Inclination, longitude of ascending node, and argument of perihelion in degrees.
 */
export const PLANETS = [
  {
    name: "Mercury",
    a: 0.387,
    e: 0.206,
    i: 7.005,
    Om: 48.331,
    om: 29.124,
    m: 1.66e-7,
    color: COLORS.mercury,
    size: 0.06,
    T: 0.241,
  },
  {
    name: "Venus",
    a: 0.723,
    e: 0.007,
    i: 3.395,
    Om: 76.681,
    om: 54.884,
    m: 2.45e-6,
    color: COLORS.venus,
    size: 0.1,
    T: 0.615,
  },
  {
    name: "Earth",
    a: 1.0,
    e: 0.017,
    i: 0.0,
    Om: -11.26,
    om: 114.208,
    m: 3.0e-6,
    color: COLORS.earth,
    size: 0.11,
    T: 1.0,
  },
  {
    name: "Mars",
    a: 1.524,
    e: 0.093,
    i: 1.85,
    Om: 49.558,
    om: 286.502,
    m: 3.23e-7,
    color: COLORS.mars,
    size: 0.08,
    T: 1.881,
  },
  {
    name: "Jupiter",
    a: 5.203,
    e: 0.048,
    i: 1.305,
    Om: 100.464,
    om: 273.867,
    m: 9.54e-4,
    color: COLORS.jupiter,
    size: 0.42,
    T: 11.86,
  },
  {
    name: "Saturn",
    a: 9.537,
    e: 0.054,
    i: 2.484,
    Om: 113.665,
    om: 339.392,
    m: 2.86e-4,
    color: COLORS.saturn,
    size: 0.38,
    T: 29.46,
  },
  {
    name: "Uranus",
    a: 19.19,
    e: 0.046,
    i: 0.77,
    Om: 74.006,
    om: 96.998,
    m: 4.36e-5,
    color: COLORS.uranus,
    size: 0.24,
    T: 84.01,
  },
  {
    name: "Neptune",
    a: 30.07,
    e: 0.011,
    i: 1.77,
    Om: 131.784,
    om: 273.187,
    m: 5.15e-5,
    color: COLORS.neptune,
    size: 0.23,
    T: 164.79,
  },
];

export const SUN = { name: "Sun", m: 1.0, color: COLORS.sun, size: 0.16 };

export const SUN_CAPTURE_RADIUS = 0.18;

export const TRAIL_LENGTH = 1500;

export const ASTEROID_BELT = {
  count: typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches ? 800 : 1500,
  innerRadius: 2.2,
  outerRadius: 3.2,
  thickness: 0.18,
};

/**
 * Camera zoom limits. `minDistance` prevents the camera from passing inside
 * the Sun's visual sphere; `maxDistance` keeps the viewer inside the
 * background-star shell (which extends to ~400 AU in scene-builder.js).
 */
export const CAMERA_LIMITS = {
  minDistance: 0.4,
  maxDistance: 150,
};

/**
 * KAM stability presets. Each one sets sliders and Jupiter's semi-major axis
 * to demonstrate a specific dynamical regime.
 *
 * `hideBelt: true` indicates a destructive configuration where the decorative
 * asteroid belt would be misleading (it doesn't participate in N-body physics
 * and would keep orbiting the Sun calmly while real planets are ejected).
 */
export const KAM_PRESETS = {
  reset: { jupA: 5.203, massX: 1, eccX: 1, incX: 1, dragV: 0, hideBelt: false },
  phi: {
    jupA: Math.pow(PHI, 2 / 3),
    massX: 1,
    eccX: 1,
    incX: 1,
    dragV: 0,
    hideBelt: false,
  },
  "2to1": {
    jupA: Math.pow(2.0, 2 / 3),
    massX: 50,
    eccX: 1,
    incX: 1,
    dragV: 0,
    hideBelt: true,
  },
  "3to1": {
    jupA: Math.pow(3.0, 2 / 3),
    massX: 30,
    eccX: 1,
    incX: 1,
    dragV: 0,
    hideBelt: true,
  },
  break: {
    jupA: Math.pow(2.0, 2 / 3),
    massX: 800,
    eccX: 1,
    incX: 1,
    dragV: 0,
    hideBelt: true,
  },
};

export const CAMERA_PRESETS = {
  all: { pos: [35, 25, 55], target: [0, 0, 0] },
  side: { pos: [40, 0.6, 0.5], target: [0, 0, 0] },
  inner: { pos: [3, 1.2, 3.5], target: [0, 0, 0] },
  jupiter: { pos: [8, 2.5, 8], target: [5.2, 0, 0] },
};
