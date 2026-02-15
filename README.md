# RYWebsite

Personal portfolio site with a cyberpunk landing page and multiple standalone web apps, including the modular `RoadRageQix` canvas game.

## Repository Layout

- `index.html`, `styles.css`, `script.js`: main portfolio page and shared interaction/styling.
- `math-game.html`, `weather-dashboard.html`, `sp500-dashboard.html`, `recipe-finder.html`: standalone demo pages linked from the homepage.
- `RoadRageQix/`: game project (`Road Rage: Wasteland Claim`).

### RoadRageQix Folder Map

- `RoadRageQix/index.html`: game shell, HUD/menu overlay, and touch controls UI.
- `RoadRageQix/styles.css`: game-specific visual styling and responsive touch layout.
- `RoadRageQix/src/`: modular game code (`main.js`, `game.js`, `render.js`, `input.js`, `entities.js`, `collision.js`).
- `RoadRageQix/package.json`: local tooling metadata and `serve` script.
- `RoadRageQix/progress.md`: chronological implementation/tuning log.
- `RoadRageQix/output/`: generated screenshots/state captures from validation runs.
- `RoadRageQix/node_modules/`: local dependency install directory.

Game-specific documentation lives in `RoadRageQix/README.md`.

RoadRageQix control snapshot:
- Movement: `WASD` or arrow keys.
- Ignition nitro (temporary speed burst): `Space` or `Shift`.
- Touch Ignition button: start/restart outside gameplay, nitro during gameplay.
- Menu/death setup: adjust starting enemy count with `Left/Right` or `+/-` selector buttons.
- Victory flow: automatically advances to next level with one additional enemy.

## Local Development

### Serve Entire Repo (recommended)

From repo root:

```bash
python -m http.server 8000
```

Open:

- `http://localhost:8000/index.html`
- `http://localhost:8000/RoadRageQix/`

### Serve Only RoadRageQix

From `RoadRageQix/`:

```bash
npm install
npm run serve
```

Default URL: `http://localhost:5173/`

## Updating Homepage Projects

When adding or renaming projects on the homepage, update both locations in `index.html`:

1. Add or update the menu link in `<nav class="nav">`.
2. Add or update the corresponding card in `#projects .projects-grid`.
3. Keep both links pointed to the same destination path.
4. Verify navigation from homepage to project and back.

## Documentation Map

- `README.md`: repository-level overview and workflow.
- `AGENTS.md`: repo-specific instructions for coding agents.
- `RoadRageQix/README.md`: game usage and architecture notes.
- `RoadRageQix/progress.md`: dated implementation history.
