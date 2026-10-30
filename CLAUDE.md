# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal portfolio site (`RYWebsite`) with a holographic-foil dark landing page (near-black, white ink, slate text, pointer-tracking rainbow foil + 3D tilt cards), one standalone page, and a modular HTML5 canvas game (RoadRageQix). No build pipeline — vanilla HTML/CSS/JS served directly. Hosted on GitHub Pages.

## Repository Layout

- Root portfolio: `index.html`, `styles.css`, `script.js`
- Standalone page: `text-scroller.html`
- Site config/assets: `favicon.svg`, `CNAME`
- Game project: `RoadRageQix/` (see architecture section below)
- External projects deployed to subpaths of richardyuen.com from separate repos (not in this repo): `MOVBattle/`, `Warism/`, `Cities/` (Blox Skylines)

## Local Development

```bash
# Serve entire repo (recommended)
python -m http.server 8000
# Visit http://localhost:8000/index.html or http://localhost:8000/RoadRageQix/

# Serve game only (from RoadRageQix/)
npm install && npm run serve
# Visit http://localhost:5173/
```

No linter, no bundler, no TypeScript. ES6 modules load natively in the browser.

## Testing

Playwright (in RoadRageQix/package.json) is used for automated validation screenshots stored in `RoadRageQix/output/`. Two deterministic test hooks must be preserved:
- `window.render_game_to_text()` — text representation of game state
- `window.advanceTime(ms)` — manual time advancement (also refreshes orientation + resize for consistency)

Debug query params: `?touch=1` forces touch UI, `?portrait=1` forces portrait rotation, `?portrait=0` disables it.

## Architecture

### Portfolio (root)
`index.html` + `styles.css` + `script.js` — single-page landing with a split-flap board hero (`#flapBoard`, word list in `WORDS` in `script.js`, plays once and stops on the name; the plain `#heroName` h1 is kept for screen readers/no-JS), smooth scroll, scroll reveal, holographic tilt project cards (`initHolo` in `script.js`, `.holo-*` classes in `styles.css`), a fixed CSS aurora background (`.aurora` ribbons, colors in `--aurora-a/b/c`), and a canvas cursor trail (`#cursorTrail`, `trail` IIFE in `script.js`). Both pause when the tab is hidden and are frozen/disabled under reduced motion. Each project card is a `.holo-scene[data-reveal] > a.holo-card` block; the reveal wrapper and the tilting element must stay separate. Nav links are section anchors only (Home / Projects / Skills / Bio). `text-scroller.html` is a self-contained standalone page.

### RoadRageQix Game (`RoadRageQix/`)

Arcade territory-claiming game inspired by Qix with Mad Max aesthetic.

**Source modules** (`RoadRageQix/src/`):
- **main.js** — bootstrap, input wiring, fullscreen, orientation mode handling
- **game.js** — core game state, deterministic update loop, territory claim logic (flood-fill on Uint8Array grid), nitro system, state serialization
- **render.js** — multi-pass canvas rendering with caching, HUD (unrotated in portrait), end overlays
- **input.js** — InputController abstracting keyboard + touch + virtual inputs with portrait remapping
- **entities.js** — factory functions for player, enemies (5 variants: normal, fast, tracker, charger, boss), sparks, smoke
- **collision.js** — collision math helpers
- **audio.js** — sound effects and music
- **powerups.js** — powerup mechanics
- **themes.js** — level-specific visual themes

**Other files**:
- `RoadRageQix/index.html` — game shell, HUD/menu overlay, touch controls UI, enemy count selector
- `RoadRageQix/styles.css` — game visuals, responsive touch layout, fullscreen behavior
- `RoadRageQix/output/` — generated validation screenshots/state snapshots (do not hand-edit)
- `RoadRageQix/node_modules/` — local dependencies (do not edit)

**Key patterns**: grid-based Uint8Array terrain masks for spatial queries, reusable flood-fill buffers to reduce GC, deterministic game loop decoupled from rendering, canvas backing resolution tracks live viewport to prevent stretch/distortion, localStorage for auto-save/resume.

### Game Controls

- Movement: `WASD` or arrow keys
- Start in menu: `Enter` or `Space` (or click/tap Start button)
- Ignition nitro burst while playing: `Space` or `Shift`
- Restart after win/loss: `Space` (or touch Ignition button)
- Menu/death setup: `Left`/`Right` (also `A`/`D`) or `-`/`+` selector buttons adjust starting enemy count
- Fullscreen: `F` to toggle, `Esc` to exit
- Pause: `P` or `Esc`
- Touch: left virtual joystick to steer, right Ignition button (start/restart in menu/end, nitro during gameplay), fullscreen button

### Game Rules

- Drive on claimed boundary safely. Enter open territory to start a trail.
- Reconnect trail to claimed territory to close and claim area.
- Enemy touching player or active trail costs a life. Sparks are visual only.
- Ignition nitro gives temporary speed boost, then cooldown.
- Win target: 75% claimed territory → advances to next level with +1 enemy (lives preserved).
- Portrait viewports auto-rotate gameplay rendering; input is remapped accordingly.

## Editing Rules

1. Make targeted edits — don't refactor unrelated files.
2. Preserve the holographic-foil dark aesthetic on the portfolio (tokens in `:root` of `styles.css`) and the Mad Max aesthetic inside `RoadRageQix/`, unless redesign is requested.
3. Keep all paths relative and static-host friendly (GitHub Pages compatible).
4. Never edit `RoadRageQix/node_modules/` or `RoadRageQix/output/`.
5. When modifying homepage projects, update the `#projects .projects-grid` card in `index.html` (a `.holo-scene[data-reveal] > a.holo-card` block) and the matching link in the `#speedDial` project speed dial. The nav lists sections only, not projects.

## Development History (Portfolio)

### 2026-10-11
- Holographic foil re-theme: replaced the cyberpunk neon shell (cyan/magenta, pixel fonts, cursor trail, floating pixels, glitch hero, particle network) with the Forever Components holographic-foil card look. Removed `math-game.html`, `recipe-finder.html`, `sp500-dashboard.html`, `weather-dashboard.html`. Added WarSim and Blox Skylines cards. Nav reduced to section anchors.

### 2026-10-29
- Renamed WarSim card to Warism (`Warism/`).
- Added aurora borealis background and cursor trail, built as lookalikes of the Forever Components versions (their source is sign-in gated).
- Added a project speed dial (pink FAB, bottom-right) linking to every project; back-to-top moved above it.
- Replaced the hero name card with an amber split-flap board that flips INVESTOR → DEVELOPER → BUILDER → RICHARD YUEN and stops.

## Development History (RoadRageQix)

### 2026-02-14
- Initial implementation: core Qix-like loop (border movement, trail drawing, flood-fill claim, win at 75%, lives system), enemy with flaming spiked ball visuals, spark system with wall collisions, deterministic test hooks, fullscreen support.
- Validation + tuning: fixed boundary clamp, trail-start logic, strengthened Mad Max palette, enlarged car sprite, added claim-edge highlighting.
- Wall + flame realism: fixed grid dimension bugs (`state.cols/state.rows`), added dual-pass emissive wall strokes, multi-layer procedural fire plume, per-spark physics (drag, heat, flicker, bounce-loss, streak rendering).
- Volumetric smoke system: buoyancy, turbulence, density, growth. Heat-haze treatment around enemy.
- Touchscreen controls: virtual joystick + action buttons, `InputController` extended with virtual axis/button support, device detection + `?touch=1` override.
- Portrait rotation: 90-degree rotated rendering in portrait viewports, input remapping, `?portrait=1`/`?portrait=0` overrides. Fixed auto-rotation to work on all devices (not touch-only).

### 2026-02-15
- Portrait distortion fix: canvas backing resolution now tracks live viewport (removed hard 900x560 minimum). Orientation re-checked in render loop.
- Ignition nitro: `Space`/`Shift` activation, touch Ignition button dual-purpose (start/restart vs nitro), HUD nitro bar.
- Portrait HUD orientation: HUD/end overlays render unrotated in screen space while world stays rotated.
- Touch instruction polish: context-aware prompts (touch vs keyboard), fullscreen button capability detection + graceful disable.
- Enemy count selector + level progression: `-`/`+` selector in menu/death, `Left`/`Right` keyboard support, `enemies[]` array replacing single enemy, level advancement with +1 enemy per level, lives preserved across levels.
