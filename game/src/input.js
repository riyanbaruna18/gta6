// Keyboard and pointer input. Held keys give movement and driving; one-shot presses
// (start, pause, steal, punch, continue) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice. Q is held
// for the vault, so it is read as a level, not a press.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_STEAL = 4;
export const ACTION_ATTACK = 8;
export const ACTION_CONTINUE = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const STEAL = new Set(['KeyF']);
const HOLD = new Set(['KeyQ']);
const CONTINUE = new Set(['KeyC']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      held.add(event.code);
    } else if (HOLD.has(event.code)) {
      held.add(event.code);
    } else if (CONFIRM.has(event.code)) {
      // Space is both "confirm" on the menus and "punch / handbrake" while playing;
      // the loop uses whichever fits the screen it is on.
      if (!event.repeat) actions |= ACTION_CONFIRM | ACTION_ATTACK;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (STEAL.has(event.code)) {
      if (!event.repeat) actions |= ACTION_STEAL;
    } else if (CONTINUE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONTINUE;
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  function has(codes) {
    for (const code of codes) if (held.has(code)) return true;
    return false;
  }

  return {
    /** The frame's driving/walking input for the world: { mx, my, throttle, steer, steal, attack, hold }. */
    frameInput() {
      const mx = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      const my = (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0);
      const taken = actions;
      actions = 0;
      return {
        mx,
        my,
        throttle: (has(UP) ? 1 : 0) - (has(DOWN) ? 1 : 0),
        steer: (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0),
        steal: (taken & ACTION_STEAL) !== 0,
        attack: (taken & ACTION_ATTACK) !== 0,
        hold: has(HOLD),
        confirm: (taken & ACTION_CONFIRM) !== 0,
        pause: (taken & ACTION_PAUSE) !== 0,
        continueSave: (taken & ACTION_CONTINUE) !== 0,
      };
    },
  };
}
