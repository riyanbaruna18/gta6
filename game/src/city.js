// The city of Solmara, generated once from the seed: a road grid, seeded buildings in
// every block, Palma Park, the beach and sea to the south, the Marina Docks to the west,
// and six named places the missions point at. Pure geometry: no drawing, no browser.
// Roads are axis-aligned avenues (vertical) and streets (horizontal); everything the
// autopilot and the traffic do is road-following, so nothing ever needs a pathfinder.
import { CITY } from './config.js';

export const ROAD_WIDTH = 90;
export const AVENUES = [320, 800, 1280, 1760, 2240];
export const STREETS = [300, 700, 1100, 1500];
export const SEA_Y = 1740;
export const SAND_Y = 1620;

const BUILDING_COLORS = ['#5b6470', '#6e5a7a', '#7a6a58', '#4f6b7a', '#6b7a4f'];

/** The six named places, in the order the story visits them. */
export const PLACES = {
  oldTown: { x: 560, y: 560, label: 'Old Town' },
  strip: { x: 1280, y: 1500, label: 'The Strip' },
  park: { x: 1040, y: 900, label: 'Palma Park' },
  docks: { x: 150, y: 1300, label: 'Marina Docks' },
  bank: { x: 1400, y: 900, label: 'Solmara Bank' },
  beach: { x: 1280, y: 1700, label: 'Beachfront' },
};

export function createCity(random) {
  const buildings = [];
  const trees = [];
  const park = { x: 850, y: 750, w: 380, h: 300 };
  const bankRect = { x: 1330, y: 740, w: 140, h: 120 };
  const docksRect = { x: 40, y: 1150, w: 220, h: 300 };

  // One block is the rectangle between two neighbouring avenues and two streets.
  // Each block gets a few seeded buildings, except the blocks the park, the bank
  // and the docks sit in, and the beach strip at the south edge.
  const edgesX = [0, ...AVENUES, CITY.width];
  const edgesY = [0, ...STREETS, SAND_Y];
  for (let bx = 0; bx < edgesX.length - 1; bx += 1) {
    for (let by = 0; by < edgesY.length - 1; by += 1) {
      const x0 = edgesX[bx] + ROAD_WIDTH / 2 + 14;
      const x1 = edgesX[bx + 1] - ROAD_WIDTH / 2 - 14;
      const y0 = edgesY[by] + ROAD_WIDTH / 2 + 14;
      const y1 = edgesY[by + 1] - ROAD_WIDTH / 2 - 14;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      // Skip the park block, the bank block and the docks block.
      if (x0 < park.x + park.w && x1 > park.x && y0 < park.y + park.h && y1 > park.y) continue;
      if (x0 < bankRect.x + bankRect.w && x1 > bankRect.x && y0 < bankRect.y + bankRect.h && y1 > bankRect.y) continue;
      if (x0 < docksRect.x + docksRect.w && x1 > docksRect.x && y0 < docksRect.y + docksRect.h && y1 > docksRect.y) continue;
      const count = 2 + Math.floor(random() * 3);
      for (let i = 0; i < count; i += 1) {
        const w = 60 + random() * 90;
        const h = 50 + random() * 80;
        const x = x0 + random() * Math.max(1, x1 - x0 - w);
        const y = y0 + random() * Math.max(1, y1 - y0 - h);
        buildings.push({ x, y, w, h, color: BUILDING_COLORS[Math.floor(random() * BUILDING_COLORS.length)] });
      }
    }
  }
  // Trees inside the park and a few palms along the beach.
  for (let i = 0; i < 26; i += 1) {
    trees.push({ x: park.x + 20 + random() * (park.w - 40), y: park.y + 20 + random() * (park.h - 40), r: 9 + random() * 7 });
  }
  for (let i = 0; i < 14; i += 1) {
    trees.push({ x: 60 + random() * (CITY.width - 120), y: SAND_Y + 18 + random() * 70, r: 8 + random() * 6 });
  }

  const city = {
    width: CITY.width,
    height: CITY.height,
    buildings,
    trees,
    park,
    bankRect,
    docksRect,
    places: PLACES,
    spawn: { x: 350, y: 340 },
  };
  return city;
}

/** True when the point is on a road (avenue or street), within the road's width. */
export function onRoad(x, y) {
  for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_WIDTH / 2) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_WIDTH / 2) return true;
  return false;
}

/** The nearest point on the road grid to (x, y): the closest avenue or street centre. */
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const ax of AVENUES) {
    const d = Math.abs(x - ax);
    if (d < bestD) { bestD = d; best = { x: ax, y }; }
  }
  for (const sy of STREETS) {
    const d = Math.abs(y - sy);
    if (d < bestD) { bestD = d; best = { x, y: sy }; }
  }
  return best;
}

/** A random point on a random road, for traffic and police spawns. */
export function randomRoadPoint(random) {
  if (random() < 0.5) {
    const ax = AVENUES[Math.floor(random() * AVENUES.length)];
    return { x: ax, y: random() * SEA_Y };
  }
  const sy = STREETS[Math.floor(random() * STREETS.length)];
  return { x: random() * CITY.width, y: sy };
}

/** True when the circle at (x, y) with radius r touches any building. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  if (x + r > city.bankRect.x && x - r < city.bankRect.x + city.bankRect.w &&
      y + r > city.bankRect.y && y - r < city.bankRect.y + city.bankRect.h) return city.bankRect;
  return null;
}

/** Push the circle out of whatever building it touches; returns true when it moved. */
export function pushOutOfBuildings(city, p, r) {
  const b = hitsBuilding(city, p.x, p.y, r);
  if (b === null) return false;
  const overlapLeft = p.x + r - b.x;
  const overlapRight = b.x + b.w - (p.x - r);
  const overlapTop = p.y + r - b.y;
  const overlapBottom = b.y + b.h - (p.y - r);
  const min = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
  if (min === overlapLeft) p.x = b.x - r;
  else if (min === overlapRight) p.x = b.x + b.w + r;
  else if (min === overlapTop) p.y = b.y - r;
  else p.y = b.y + b.h + r;
  return true;
}
