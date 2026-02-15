# AGENTS.md

## Purpose
Repository-specific instructions for coding agents working in `C:\Git\RYWebsite`.

This repo is a static portfolio site plus a modular HTML5 game project (`RoadRageQix`).

## Current Repository Map

- Root portfolio:
  - `index.html`, `styles.css`, `script.js`
  - standalone pages: `math-game.html`, `weather-dashboard.html`, `sp500-dashboard.html`, `recipe-finder.html`
  - site config/assets: `favicon.svg`, `CNAME`
- Game project:
  - `RoadRageQix/index.html`, `RoadRageQix/styles.css`
  - gameplay code: `RoadRageQix/src/*.js`
  - package metadata: `RoadRageQix/package.json`, `RoadRageQix/package-lock.json`
  - docs/log: `RoadRageQix/README.md`, `RoadRageQix/progress.md`
  - generated artifacts: `RoadRageQix/output/`
  - local dependencies: `RoadRageQix/node_modules/`

## Editing Rules

1. Make targeted edits; do not refactor unrelated files.
2. Preserve the existing visual direction unless a redesign is explicitly requested.
3. Keep all paths static-host friendly (relative links that work under GitHub Pages style hosting).
4. Never edit generated dependency/vendor files under `RoadRageQix/node_modules/`.
5. Treat files under `RoadRageQix/output/` as generated artifacts; do not hand-edit them.

## Homepage Project Integration Rule

When adding/removing/updating a project on the portfolio homepage, update both:

1. nav entry inside `<nav class="nav">` in `index.html`
2. project card inside `#projects .projects-grid` in `index.html`

Both links must target the same path.

## RoadRageQix Runtime Notes

- Entry point: `RoadRageQix/index.html`
- App bootstrap: `RoadRageQix/src/main.js`
- Core game state/logic: `RoadRageQix/src/game.js`
- Rendering: `RoadRageQix/src/render.js`
- Input: `RoadRageQix/src/input.js`
- Entities/collision helpers: `RoadRageQix/src/entities.js`, `RoadRageQix/src/collision.js`

Current gameplay controls to preserve unless asked otherwise:
- Move: `WASD` / arrow keys.
- Ignition nitro: `Space` or `Shift` while playing.
- Touch Ignition button: start/restart in menu/end states, nitro during gameplay.

Keep deterministic test hooks intact unless explicitly asked to remove/rename:

- `window.render_game_to_text()`
- `window.advanceTime(ms)`

## Documentation Maintenance Rule

When folder structure, run commands, or gameplay controls change, keep these files in sync in the same change set:

1. `README.md`
2. `AGENTS.md`
3. `RoadRageQix/README.md`
4. `RoadRageQix/progress.md` (append dated entry; do not rewrite history)

## Local Verification

Primary check (repo root):

```bash
python -m http.server 8000
```

Open and verify:

- `http://localhost:8000/index.html`
- `http://localhost:8000/RoadRageQix/`

Game-only alternative (from `RoadRageQix/`):

```bash
npm install
npm run serve
```
