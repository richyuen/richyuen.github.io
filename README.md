# RYWebsite

Personal portfolio site with a cyberpunk-styled landing page and multiple standalone web projects.

## Project Structure

- `index.html`: portfolio homepage with navigation, project cards, bio, and contact sections.
- `styles.css`, `script.js`: shared homepage styling and interactions.
- `math-game.html`: 5th Grade Math Challenge.
- `weather-dashboard.html`: weather dashboard demo.
- `sp500-dashboard.html`: S&P 500 dashboard demo.
- `recipe-finder.html`: recipe finder demo.
- `RoadRageQix/`: modular HTML5 canvas game (`Road Rage: Wasteland Claim`).

## RoadRageQix Structure

- `RoadRageQix/index.html`: game shell and overlays.
- `RoadRageQix/styles.css`: game-specific styling.
- `RoadRageQix/src/main.js`: bootstrap loop and input wiring.
- `RoadRageQix/src/game.js`: game state, updates, win/loss logic.
- `RoadRageQix/src/render.js`: rendering pipeline.
- `RoadRageQix/src/input.js`: keyboard/touch input controller.
- `RoadRageQix/src/collision.js`, `RoadRageQix/src/entities.js`: utility/game entity helpers.

## Local Development

Use a local HTTP server so module-based pages run consistently:

```bash
python -m http.server 8000
```

Then open:

- `http://localhost:8000/index.html`
- `http://localhost:8000/RoadRageQix/`

## Updating Homepage Projects

When adding a new project, update both locations in `index.html`:

1. Add a nav link in `<nav class="nav">`.
2. Add a project card in `#projects .projects-grid`.
3. Keep both links pointed to the same target URL/path.

## Agent Guidance

Repository-specific agent instructions are in `AGENTS.md`.
