// The game's rules and state, with no drawing and no browser in it: the player on foot
// or in a stolen car, traffic, pedestrians, the police heat system, and the mission
// story. step() advances one fixed step and returns what happened as bit flags, so the
// caller can react without the world knowing about screens or sound. Nothing here
// allocates after createWorld returns.
import { CAR, CITY, PLAYER, POLICE } from './config.js';
import { AVENUES, SEA_Y, STREETS, createCity, hitsBuilding, nearestRoadPoint, pushOutOfBuildings, randomRoadPoint } from './city.js';
import { createMissions, EVENT_COMPLETE, EVENT_MISSION } from './missions.js';

export const EVENT_HIT = 4;
export const EVENT_BUSTED = 8;
export const EVENT_WANTED = 16;
export { EVENT_COMPLETE, EVENT_MISSION };

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function angleToward(angle, target, maxStep) {
  let diff = target - angle;
  while (diff > Math.PI) diff -= TAU;
  while (diff < -Math.PI) diff += TAU;
  return angle + clamp(diff, -maxStep, maxStep);
}

export function createWorld(random) {
  const city = createCity(random);
  const missions = createMissions();
  const traffic = [];
  const peds = [];
  const policeCars = [];
  const policeFoot = [];

  const player = {
    x: city.spawn.x, y: city.spawn.y, angle: 0, speed: 0,
    hp: PLAYER.hp, inCar: false, punchCooldown: 0, invulnerable: 0,
  };
  const playerCar = { x: 0, y: 0, angle: 0, speed: 0, color: '#e63946' };
  const state = {
    city, player, playerCar, traffic, peds, policeCars, policeFoot, missions,
    money: 0, wanted: 0, wantedTimer: 0, done: false, over: false,
    elapsed: 0, toast: '', toastTimer: 0,
  };

  function spawnTrafficCar(parked, x, y) {
    const point = x === undefined ? randomRoadPoint(random) : { x, y };
    const onAvenue = AVENUES.some((ax) => Math.abs(point.x - ax) < 5);
    const car = {
      x: point.x, y: point.y, angle: 0, speed: 0,
      color: ['#c9a227', '#7fb069', '#e07a5f', '#81b29a', '#f2cc8f'][Math.floor(random() * 5)],
      axis: onAvenue ? 'v' : 'h', dir: random() < 0.5 ? 1 : -1,
      parked: parked === true,
    };
    if (!car.parked) car.speed = 120 + random() * 60;
    car.angle = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    return car;
  }

  function spawnPed() {
    const point = randomRoadPoint(random);
    return {
      x: point.x, y: point.y, tx: point.x, ty: point.y,
      speed: 45 + random() * 25, color: ['#f2cc8f', '#e07a5f', '#81b29a', '#c9a227'][Math.floor(random() * 4)],
      down: 0,
    };
  }

  function reset() {
    player.x = city.spawn.x;
    player.y = city.spawn.y;
    player.angle = 0;
    player.speed = 0;
    player.hp = PLAYER.hp;
    player.inCar = false;
    player.punchCooldown = 0;
    player.invulnerable = 0;
    playerCar.speed = 0;
    traffic.length = 0;
    for (let i = 0; i < 12; i += 1) traffic.push(spawnTrafficCar(false));
    // Two parked cars near the spawn, so the first mission is always doable.
    traffic.push(spawnTrafficCar(true, 420, 300));
    traffic.push(spawnTrafficCar(true, 320, 430));
    peds.length = 0;
    for (let i = 0; i < 14; i += 1) peds.push(spawnPed());
    policeCars.length = 0;
    policeFoot.length = 0;
    missions.start();
    state.money = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.done = false;
    state.over = false;
    state.elapsed = 0;
    state.toast = '';
    state.toastTimer = 0;
  }

  function setToast(text) {
    state.toast = text;
    state.toastTimer = 4;
  }

  function raiseWanted(level) {
    if (level > state.wanted) {
      state.wanted = Math.min(5, level);
      state.wantedTimer = 0;
      return EVENT_WANTED;
    }
    return 0;
  }

  function damagePlayer(amount) {
    if (player.invulnerable > 0 || state.over) return 0;
    player.hp -= amount;
    player.invulnerable = 1.0;
    if (player.hp <= 0) {
      player.hp = 0;
      state.over = true;
      setToast('Busted! The Solmara PD got you.');
      return EVENT_HIT | EVENT_BUSTED;
    }
    return EVENT_HIT;
  }

  function nearestTrafficCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of traffic) {
      const d = Math.hypot(car.x - player.x, car.y - player.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function stealCar() {
    const car = nearestTrafficCar(PLAYER.stealRadius);
    if (car === null) return 0;
    traffic.splice(traffic.indexOf(car), 1);
    playerCar.x = car.x;
    playerCar.y = car.y;
    playerCar.angle = car.angle;
    playerCar.speed = 0;
    playerCar.color = car.color;
    player.inCar = true;
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    setToast('Car stolen! Wanted level 1.');
    return raiseWanted(1);
  }

  function exitCar() {
    const parked = spawnTrafficCar(true, playerCar.x, playerCar.y);
    parked.angle = playerCar.angle;
    traffic.push(parked);
    player.inCar = false;
    player.x = playerCar.x + 34;
    player.y = playerCar.y + 34;
    player.speed = 0;
    pushOutOfBuildings(city, player, PLAYER.radius);
    return 0;
  }

  function punch() {
    if (player.punchCooldown > 0) return 0;
    player.punchCooldown = PLAYER.punchCooldown;
    let events = 0;
    const reach = PLAYER.punchRadius;
    const fx = player.x + Math.cos(player.angle) * reach;
    const fy = player.y + Math.sin(player.angle) * reach;
    for (const officer of policeFoot) {
      if (!officer.active || officer.down > 0) continue;
      if (Math.hypot(officer.x - fx, officer.y - fy) < 40) {
        officer.down = 3;
        officer.catchTimer = 0;
        setToast('You floored a cop! Wanted level up.');
        events |= raiseWanted(state.wanted + 1);
      }
    }
    for (const ped of peds) {
      if (ped.down > 0) continue;
      if (Math.hypot(ped.x - fx, ped.y - fy) < 34) ped.down = 2;
    }
    return events;
  }

  function stepTraffic(dt) {
    for (const car of traffic) {
      if (car.parked) continue;
      if (car.axis === 'v') {
        car.y += car.dir * car.speed * dt;
        if (car.y > SEA_Y - 60) { car.dir = -1; car.angle = -Math.PI / 2; }
        if (car.y < 40) { car.dir = 1; car.angle = Math.PI / 2; }
        for (const sy of STREETS) {
          if (Math.abs(car.y - sy) < 30 && random() < 0.02) {
            car.axis = 'h';
            car.dir = random() < 0.5 ? 1 : -1;
            car.y = sy;
            car.angle = car.dir > 0 ? 0 : Math.PI;
            break;
          }
        }
      } else {
        car.x += car.dir * car.speed * dt;
        if (car.x > CITY.width - 40) { car.dir = -1; car.angle = Math.PI; }
        if (car.x < 40) { car.dir = 1; car.angle = 0; }
        for (const ax of AVENUES) {
          if (Math.abs(car.x - ax) < 30 && random() < 0.02) {
            car.axis = 'v';
            car.dir = random() < 0.5 ? 1 : -1;
            car.x = ax;
            car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
            break;
          }
        }
      }
    }
  }

  function stepPeds(dt) {
    for (const ped of peds) {
      if (ped.down > 0) { ped.down -= dt; continue; }
      const dx = ped.tx - ped.x;
      const dy = ped.ty - ped.y;
      const d = Math.hypot(dx, dy);
      if (d < 8) {
        const point = randomRoadPoint(random);
        ped.tx = clamp(point.x + (random() - 0.5) * 160, 30, CITY.width - 30);
        ped.ty = clamp(point.y + (random() - 0.5) * 160, 30, SEA_Y - 30);
        continue;
      }
      ped.x += (dx / d) * ped.speed * dt;
      ped.y += (dy / d) * ped.speed * dt;
      pushOutOfBuildings(city, ped, 10);
    }
  }

  function stepPolice(dt) {
    // Police cars: one per wanted level, up to three. A bigger pursuit would
    // melt the player's health before the story could finish.
    const wantCars = state.wanted === 0 ? 0 : Math.min(state.wanted, 3);
    while (policeCars.length < wantCars) {
      let point = randomRoadPoint(random);
      for (let tries = 0; tries < 6 && Math.hypot(point.x - player.x, point.y - player.y) < POLICE.spawnDistance; tries += 1) {
        point = randomRoadPoint(random);
      }
      policeCars.push({ x: point.x, y: point.y, angle: 0, speed: 0, hp: POLICE.carHp, active: true, ramCooldown: 0, hitCooldown: 0 });
    }
    while (policeCars.length > wantCars) policeCars.pop();

    for (const cop of policeCars) {
      if (!cop.active) continue;
      const target = Math.atan2(player.y - cop.y, player.x - cop.x);
      cop.angle = angleToward(cop.angle, target, 3.4 * dt);
      cop.speed = Math.min(POLICE.carSpeed, cop.speed + 500 * dt);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      if (pushOutOfBuildings(city, cop, 20)) cop.speed *= 0.4;
      cop.x = clamp(cop.x, 20, CITY.width - 20);
      cop.y = clamp(cop.y, 20, SEA_Y - 20);
      if (cop.ramCooldown > 0) cop.ramCooldown -= dt;
      if (cop.hitCooldown > 0) cop.hitCooldown -= dt;
      const d = Math.hypot(player.x - cop.x, player.y - cop.y);
      if (d < 56 && cop.ramCooldown <= 0) {
        cop.ramCooldown = POLICE.ramCooldown;
        cop.speed *= 0.5;
        state.lastHit |= damagePlayer(POLICE.ramDamage);
      }
      // The player ramming a cop car wrecks it; three good hits kill it.
      if (player.inCar && d < 52 && Math.abs(playerCar.speed) > 220 && cop.hitCooldown <= 0) {
        cop.hitCooldown = 0.5;
        cop.hp -= 12;
        playerCar.speed *= 0.55;
        if (cop.hp <= 0) {
          cop.active = false;
          setToast('Cop car wrecked! Wanted level up.');
          state.lastHit |= raiseWanted(state.wanted + 1);
        }
      }
    }
    for (let i = policeCars.length - 1; i >= 0; i -= 1) {
      if (!policeCars[i].active) policeCars.splice(i, 1);
    }

    // Foot police only chase a player on foot, from wanted level 2 up.
    const wantFoot = !player.inCar && state.wanted >= 2 ? Math.min(state.wanted - 1, 2) : 0;
    while (policeFoot.length < wantFoot) {
      const near = nearestRoadPoint(player.x, player.y);
      const a = random() * TAU;
      policeFoot.push({
        x: clamp(near.x + Math.cos(a) * POLICE.spawnDistance, 30, CITY.width - 30),
        y: clamp(near.y + Math.sin(a) * POLICE.spawnDistance, 30, SEA_Y - 30),
        active: true, catchTimer: 0, down: 0,
      });
    }
    while (policeFoot.length > wantFoot) policeFoot.pop();

    for (const officer of policeFoot) {
      if (!officer.active) continue;
      if (officer.down > 0) { officer.down -= dt; continue; }
      const dx = player.x - officer.x;
      const dy = player.y - officer.y;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        officer.x += (dx / d) * POLICE.footSpeed * dt;
        officer.y += (dy / d) * POLICE.footSpeed * dt;
      }
      pushOutOfBuildings(city, officer, 12);
      if (d < POLICE.catchRadius) {
        officer.catchTimer += dt;
        if (officer.catchTimer >= POLICE.catchTime) {
          state.over = true;
          setToast('Busted! The Solmara PD got you.');
          state.lastHit |= EVENT_BUSTED;
        }
      } else {
        officer.catchTimer = Math.max(0, officer.catchTimer - dt);
      }
    }
  }

  function stepPlayer(dt, input) {
    if (player.punchCooldown > 0) player.punchCooldown -= dt;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (!player.inCar) {
      const len = Math.hypot(input.mx, input.my);
      if (len > 0.01) {
        player.angle = Math.atan2(input.my, input.mx);
        player.x += (input.mx / len) * PLAYER.walkSpeed * dt;
        player.y += (input.my / len) * PLAYER.walkSpeed * dt;
        player.speed = PLAYER.walkSpeed;
      } else {
        player.speed = 0;
      }
      player.x = clamp(player.x, 20, CITY.width - 20);
      player.y = clamp(player.y, 20, SEA_Y - 20);
      pushOutOfBuildings(city, player, PLAYER.radius);
      if (input.steal) return stealCar();
      if (input.attack) return punch();
      return 0;
    }

    // Driving: throttle accelerates, steering turns with speed, brake reverses.
    if (input.throttle > 0) playerCar.speed += CAR.accel * input.throttle * dt;
    else if (input.throttle < 0) playerCar.speed += CAR.brake * input.throttle * dt;
    else playerCar.speed -= Math.sign(playerCar.speed) * Math.min(Math.abs(playerCar.speed), 260 * dt);
    playerCar.speed = clamp(playerCar.speed, -CAR.reverseMax, CAR.maxSpeed);
    const steerAuthority = clamp(Math.abs(playerCar.speed) / 160, 0.25, 1);
    playerCar.angle += input.steer * CAR.steerRate * steerAuthority * Math.sign(playerCar.speed || 1) * dt;
    const nx = playerCar.x + Math.cos(playerCar.angle) * playerCar.speed * dt;
    const ny = playerCar.y + Math.sin(playerCar.angle) * playerCar.speed * dt;
    // Axis-separated movement: a car wedged against a building's corner still
    // slides along the face instead of stopping dead, so it can re-centre on
    // the road instead of pushing the same wall forever.
    if (hitsBuilding(city, nx, ny, 16) === null) {
      playerCar.x = nx;
      playerCar.y = ny;
    } else if (hitsBuilding(city, nx, playerCar.y, 16) === null) {
      playerCar.x = nx;
    } else if (hitsBuilding(city, playerCar.x, ny, 16) === null) {
      playerCar.y = ny;
    } else {
      playerCar.speed *= 0.35;
    }
    playerCar.x = clamp(playerCar.x, 20, CITY.width - 20);
    playerCar.y = clamp(playerCar.y, 20, SEA_Y - 20);
    player.x = playerCar.x;
    player.y = playerCar.y;
    player.angle = playerCar.angle;
    player.speed = playerCar.speed;
    // Bumping traffic slows the player down and shoves the other car aside. The
    // traffic car keeps its cruise speed: cutting it permanently glued the two
    // cars together nose-to-nose, and neither could ever drive away.
    for (const car of traffic) {
      const dx = car.x - playerCar.x;
      const dy = car.y - playerCar.y;
      const d = Math.hypot(dx, dy);
      if (d < 46 && d > 0.01) {
        const push = (46 - d) / 2;
        car.x += (dx / d) * push;
        car.y += (dy / d) * push;
        playerCar.speed *= 0.6;
      }
    }
    if (input.steal) return exitCar();
    if (input.attack) playerCar.speed *= 0.5; // Handbrake.
    return 0;
  }

  /**
   * One fixed step. `input` is { mx, my, throttle, steer, steal, attack, hold }.
   * With `harmless` set (the title screen's backdrop) traffic moves but nothing
   * touches the player, no crime happens and the story does not advance.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.toastTimer > 0) state.toastTimer -= dt;
    if (state.over || state.done) return 0;
    stepTraffic(dt);
    stepPeds(dt);
    if (harmless) return 0;

    state.lastHit = 0;
    events |= stepPlayer(dt, input);
    events |= state.lastHit;
    state.lastHit = 0;
    if (state.over) return events | EVENT_BUSTED;

    stepPolice(dt);
    events |= state.lastHit;
    state.lastHit = 0;
    if (state.over) return events | EVENT_BUSTED;

    // Wanted fades one level after a quiet stretch with no new crime.
    state.wantedTimer += dt;
    if (state.wanted > 0 && state.wantedTimer >= 25) {
      state.wanted -= 1;
      state.wantedTimer = 0;
      events |= EVENT_WANTED;
    }

    const mission = missions.update(state, input, dt);
    events |= mission.events;
    if (mission.heat > 0) events |= raiseWanted(mission.heat);
    if (missions.state.toast !== '') {
      setToast(missions.state.toast);
      missions.state.toast = '';
    }
    if (state.done) events |= EVENT_COMPLETE;
    return events;
  }

  reset();
  return { state, reset, step };
}
