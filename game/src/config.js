// SOLMARA tuning: every number and colour in one place. The camera shows a 1280x800
// window of a 2560x1800 city, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 800 };
export const CITY = { width: 2560, height: 1800 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  walkSpeed: 210,
  radius: 14,
  hp: 100,
  stealRadius: 52,
  punchRadius: 44,
  punchDamage: 25,
  punchCooldown: 0.45,
};

export const CAR = {
  accel: 430,
  brake: 620,
  maxSpeed: 540,
  reverseMax: 170,
  steerRate: 2.7,
  length: 48,
  width: 24,
};

export const TRAFFIC = { count: 12, speed: 150, colors: ['#c9a227', '#7fb069', '#e07a5f', '#81b29a', '#f2cc8f'] };

export const PEDS = { count: 14, speed: 55 };

export const POLICE = {
  carSpeed: 540,
  carHp: 30,
  ramDamage: 3,
  ramCooldown: 1.5,
  footSpeed: 232,
  catchRadius: 28,
  catchTime: 1.5,
  spawnDistance: 520,
};

export const WANTED = { max: 5, decaySeconds: 25 };

/** Mission rewards, in story order: they sum to $2,300. */
export const REWARDS = [100, 200, 400, 600, 1000];

/** Where the save is kept between visits (this browser only). */
export const SAVE_KEY = 'solmara.save.v1';

export const PALETTE = {
  backdrop: '#0d1117',
  grass: '#2e5d3a',
  park: '#3a7d44',
  road: '#33383f',
  roadLine: '#c9a227',
  sidewalk: '#4a4f57',
  building: '#5b6470',
  buildingRoof: '#6e7787',
  sand: '#d9c08a',
  sea: '#1d6f8e',
  pier: '#7a5c3e',
  player: '#4fc3f7',
  playerCar: '#e63946',
  traffic: '#c9a227',
  police: '#1d3557',
  policeLight: '#e63946',
  ped: '#f2cc8f',
  panel: '#171c26',
  text: '#eef1f5',
  muted: '#9aa3b2',
  gold: '#f2c94c',
  danger: '#e5534b',
  minimap: '#10141b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
