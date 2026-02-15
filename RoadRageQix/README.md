# Road Rage: Wasteland Claim (RoadRageQix)

Arcade territory-claiming game inspired by Qix, implemented as a modular HTML5 canvas app with a Mad Max visual direction.

## Folder Layout

- `index.html`: app shell, menu overlay, and touch controls markup.
- `styles.css`: game visuals plus responsive touch and fullscreen behavior.
- `src/main.js`: bootstraps the loop, input wiring, fullscreen, and orientation mode handling.
- `src/game.js`: deterministic update loop, claim logic, damage/win/loss handling, and state serialization.
- `src/render.js`: full render pipeline (terrain, walls, enemy fire, sparks, smoke, HUD).
- `src/input.js`: keyboard + virtual controls input abstraction with portrait remapping.
- `src/entities.js`, `src/collision.js`: entity factories and collision math helpers.
- `progress.md`: dated implementation and tuning history.
- `output/`: generated validation screenshots/state snapshots.

## Controls

- Keyboard movement: `WASD` or arrow keys.
- Start in menu: `Enter` or `Space` (or click/tap Start button).
- Ignition nitro burst while playing: `Space` or `Shift`.
- Restart after win/loss: `Space` (or touch Ignition button).
- Fullscreen: `F` to toggle, `Esc` to exit.
- Touch devices:
  - left virtual joystick to steer
  - right Ignition button:
    - menu/end states: start/restart
    - during gameplay: nitro burst
  - fullscreen button

## Gameplay Rules

- Drive on claimed boundary safely.
- Enter open territory to start a trail.
- Reconnect trail to claimed territory to close and claim area.
- Enemy touching player or active trail costs a life.
- Sparks are visual only (non-damaging) but collide with claimed walls.
- Ignition nitro gives a temporary speed boost, then cooldown.
- Win at `75%` claimed territory.

## Orientation and Query Overrides

- Portrait viewports rotate gameplay rendering by default (including non-touch environments).
- Canvas backing resolution now tracks the live viewport to prevent stretch/distortion when rotating between portrait and landscape.
- Input is remapped when portrait rotation is active.
- Debug/query overrides:
  - `?touch=1` forces touch UI mode.
  - `?portrait=1` forces portrait-rotation mode.
  - `?portrait=0` disables portrait-rotation mode.

Examples:

- `http://localhost:8000/RoadRageQix/?touch=1`
- `http://localhost:8000/RoadRageQix/?touch=1&portrait=1`

## Local Run

From repository root:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/RoadRageQix/`.

From this folder:

```bash
npm install
npm run serve
```

Then open `http://localhost:5173/`.

## Deterministic Debug Hooks

For scripted validation and captures, runtime exposes:

- `window.render_game_to_text()`
- `window.advanceTime(ms)`

These should remain stable unless intentionally versioned.
