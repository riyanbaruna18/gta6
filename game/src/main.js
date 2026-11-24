// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, busted and complete.
//
// ?seed=N fixes the city and the traffic. ?shot=start|play|chase|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_COMPLETE, EVENT_HIT, EVENT_MISSION, EVENT_WANTED } from './world.js';
import { createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { playCrash, playMissionDone, playPickup, playSiren, setEngine } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw === null) return null;
    const save = JSON.parse(raw);
    if (typeof save.money !== 'number' || typeof save.mission !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: world.state.money,
      mission: world.state.missions.state.index,
      best: Math.max(readSave()?.best ?? 0, world.state.money),
    }));
  } catch {
    // Storage can be off (private windows): the save then lasts this visit only.
  }
}

function bestTake() {
  return readSave()?.best ?? 0;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Steal a car to start the first job.');
  }

  function continueGame() {
    const save = readSave();
    if (save === null) {
      startGame();
      return;
    }
    world.reset();
    world.state.money = save.money;
    world.state.missions.state.index = save.mission;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Continuing. $${save.money} banked, job ${save.mission + 1} of 5.`);
  }

  function endGame(busted) {
    screen = busted ? SCREEN_BUSTED : SCREEN_COMPLETE;
    writeSave();
    announce(busted
      ? `Busted. $${world.state.money} banked. Best take $${bestTake()}.`
      : `Story complete. $${world.state.money} banked.`);
  }

  function handleFrame(frame) {
    if (frame.confirm && (screen === SCREEN_TITLE || screen === SCREEN_BUSTED || screen === SCREEN_COMPLETE)) {
      startGame();
    } else if (frame.continueSave && screen === SCREEN_TITLE) {
      continueGame();
    } else if (frame.pause && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused.');
    } else if ((frame.pause || frame.confirm) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function react(events) {
    if (events & EVENT_MISSION) {
      playMissionDone();
      writeSave();
    }
    if (events & EVENT_HIT) playCrash();
    if (events & EVENT_WANTED && world.state.wanted > 0) playSiren();
    if (events & EVENT_COMPLETE) endGame(false);
    else if (events & EVENT_BUSTED) endGame(true);
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, throttle: 0, steer: 0, steal: false, attack: false, hold: false }, true);
      return;
    }
    const frame = input.frameInput();
    handleFrame(frame);
    if (screen !== SCREEN_PLAY) return;
    if (frame.steal && world.state.player.inCar) playPickup();
    const events = world.step(STEP, frame, false);
    setEngine(world.state.player.inCar, Math.abs(world.state.player.speed) / 540);
    react(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, bestTake());
  }

  // Leaving the tab pauses a running game rather than letting the cops close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused.');
    }
  });

  announce('Solmara. Press Space or click to start, C to continue your save.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
