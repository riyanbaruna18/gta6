// Drawing only: the world's state and the current screen in, pixels out. A camera
// follows the player across the city; the 1280x800 view is scaled to fit the window.
// Flat shapes and canvas text for the HUD, the minimap and the panels. No setTransform:
// the view is applied with save/translate/scale, which every canvas keeps working.
import { CITY, FIELD, FONT, PALETTE } from './config.js';
import { AVENUES, ROAD_WIDTH, SAND_Y, SEA_Y, STREETS } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_COMPLETE = 'complete';

/** The panel's width; its height grows with its lines: room for the title, the lines and the prompt. */
const PANEL = { width: 640, top: 140, line: 34, bottom: 76 };
const MINIMAP = { width: 220, height: 156 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const moneyLabel = cachedLabel('$');
  const speedLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = `${weight ?? ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? `${weight} ` : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function camera(state) {
    const player = state.player;
    return {
      x: Math.min(Math.max(0, player.x - FIELD.width / 2), CITY.width - FIELD.width),
      y: Math.min(Math.max(0, player.y - FIELD.height / 2), CITY.height - FIELD.height),
    };
  }

  function drawCity(state, cam) {
    const city = state.city;
    // Grass everywhere, then the sea and sand along the south edge.
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, CITY.width, CITY.height);
    context.fillStyle = PALETTE.sand;
    context.fillRect(0, SAND_Y, CITY.width, SEA_Y - SAND_Y);
    context.fillStyle = PALETTE.sea;
    context.fillRect(0, SEA_Y, CITY.width, CITY.height - SEA_Y);
    // Palma Park.
    context.fillStyle = PALETTE.park;
    context.fillRect(city.park.x, city.park.y, city.park.w, city.park.h);
    // Marina Docks pier.
    context.fillStyle = PALETTE.pier;
    context.fillRect(city.docksRect.x, city.docksRect.y, city.docksRect.w, city.docksRect.h);
    // Sidewalks, then the roads themselves.
    for (const ax of AVENUES) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(ax - ROAD_WIDTH / 2 - 8, 0, ROAD_WIDTH + 16, SEA_Y);
      context.fillStyle = PALETTE.road;
      context.fillRect(ax - ROAD_WIDTH / 2, 0, ROAD_WIDTH, SEA_Y);
    }
    for (const sy of STREETS) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(0, sy - ROAD_WIDTH / 2 - 8, CITY.width, ROAD_WIDTH + 16);
      context.fillStyle = PALETTE.road;
      context.fillRect(0, sy - ROAD_WIDTH / 2, CITY.width, ROAD_WIDTH);
    }
    // Centre dashes.
    context.fillStyle = PALETTE.roadLine;
    for (const ax of AVENUES) {
      for (let y = 20; y < SEA_Y; y += 64) context.fillRect(ax - 3, y, 6, 30);
    }
    for (const sy of STREETS) {
      for (let x = 20; x < CITY.width; x += 64) context.fillRect(x, sy - 3, 30, 6);
    }
    // Buildings: a body and a lighter roof.
    for (const b of city.buildings) {
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = PALETTE.buildingRoof;
      context.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    }
    // The bank: a dark block with a gold vault door.
    context.fillStyle = '#3d4451';
    context.fillRect(city.bankRect.x, city.bankRect.y, city.bankRect.w, city.bankRect.h);
    context.fillStyle = PALETTE.gold;
    context.fillRect(city.bankRect.x + city.bankRect.w / 2 - 12, city.bankRect.y + city.bankRect.h - 26, 24, 20);
    // Trees.
    context.fillStyle = '#2c6e35';
    for (const tree of city.trees) {
      context.beginPath();
      context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      context.fill();
    }
    // Named places, small so they never fight the HUD.
    context.textBaseline = 'alphabetic';
    for (const key of Object.keys(city.places)) {
      const place = city.places[key];
      text(place.label, place.x, place.y - 14, 15, PALETTE.muted, 'center');
    }
  }

  function drawCar(x, y, angle, color, isPolice) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = color;
    context.fillRect(-24, -12, 48, 24);
    context.fillStyle = 'rgba(20, 28, 38, 0.85)';
    context.fillRect(-6, -10, 16, 20);
    if (isPolice) {
      context.fillStyle = PALETTE.policeLight;
      context.fillRect(-20, -12, 8, 6);
      context.fillStyle = '#4fc3f7';
      context.fillRect(-20, 6, 8, 6);
    }
    context.restore();
  }

  function drawWorld(state, cam) {
    drawCity(state, cam);
    for (const car of state.traffic) {
      drawCar(car.x, car.y, car.angle, car.color, false);
    }
    for (const ped of state.peds) {
      if (ped.down > 0) continue;
      context.fillStyle = ped.color;
      context.beginPath();
      context.arc(ped.x, ped.y, 8, 0, Math.PI * 2);
      context.fill();
    }
    for (const cop of state.policeCars) {
      if (!cop.active) continue;
      drawCar(cop.x, cop.y, cop.angle, PALETTE.police, true);
    }
    for (const officer of state.policeFoot) {
      if (!officer.active || officer.down > 0) continue;
      context.fillStyle = PALETTE.police;
      context.beginPath();
      context.arc(officer.x, officer.y, 10, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.policeLight;
      context.fillRect(officer.x - 10, officer.y - 16, 20, 4);
    }
    const player = state.player;
    if (player.inCar) {
      drawCar(state.playerCar.x, state.playerCar.y, state.playerCar.angle, '#e63946', false);
    } else {
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(player.x, player.y, 13, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.player;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(player.x, player.y);
      context.lineTo(player.x + Math.cos(player.angle) * 22, player.y + Math.sin(player.angle) * 22);
      context.stroke();
    }
  }

  function drawMinimap(state) {
    const scaleX = MINIMAP.width / CITY.width;
    const scaleY = MINIMAP.height / CITY.height;
    const x0 = FIELD.width - MINIMAP.width - 18;
    const y0 = FIELD.height - MINIMAP.height - 18;
    context.fillStyle = PALETTE.minimap;
    context.fillRect(x0 - 4, y0 - 4, MINIMAP.width + 8, MINIMAP.height + 8);
    context.fillStyle = PALETTE.grass;
    context.fillRect(x0, y0, MINIMAP.width, MINIMAP.height);
    context.fillStyle = PALETTE.sea;
    context.fillRect(x0, y0 + SEA_Y * scaleY, MINIMAP.width, MINIMAP.height - SEA_Y * scaleY);
    context.fillStyle = PALETTE.road;
    for (const ax of AVENUES) context.fillRect(x0 + ax * scaleX - 1, y0, 2, SEA_Y * scaleY);
    for (const sy of STREETS) context.fillRect(x0, y0 + sy * scaleY - 1, MINIMAP.width, 2);
    const mission = state.missions.current();
    if (mission !== null && !state.done) {
      const target = state.missions.state.phase === 'escape' && mission.escape !== undefined ? mission.escape : mission.target;
      if (target !== undefined && target !== null) {
        context.strokeStyle = PALETTE.gold;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(x0 + target.x * scaleX, y0 + target.y * scaleY, 6, 0, Math.PI * 2);
        context.stroke();
      }
    }
    for (const cop of state.policeCars) {
      context.fillStyle = PALETTE.danger;
      context.fillRect(x0 + cop.x * scaleX - 2, y0 + cop.y * scaleY - 2, 4, 4);
    }
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(x0 + state.player.x * scaleX, y0 + state.player.y * scaleY, 4, 0, Math.PI * 2);
    context.fill();
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    text(moneyLabel(state.money), 24, 18, 30, PALETTE.gold, 'left', 'bold');
    text(state.missions.objectiveText(), 24, 56, 18, PALETTE.text, 'left');
    // Wanted stars, top right.
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
    text(stars, FIELD.width - 24, 18, 28, state.wanted > 0 ? PALETTE.danger : PALETTE.muted, 'right', 'bold');
    // Health bar under the stars.
    const barW = 150;
    const barX = FIELD.width - 24 - barW;
    context.fillStyle = PALETTE.panel;
    context.fillRect(barX, 56, barW, 14);
    context.fillStyle = state.player.hp > 40 ? '#57ab5a' : PALETTE.danger;
    context.fillRect(barX, 56, Math.max(0, (barW * state.player.hp) / 100), 14);
    const kmh = Math.round(Math.abs(state.player.speed) * 0.36);
    text(speedLabel(kmh) + ' km/h', FIELD.width - 24, 78, 20, PALETTE.text, 'right');
    if (state.toast !== '' && state.toastTimer > 0) {
      context.fillStyle = PALETTE.panel;
      const toastW = 560;
      context.fillRect((FIELD.width - toastW) / 2, 110, toastW, 34);
      text(state.toast, FIELD.width / 2, 118, 18, PALETTE.gold, 'center');
    }
    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 48, PALETTE.text, 'center', 'bold');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 40, 24, PALETTE.gold, 'center');
  }

  const TITLE_LINES = [
    'A 2D open-world crime game: steal cars, dodge the cops,',
    'run five jobs for Rico Vega and Mama Luz across Solmara.',
    'Move with WASD or arrows. Steal a car with F. Punch with Space.',
    'Hold Q at the bank vault. Pause with P. Continue a save with C.',
    '',
  ];
  const PAUSED_LINES = ['The city waits for you.'];
  const BUSTED_LINES = ['', ''];
  const COMPLETE_LINES = ['', ''];

  /** Paint one frame: the city through the camera, then the HUD or a panel. */
  function draw(state, screen, best) {
    const cam = camera(state);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(view.x, view.y);
    context.scale(view.scale, view.scale);
    context.translate(-cam.x, -cam.y);
    drawWorld(state, cam);
    context.restore();
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[4] = best > 0 ? `Best take so far: $${best}` : 'First time in Solmara? The first job pays $100.';
      drawPanel('SOLMARA', TITLE_LINES, 'Press Space or click to start');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    } else if (screen === SCREEN_BUSTED) {
      BUSTED_LINES[0] = moneyLabel(state.money);
      BUSTED_LINES[1] = `Best take so far: $${Math.max(best, state.money)}`;
      drawPanel('Busted!', BUSTED_LINES, 'Press Space or click to try again');
    } else if (screen === SCREEN_COMPLETE) {
      COMPLETE_LINES[0] = `Total take: $${state.money}`;
      COMPLETE_LINES[1] = 'All five jobs done. Solmara is yours.';
      drawPanel('STORY COMPLETE', COMPLETE_LINES, 'Press Space or click to play again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
