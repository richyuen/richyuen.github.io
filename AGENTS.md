# AGENTS.md

## Purpose
This repository hosts a personal portfolio homepage (`index.html`) plus several standalone web projects in the root and one modular game app in `RoadRageQix/`.

## Repository Layout
- `index.html`, `styles.css`, `script.js`: portfolio landing page and shared site styling/behavior.
- `math-game.html`, `weather-dashboard.html`, `sp500-dashboard.html`, `recipe-finder.html`: standalone project pages.
- `RoadRageQix/`: modular canvas game with separate source files under `RoadRageQix/src/`.
- `favicon.svg`, `CNAME`: site assets/config.

## Working Rules
1. Keep existing visual style and class naming unless a task explicitly asks for redesign.
2. When adding a new project to the homepage:
   - Add a matching nav entry in the `<nav class="nav">` block.
   - Add a new project card in `#projects .projects-grid`.
   - Ensure card link and nav link point to the same target path.
3. Prefer minimal, surgical edits over broad refactors.
4. Do not break standalone pages by introducing shared build tooling unless requested.
5. Use relative links that work when deployed as static files (GitHub Pages style hosting).

## RoadRageQix Notes
- Entry point: `RoadRageQix/index.html`
- Main runtime: `RoadRageQix/src/main.js`
- Core game state/logic: `RoadRageQix/src/game.js`
- Rendering: `RoadRageQix/src/render.js`
- Input handling: `RoadRageQix/src/input.js`
- Collision/helpers: `RoadRageQix/src/collision.js`, `RoadRageQix/src/entities.js`

When editing gameplay behavior, keep `render_game_to_text` and `advanceTime` hooks intact in `main.js` since they are useful for scripted verification.

## Local Verification
1. Serve the repo from a local HTTP server (recommended for module-based pages):
   - `python -m http.server 8000`
2. Open:
   - `http://localhost:8000/index.html`
   - `http://localhost:8000/RoadRageQix/`
3. Verify homepage links, project cards, and menu entries after any navigation/content changes.
