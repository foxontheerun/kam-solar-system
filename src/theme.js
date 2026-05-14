export const THEMES = {
  classic: {
    mercury: 0x8c8378,
    venus: 0xd9b384,
    earth: 0x4a90e2,
    mars: 0xc1440e,
    jupiter: 0xc99b6e,
    saturn: 0xe5d2a3,
    uranus: 0x9ad8e8,
    neptune: 0x4060d0,
    sun: 0xfde08a,
    belt: 0x888888,
  },
  neon: {
    mercury: 0xff00ff,
    venus: 0xffff00,
    earth: 0x00ffff,
    mars: 0xff4500,
    jupiter: 0x7fff00,
    saturn: 0xffd700,
    uranus: 0x00ced1,
    neptune: 0x1e90ff,
    sun: 0xffffff,
    belt: 0x444444,
  },
  paper: {
    mercury: 0x333333,
    venus: 0x333333,
    earth: 0x0000ff,
    mars: 0xaa0000,
    jupiter: 0x333333,
    saturn: 0x333333,
    uranus: 0x333333,
    neptune: 0x333333,
    sun: 0x000000,
    belt: 0xcccccc,
  },
};

const currentTheme = THEMES.classic;

export const COLORS = currentTheme;
