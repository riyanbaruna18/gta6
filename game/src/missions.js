// The five-mission story: Rico Vega and Mama Luz send the player across Solmara.
// A mission is data (who, what, where, what it pays) plus one update rule. The world
// owns the loop and calls update() every step; this module only decides when a mission
// is done and what it pays. Rewards sum to $2,300.
import { PLACES } from './city.js';
import { REWARDS } from './config.js';

export const EVENT_MISSION = 1;
export const EVENT_COMPLETE = 2;

export const MISSION_DEFS = [
  {
    id: 'wheels',
    name: 'First Wheels',
    giver: 'Rico Vega',
    brief: 'Steal any car. Walk up to traffic and press F.',
    reward: REWARDS[0],
    target: null,
  },
  {
    id: 'payback',
    name: 'Payback Run',
    giver: 'Mama Luz',
    brief: 'Drive to the tag point on The Strip and hold position.',
    reward: REWARDS[1],
    target: { ...PLACES.strip, radius: 70, hold: 2, key: false },
  },
  {
    id: 'pickup',
    name: 'Park Pickup',
    giver: 'Rico Vega',
    brief: 'Grab the package in Palma Park.',
    reward: REWARDS[2],
    target: { ...PLACES.park, radius: 70, hold: 1, key: false },
  },
  {
    id: 'getaway',
    name: 'Getaway',
    giver: 'Mama Luz',
    brief: 'Reach Marina Docks while the heat is on.',
    reward: REWARDS[3],
    target: { ...PLACES.docks, radius: 80, hold: 1, key: false },
    heat: 2,
  },
  {
    id: 'score',
    name: 'The Big Score',
    giver: 'Rico Vega',
    brief: 'Hold Q at the Solmara Bank vault for 5 seconds, then reach Beachfront.',
    reward: REWARDS[4],
    target: { ...PLACES.bank, radius: 70, hold: 5, key: true },
    escape: { ...PLACES.beach, radius: 80 },
  },
];

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function createMissions() {
  const state = { index: 0, holdTimer: 0, phase: 'target', toast: '' };

  function current() {
    return MISSION_DEFS[state.index] ?? null;
  }

  function start() {
    state.index = 0;
    state.holdTimer = 0;
    state.phase = 'target';
    state.toast = '';
  }

  /**
   * Advance the story one step. `s` is the world's state, `input` the frame's input.
   * Returns EVENT_MISSION when a mission pays out, EVENT_COMPLETE when the story ends,
   * and writes the heat the mission demands onto `s` through the returned `heat` field
   * (the world applies it: starting Getaway puts the cops on the player).
   */
  function update(s, input, dt) {
    const def = current();
    if (def === null || s.done) return { events: 0, heat: 0 };
    let events = 0;
    let heat = 0;

    if (def.id === 'wheels') {
      if (s.player.inCar) {
        return complete(s, def);
      }
      return { events: 0, heat: 0 };
    }

    if (def.heat !== undefined && state.phase === 'target' && !state.heatApplied) {
      state.heatApplied = true;
      heat = def.heat;
    }

    const target = state.phase === 'escape' ? def.escape : def.target;
    const d = distance(s.player.x, s.player.y, target.x, target.y);
    if (d <= target.radius) {
      // The vault is the only hold that needs the key: the player must stand at the
      // vault holding Q. Every other hold just needs the player to stay in the circle.
      const holding = def.target.key === true && state.phase === 'target' ? input.hold === true : true;
      if (holding) {
        state.holdTimer += dt;
        if (state.holdTimer >= (state.phase === 'escape' ? 1 : def.target.hold)) {
          if (def.id === 'score' && state.phase === 'target') {
            // The vault is cracked: the heat jumps to 3 stars and the run to the beach begins.
            state.phase = 'escape';
            state.holdTimer = 0;
            state.toast = 'Vault cracked! Lose the heat — reach Beachfront.';
            return { events: 0, heat: 3, vault: true };
          }
          return complete(s, def);
        }
      } else {
        state.holdTimer = 0;
      }
    } else {
      state.holdTimer = 0;
    }
    return { events, heat };
  }

  function complete(s, def) {
    s.money += def.reward;
    state.index += 1;
    state.holdTimer = 0;
    state.phase = 'target';
    state.heatApplied = false;
    if (state.index >= MISSION_DEFS.length) {
      s.done = true;
      state.toast = `Story complete — $${s.money} banked.`;
      return { events: EVENT_MISSION | EVENT_COMPLETE, heat: 0 };
    }
    const next = MISSION_DEFS[state.index];
    state.toast = `${def.name} done — $${def.reward}. Next: ${next.name}.`;
    return { events: EVENT_MISSION, heat: 0 };
  }

  function objectiveText() {
    const def = current();
    if (def === null) return 'Story complete';
    if (def.id === 'score' && state.phase === 'escape') return 'Escape to Beachfront';
    return `${def.name}: ${def.brief}`;
  }

  return { state, current, start, update, objectiveText };
}
