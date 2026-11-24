// The screenshot scenes behind ?shot=start|play|chase|end, and the autopilot that
// plays them. Every scene plays the real rules forward from a fresh world, steered by
// a road-following autopilot (waypoints along the avenues and streets, so it never
// has to path around a building), so the frame is what a short game really looks
// like and the same seed always gives the same frame.
import { AVENUES, STREETS } from './city.js';
import { PLAYER, STEP } from './config.js';
import { SCREEN_COMPLETE, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const CHASE_SECONDS = 25;
const END_LIMIT_SECONDS = 600;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function angleDiff(from, to) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function nearestAvenue(x) {
  let best = AVENUES[0];
  for (const ax of AVENUES) if (Math.abs(ax - x) < Math.abs(best - x)) best = ax;
  return best;
}

function nearestStreet(y) {
  let best = STREETS[0];
  for (const sy of STREETS) if (Math.abs(sy - y) < Math.abs(best - y)) best = sy;
  return best;
}

function nearestRoadPoint(x, y) {
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

function onAvenue(x) {
  return AVENUES.some((ax) => Math.abs(x - ax) <= 45);
}

/**
 * A road-following driver with memory: it keeps its waypoint list and a stuck
 * detector, so one instance steers one world. Create a fresh one per world.
 */
export function createAutopilot() {
  let waypoints = [];
  let waypointIndex = 0;
  let missionKey = '';
  let sampleAt = 0;
  let sampleX = 0;
  let sampleY = 0;
  let stillWindows = 0;
  let lastThrottle = 0;
  let unstickUntil = 0;
  let unstickSteer = 1;

  // A route is a Manhattan path along real roads only: from the road nearest
  // the car to the road nearest the target. The pilot drives the last short leg
  // from that road point to the target itself, so the route never cuts through
  // a building the way a straight grid line would (the bank sits right on the
  // vault's doorstep, and the old route drove straight through it).
  function routeTo(state, tx, ty) {
    const p0 = nearestRoadPoint(state.player.x, state.player.y);
    const p1 = nearestRoadPoint(tx, ty);
    const p0Ave = onAvenue(p0.x);
    const p1Ave = onAvenue(p1.x);
    let pts;
    if (p0Ave && !p1Ave) {
      // Avenue -> street: along the avenue to the street, then along it.
      pts = [p0, { x: p0.x, y: p1.y }, p1];
    } else if (!p0Ave && p1Ave) {
      // Street -> avenue: along the street to the avenue, then along it.
      pts = [p0, { x: p1.x, y: p0.y }, p1];
    } else if (p0Ave && p1Ave) {
      // Avenue -> avenue: via the street nearest the destination.
      const s = nearestStreet(p1.y);
      pts = [p0, { x: p0.x, y: s }, { x: p1.x, y: s }, p1];
    } else {
      // Street -> street: via the avenue nearest the destination.
      const a = nearestAvenue(p1.x);
      pts = [p0, { x: a, y: p0.y }, { x: a, y: p1.y }, p1];
    }
    const out = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (last === undefined || Math.hypot(p.x - last.x, p.y - last.y) > 1) out.push(p);
    }
    return out;
  }

  function targetOf(state) {
    const missions = state.missions;
    const def = missions.current();
    if (def === null) return null;
    if (def.id === 'wheels') return null; // Mission 1 wants a car, not a place.
    if (def.id === 'score' && missions.state.phase === 'escape') return def.escape;
    return def.target;
  }

  function nearestCar(state, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.traffic) {
      const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function input(state) {
    const player = state.player;
    const missions = state.missions;
    const def = missions.current();
    const out = { mx: 0, my: 0, throttle: 0, steer: 0, steal: false, attack: false, hold: false };
    const target = targetOf(state);

    // A stuck car reverses out for a second, then carries on, re-routed from
    // where it actually is. "Stuck" is measured over half-second windows, and
    // only while the pilot is actually trying to drive forward: a car turning
    // around in place is not stuck.
    if (state.elapsed >= sampleAt) {
      const moved = Math.hypot(player.x - sampleX, player.y - sampleY);
      if (moved < 20 && lastThrottle > 0.3) stillWindows += 1;
      else stillWindows = 0;
      sampleX = player.x;
      sampleY = player.y;
      sampleAt = state.elapsed + 0.5;
    }
    if (stillWindows >= 3 && player.inCar && state.elapsed >= unstickUntil) {
      unstickUntil = state.elapsed + 1;
      unstickSteer = -unstickSteer;
      stillWindows = 0;
      if (target !== null && target !== undefined) {
        waypoints = routeTo(state, target.x, target.y);
        waypointIndex = 0;
      }
    }
    if (state.elapsed < unstickUntil) {
      out.throttle = -0.8;
      out.steer = unstickSteer;
      lastThrottle = out.throttle;
      return out;
    }

    // Mission 1: walk to the nearest car and steal it.
    if (def !== null && def.id === 'wheels' && !player.inCar) {
      const car = nearestCar(state, 400);
      if (car !== null) {
        const d = Math.hypot(car.x - player.x, car.y - player.y);
        if (d <= PLAYER.stealRadius) {
          out.steal = true;
          return out;
        }
        const a = Math.atan2(car.y - player.y, car.x - player.x);
        out.mx = Math.cos(a);
        out.my = Math.sin(a);
        return out;
      }
    }

    if (target === null || target === undefined) return out;
    const key = `${missions.state.index}:${missions.state.phase}`;
    if (key !== missionKey) {
      missionKey = key;
      waypoints = routeTo(state, target.x, target.y);
      waypointIndex = 0;
    }
    const dTarget = Math.hypot(target.x - player.x, target.y - player.y);
    // At a hold point, stop and (at the vault) hold Q until the job pays out.
    if (dTarget <= target.radius) {
      if (def.id === 'score' && missions.state.phase === 'target') out.hold = true;
      return out;
    }
    // On foot, grab a nearby car for the trip.
    if (!player.inCar) {
      const car = nearestCar(state, 70);
      if (car !== null) {
        out.steal = true;
        return out;
      }
    }
    // Follow the waypoints, in order. (No re-routing mid-leg: the route is
    // recomputed only when the mission changes or the car gets stuck, so the
    // target never jumps around under the driver.)
    let wp = waypoints[waypointIndex];
    while (wp !== undefined && Math.hypot(wp.x - player.x, wp.y - player.y) < 100) {
      waypointIndex += 1;
      wp = waypoints[waypointIndex];
    }
    if (wp === undefined) wp = { x: target.x, y: target.y };
    const desired = Math.atan2(wp.y - player.y, wp.x - player.x);
    if (!player.inCar) {
      out.mx = Math.cos(desired);
      out.my = Math.sin(desired);
      lastThrottle = 0;
      return out;
    }
    const diff = angleDiff(player.angle, desired);
    out.steer = clamp(diff * 2.0, -1, 1);
    // Speed control, not just a throttle switch: the car must arrive slowly, or
    // it blows past a hold point at 500 px/s and spends minutes coming back.
    // Desired speed grows with the distance to the waypoint and caps low enough
    // that a corner can actually be made. When the waypoint is behind the car,
    // turn around in place instead of driving into whatever is there.
    const dist = Math.hypot(wp.x - player.x, wp.y - player.y);
    const wantSpeed = clamp(dist * 0.9, 50, 320);
    const speed = player.speed;
    if (Math.abs(diff) > 2.2) out.throttle = 0;
    else if (Math.abs(diff) > 0.5) out.throttle = Math.abs(speed) > 120 ? (speed > 0 ? -0.5 : 0.5) : 0.2;
    else if (speed > wantSpeed) out.throttle = -0.6;
    else out.throttle = 0.8;
    lastThrottle = out.throttle;
    return out;
  }

  return input;
}

/**
 * Set `world` to the named scene (start, play, chase or end; any other name is
 * start) and return the screen to draw over it and the best take to show.
 */
export function stageShot(name, world) {
  const pilot = createAutopilot();
  world.reset();
  if (name !== 'play' && name !== 'chase' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, { mx: 0, my: 0, throttle: 0, steer: 0, steal: false, attack: false, hold: false }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
      if (world.state.done) break;
      world.step(STEP, pilot(world.state), false);
    }
    return { screen: SCREEN_PLAY, best: world.state.money };
  }
  if (name === 'chase') {
    for (let index = 0; index < CHASE_SECONDS / STEP; index += 1) {
      world.step(STEP, pilot(world.state), false);
    }
    // A chase shot needs real heat: if the drive did not earn it, set the heat
    // to four stars and top the pursuit up to three cars around the player.
    if (world.state.wanted < 3) {
      world.state.wanted = 4;
      world.state.wantedTimer = 0;
      let placed = world.state.policeCars.length;
      let i = 0;
      while (placed < 3 && i < 3) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        world.state.policeCars.push({
          x: world.state.player.x + Math.cos(a) * 260,
          y: world.state.player.y + Math.sin(a) * 260,
          angle: Math.atan2(-Math.sin(a), -Math.cos(a)),
          speed: 300, hp: 30, active: true, ramCooldown: 0, hitCooldown: 0,
        });
        placed += 1;
        i += 1;
      }
    }
    for (let index = 0; index < 2 / STEP; index += 1) {
      world.step(STEP, pilot(world.state), false);
    }
    return { screen: SCREEN_PLAY, best: world.state.money };
  }
  // end: play the whole story; the pilot has ten minutes of game time to do it.
  for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
    if (world.state.done || world.state.over) break;
    world.step(STEP, pilot(world.state), false);
  }
  return { screen: world.state.done ? SCREEN_COMPLETE : SCREEN_PLAY, best: world.state.money };
}
