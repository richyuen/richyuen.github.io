import { circleIntersectsMask, circleIntersectsSolid, clamp, cellToIndex, toCell } from "./collision.js";
import { createEnemy, createPlayer, createSmoke, createSpark } from "./entities.js";
import { renderFrame, renderOverlay, renderWorld } from "./render.js";
import { createPowerup, createActivePowerupEffect, POWERUP_TYPES } from "./powerups.js";
import { getThemeForLevel } from "./themes.js";
import * as audio from "./audio.js";

export const config = {
  cell: 8,
  worldWidth: 960,
  worldHeight: 640,
  initialLives: 3,
  ignitionNitroDuration: 1.35,
  ignitionNitroMultiplier: 1.85,
  ignitionNitroCooldown: 3.4,
  minSelectableEnemies: 1,
  maxSelectableEnemies: 8,
  winClaimPercent: 0.75,
  playerInvulnSeconds: 1.2,
  enemySpeedMin: 165,
  enemySpeedMax: 205,
  sparkSpawnRate: 72,
  maxSparks: 760,
  smokeSpawnRate: 32,
  maxSmoke: 320,
  powerupSpawnInterval: 5,
  maxPowerups: 4,
};

const cols = Math.floor(config.worldWidth / config.cell);
const rows = Math.floor(config.worldHeight / config.cell);
const interiorCellCount = (cols - 2) * (rows - 2);

// Reusable flood-fill buffer to reduce GC pressure
const floodBuffer = new Uint8Array(cols * rows);

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function clampSelectableEnemyCount(value) {
  return Math.max(config.minSelectableEnemies, Math.min(config.maxSelectableEnemies, Math.floor(value)));
}

/** Enemy variant types for higher levels */
const ENEMY_VARIANTS = {
  normal: { radiusMul: 1, speedMul: 1, spikeCount: 14, color: null },
  fast: { radiusMul: 0.7, speedMul: 1.4, spikeCount: 10, color: "#44ddff" },
  tracker: { radiusMul: 0.85, speedMul: 1.0, spikeCount: 12, color: "#ff44cc" },
  charger: { radiusMul: 1.15, speedMul: 0.9, spikeCount: 18, color: "#ff3333" },
};

function pickEnemyVariant(level, index) {
  if (level < 3) return "normal";
  if (level < 5) {
    return index > 0 && Math.random() < 0.35 ? "fast" : "normal";
  }
  const roll = Math.random();
  if (roll < 0.25) return "fast";
  if (roll < 0.45) return "tracker";
  if (roll < 0.6) return "charger";
  return "normal";
}

function buildEnemyWave(count, level) {
  const safeCount = Math.max(1, Math.floor(count));
  const enemies = [];
  const centerX = config.worldWidth * 0.5;
  const centerY = config.worldHeight * 0.5;
  const ringRadius = Math.min(config.worldWidth, config.worldHeight) * 0.18;

  for (let i = 0; i < safeCount; i += 1) {
    const t = safeCount > 1 ? i / safeCount : 0;
    const angle = t * Math.PI * 2 + randomRange(-0.18, 0.18);
    const spread = safeCount > 1 ? ringRadius : 0;
    const x = clamp(centerX + Math.cos(angle) * spread, config.cell * 4, config.worldWidth - config.cell * 4);
    const y = clamp(centerY + Math.sin(angle) * spread, config.cell * 4, config.worldHeight - config.cell * 4);
    const variant = pickEnemyVariant(level, i);
    const def = ENEMY_VARIANTS[variant];
    const enemy = createEnemy(x, y);
    enemy.variant = variant;
    enemy.radius = Math.round(enemy.radius * def.radiusMul);
    enemy.spikeCount = def.spikeCount;
    enemy.variantColor = def.color;
    const speed = Math.hypot(enemy.vx, enemy.vy) * def.speedMul;
    const a = Math.atan2(enemy.vy, enemy.vx);
    enemy.vx = Math.cos(a) * speed;
    enemy.vy = Math.sin(a) * speed;
    // Charger state
    if (variant === "charger") {
      enemy.chargeTimer = 3 + Math.random() * 2;
      enemy.charging = false;
      enemy.chargeTimeLeft = 0;
    }
    enemies.push(enemy);
  }

  return enemies;
}

function forEachInterior(colsCount, rowsCount, fn) {
  for (let row = 1; row < rowsCount - 1; row += 1) {
    for (let col = 1; col < colsCount - 1; col += 1) {
      fn(col, row);
    }
  }
}

function buildInitialClaimedMap() {
  const claimed = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (row === 0 || col === 0 || row === rows - 1 || col === cols - 1) {
        claimed[cellToIndex(col, row, cols)] = 1;
      }
    }
  }
  return claimed;
}

function clearMask(mask, cells) {
  for (const idx of cells) {
    mask[idx] = 0;
  }
  cells.length = 0;
}

function getClaimedPercent(claimed) {
  let filled = 0;
  forEachInterior(cols, rows, (col, row) => {
    const idx = cellToIndex(col, row, cols);
    if (claimed[idx]) {
      filled += 1;
    }
  });
  return filled / interiorCellCount;
}

function findNearestOpenCell(claimed, originCol, originRow) {
  const maxRadius = Math.max(cols, rows);
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let row = originRow - radius; row <= originRow + radius; row += 1) {
      for (let col = originCol - radius; col <= originCol + radius; col += 1) {
        if (col < 1 || row < 1 || col >= cols - 1 || row >= rows - 1) {
          continue;
        }
        const idx = cellToIndex(col, row, cols);
        if (!claimed[idx]) {
          return idx;
        }
      }
    }
  }
  return null;
}

function getEnemyOpenStartIndex(claimed, enemy) {
  const enemyCol = toCell(enemy.x, config.cell, cols - 1);
  const enemyRow = toCell(enemy.y, config.cell, rows - 1);
  let startIdx = cellToIndex(enemyCol, enemyRow, cols);
  if (claimed[startIdx]) {
    startIdx = findNearestOpenCell(claimed, enemyCol, enemyRow);
  }
  return startIdx;
}

function floodFromEnemies(claimed, enemies) {
  floodBuffer.fill(0);
  const queue = [];

  for (const enemy of enemies) {
    const startIdx = getEnemyOpenStartIndex(claimed, enemy);
    if (startIdx === null || floodBuffer[startIdx]) {
      continue;
    }
    floodBuffer[startIdx] = 1;
    queue.push(startIdx);
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head];
    head += 1;

    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const next = [
      [col - 1, row],
      [col + 1, row],
      [col, row - 1],
      [col, row + 1],
    ];
    for (const [nc, nr] of next) {
      if (nc < 1 || nr < 1 || nc >= cols - 1 || nr >= rows - 1) {
        continue;
      }
      const nIdx = cellToIndex(nc, nr, cols);
      if (floodBuffer[nIdx] || claimed[nIdx]) {
        continue;
      }
      floodBuffer[nIdx] = 1;
      queue.push(nIdx);
    }
  }

  return floodBuffer;
}

/** Score helpers */
const SCORE_STORAGE_KEY = "roadrageqix_highscore";

function loadHighScore() {
  try {
    return parseInt(localStorage.getItem(SCORE_STORAGE_KEY), 10) || 0;
  } catch {
    return 0;
  }
}

function saveHighScore(score) {
  try {
    localStorage.setItem(SCORE_STORAGE_KEY, String(score));
  } catch {}
}

/** Run history - last 10 runs */
const RUN_HISTORY_KEY = "roadrageqix_runhistory";

function loadRunHistory() {
  try {
    return JSON.parse(localStorage.getItem(RUN_HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRunToHistory(run) {
  try {
    const history = loadRunHistory();
    history.unshift(run);
    if (history.length > 10) history.length = 10;
    localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

export class Game {
  constructor(canvas, menuOverlay) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.menuOverlay = menuOverlay;
    this.menuTitle = menuOverlay?.querySelector("#menu-title");
    this.menuSubtitle = menuOverlay?.querySelector("#menu-subtitle");
    this.menuStartButton = menuOverlay?.querySelector("#start-btn");
    this.menuEnemyCount = menuOverlay?.querySelector("#enemy-count-value");

    this.canvasWidth = 1280;
    this.canvasHeight = 720;
    this.layoutWidth = this.canvasWidth;
    this.layoutHeight = this.canvasHeight;
    this.rotateForPortrait = false;
    this.touchMode = false;
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;

    this.elapsedSeconds = 0;
    this.worldWidth = config.worldWidth;
    this.worldHeight = config.worldHeight;
    this.worldOffsetX = 120;
    this.worldOffsetY = 40;
    this.viewScale = 1;
    this.screenShake = 0;
    this.screenShakeTime = 0;

    // Damage flash
    this.damageFlash = 0;

    // Score
    this.score = 0;
    this.highScore = loadHighScore();
    this.scoreMultiplier = 1;
    this.comboCount = 0;

    // Claim animation
    this.claimFlashCells = [];
    this.claimFlashTime = 0;

    // Pause
    this.paused = false;

    // Tutorial
    this.tutorialShown = false;
    this.tutorialTime = 0;

    // Level transition
    this.levelTransitionTime = 0;
    this.levelTransitionDuration = 1.8;
    this.levelTransitionLevel = 1;

    // Streak system
    this.streakCount = 0;
    this.streakFlash = 0;
    this.streakBestThisRun = 0;

    // Exhaust particles
    this.exhaustParticles = [];

    // Terrain cache version (incremented to invalidate render cache)
    this.terrainCacheVersion = 0;

    this.selectedEnemyCount = config.minSelectableEnemies;
    this.currentLevel = 1;
    this.currentEnemyCount = this.selectedEnemyCount;

    // Colorblind mode
    this.highContrastMode = false;

    // Theme
    this.currentTheme = getThemeForLevel(1);

    this.state = this.createFreshState({
      enemyCount: this.currentEnemyCount,
      lives: config.initialLives,
      mode: "menu",
      level: this.currentLevel,
    });
    this.resize();
    this.syncMenuVisibility();
  }

  setPortraitRotation(enabled) {
    const next = Boolean(enabled);
    if (next === this.rotateForPortrait) {
      return;
    }
    this.rotateForPortrait = next;
    this.resize();
  }

  setTouchMode(enabled) {
    this.touchMode = Boolean(enabled);
  }

  toggleHighContrast() {
    this.highContrastMode = !this.highContrastMode;
    this.terrainCacheVersion += 1;
    return this.highContrastMode;
  }

  togglePause() {
    if (this.state.mode !== "playing") return false;
    this.paused = !this.paused;
    return this.paused;
  }

  setStartingEnemyCount(nextCount) {
    const clamped = clampSelectableEnemyCount(nextCount);
    if (clamped === this.selectedEnemyCount) {
      return this.selectedEnemyCount;
    }
    this.selectedEnemyCount = clamped;
    this.updateMenuOverlayContent();
    return this.selectedEnemyCount;
  }

  adjustStartingEnemyCount(delta) {
    return this.setStartingEnemyCount(this.selectedEnemyCount + delta);
  }

  updateMenuOverlayContent() {
    if (!this.menuOverlay) {
      return;
    }

    const inDeathScreen = this.state.mode === "lost";
    if (this.menuTitle) {
      this.menuTitle.textContent = inDeathScreen ? "WRECKED OUT" : "ROAD RAGE: WASTELAND CLAIM";
    }

    if (this.menuSubtitle) {
      this.menuSubtitle.textContent = inDeathScreen
        ? `Run ended on level ${this.currentLevel}. Score: ${this.score} | High: ${this.highScore}`
        : "Stake territory before the inferno spike-ball burns your trail.";
    }

    if (this.menuStartButton) {
      this.menuStartButton.textContent = inDeathScreen ? "Restart Run" : "Start Engine";
    }

    if (this.menuEnemyCount) {
      this.menuEnemyCount.textContent = String(this.selectedEnemyCount);
    }
  }

  createFreshState({ enemyCount, lives, mode, level }) {
    const claimed = buildInitialClaimedMap();
    const player = createPlayer(config.worldWidth * 0.5, config.cell * 0.5);
    const enemies = buildEnemyWave(enemyCount, level);
    return {
      mode,
      level,
      lives,
      enemyCount: enemies.length,
      nitro: {
        activeSeconds: 0,
        cooldownSeconds: 0,
      },
      claimed,
      claimedPercent: getClaimedPercent(claimed),
      player,
      enemies,
      sparks: [],
      smoke: [],
      trailMask: new Uint8Array(cols * rows),
      trailCells: [],
      powerups: [],
      activePowerups: [],
      powerupSpawnTimer: 0.5,
    };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width || this.canvas.clientWidth || 1280));
    const height = Math.max(1, Math.floor(rect.height || this.canvas.clientHeight || 720));
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.layoutWidth = this.rotateForPortrait ? this.canvasHeight : this.canvasWidth;
    this.layoutHeight = this.rotateForPortrait ? this.canvasWidth : this.canvasHeight;

    const margin = 70;
    this.viewScale = Math.min(
      (this.layoutWidth - margin * 2) / this.worldWidth,
      (this.layoutHeight - margin * 2) / this.worldHeight
    );
    this.worldOffsetX = (this.layoutWidth - this.worldWidth * this.viewScale) * 0.5;
    this.worldOffsetY = (this.layoutHeight - this.worldHeight * this.viewScale) * 0.5;

    // Invalidate terrain cache on resize
    this.terrainCacheVersion += 1;
  }

  syncMenuVisibility() {
    if (!this.menuOverlay) {
      return;
    }
    const showOverlay = this.state.mode === "menu" || this.state.mode === "lost";
    this.menuOverlay.classList.toggle("hidden", !showOverlay);
    this.updateMenuOverlayContent();
  }

  startGame() {
    audio.ensureAudioResumed();
    // Attempt to start continuous audio immediately, and retry after
    // resume() completes (it's async on most browsers)
    audio.startAmbient();
    audio.startEngine();
    audio.startMusic();
    audio.startProximityTone();
    setTimeout(() => {
      audio.startAmbient();
      audio.startEngine();
      audio.startMusic();
      audio.startProximityTone();
    }, 150);
    this.currentLevel = 1;
    this.currentEnemyCount = this.selectedEnemyCount;
    this.score = 0;
    this.comboCount = 0;
    this.scoreMultiplier = 1;
    this.streakCount = 0;
    this.streakFlash = 0;
    this.streakBestThisRun = 0;
    this.exhaustParticles = [];
    this.paused = false;
    this.tutorialShown = false;
    this.tutorialTime = 0;
    this.levelTransitionTime = 0;
    this.currentTheme = getThemeForLevel(1);
    this.terrainCacheVersion += 1;
    this.state = this.createFreshState({
      enemyCount: this.currentEnemyCount,
      lives: config.initialLives,
      mode: "playing",
      level: this.currentLevel,
    });
    this.syncMenuVisibility();
  }

  restartGame() {
    this.startGame();
  }

  advanceLevel() {
    this.currentLevel += 1;
    this.currentEnemyCount += 1;
    const preservedLives = this.state.lives;
    // Level-up bonus score
    const levelBonus = this.currentLevel * 500;
    this.score += levelBonus;
    audio.playLevelUp();

    // Start level transition animation
    this.levelTransitionTime = this.levelTransitionDuration;
    this.levelTransitionLevel = this.currentLevel;
    this.currentTheme = getThemeForLevel(this.currentLevel);

    this.terrainCacheVersion += 1;
    this.exhaustParticles = [];
    this.state = this.createFreshState({
      enemyCount: this.currentEnemyCount,
      lives: preservedLives,
      mode: "playing",
      level: this.currentLevel,
    });
    this.syncMenuVisibility();
  }

  loseLife() {
    this.state.lives -= 1;
    clearMask(this.state.trailMask, this.state.trailCells);
    this.state.player.trailActive = false;
    this.screenShake = 1;
    this.screenShakeTime = 0.2;
    this.damageFlash = 0.35;
    this.comboCount = 0;
    this.streakCount = 0;
    audio.playDamage();

    // Haptic feedback
    if (this.touchMode && navigator.vibrate) {
      navigator.vibrate([80, 30, 80]);
    }

    if (this.state.lives <= 0) {
      this.state.mode = "lost";
      if (this.score > this.highScore) {
        this.highScore = this.score;
        saveHighScore(this.score);
      }
      // Save run to history
      saveRunToHistory({
        score: this.score,
        level: this.currentLevel,
        streak: this.streakBestThisRun,
        date: Date.now(),
      });
      audio.stopEngine();
      audio.stopMusic();
      audio.stopProximityTone();
      this.syncMenuVisibility();
      return;
    }

    this.resetPlayer();
    this.state.player.invuln = config.playerInvulnSeconds;
  }

  resetPlayer() {
    this.state.player.x = config.worldWidth * 0.5;
    this.state.player.y = config.cell * 0.5;
    this.state.player.vx = 0;
    this.state.player.vy = 0;
    this.state.player.angle = 0;
    this.state.player.trailActive = false;
  }

  normalizeEnemySpeed(enemy) {
    const def = ENEMY_VARIANTS[enemy.variant || "normal"];
    const minSpd = config.enemySpeedMin * def.speedMul;
    const maxSpd = config.enemySpeedMax * def.speedMul;
    // Apply slow powerup
    const slowActive = this.state.activePowerups.some(p => p.type === "slow");
    const slowMul = slowActive ? 0.55 : 1;
    const speed = Math.hypot(enemy.vx, enemy.vy);
    const targetMin = minSpd * slowMul;
    const targetMax = maxSpd * slowMul;
    if (speed < targetMin || speed > targetMax) {
      const angle = Math.atan2(enemy.vy, enemy.vx);
      const nextSpeed = clamp(speed, targetMin, targetMax);
      enemy.vx = Math.cos(angle) * nextSpeed;
      enemy.vy = Math.sin(angle) * nextSpeed;
    }
  }

  addScore(points) {
    const multiActive = this.state.activePowerups.some(p => p.type === "scoreMulti");
    const multi = multiActive ? 2 : 1;
    this.score += Math.round(points * multi * (1 + this.comboCount * 0.25));
  }

  hasActivePowerup(type) {
    return this.state.activePowerups.some(p => p.type === type);
  }

  update(dt, input) {
    this.elapsedSeconds += dt;
    if (this.screenShakeTime > 0) {
      this.screenShakeTime -= dt;
      this.screenShake = this.screenShakeTime > 0 ? this.screenShakeTime / 0.2 : 0;
    }
    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt);
    }
    if (this.claimFlashTime > 0) {
      this.claimFlashTime = Math.max(0, this.claimFlashTime - dt);
    }
    if (this.streakFlash > 0) {
      this.streakFlash = Math.max(0, this.streakFlash - dt);
    }

    // Level transition timer
    if (this.levelTransitionTime > 0) {
      this.levelTransitionTime = Math.max(0, this.levelTransitionTime - dt);
    }

    // Tutorial timer
    if (!this.tutorialShown && this.state.mode === "playing") {
      this.tutorialTime += dt;
      if (this.tutorialTime > 5) {
        this.tutorialShown = true;
      }
    }

    if (this.state.mode === "menu") {
      return;
    }

    if (this.state.mode === "lost") {
      if (input.consume("Space") || input.consume("Enter")) {
        this.restartGame();
      }
      return;
    }

    // Pause check
    if (input.consume("KeyP") || input.consume("Escape")) {
      this.togglePause();
    }

    if (this.paused) {
      return;
    }

    this.updateNitro(dt, input);
    this.updatePlayer(dt, input);
    this.updateEnemies(dt);
    this.updateSparks(dt);
    this.updateSmoke(dt);
    this.updatePowerups(dt);
    this.updateActivePowerups(dt);
    this.updateExhaustParticles(dt);
    this.updateTrailMagnet(dt);
    this.detectDamage();

    // Engine audio
    const playerSpeed = Math.hypot(this.state.player.vx, this.state.player.vy) / this.state.player.speed;
    audio.updateEngine(playerSpeed, this.state.nitro.activeSeconds > 0);

    // Dynamic music
    audio.updateMusic(this.state.claimedPercent);

    // Proximity warning
    const danger = this.getTrailDangerLevel();
    audio.updateProximityTone(danger);

    if (this.state.player.invuln > 0) {
      this.state.player.invuln = Math.max(0, this.state.player.invuln - dt);
    }
  }

  updatePlayer(dt, input) {
    const axis = input.axis();
    const { player, claimed, nitro } = this.state;
    const nitroSpeedMultiplier = nitro.activeSeconds > 0 ? config.ignitionNitroMultiplier : 1;
    const speedPowerup = this.hasActivePowerup("speed") ? 1.4 : 1;

    player.vx = axis.x * player.speed * nitroSpeedMultiplier * speedPowerup;
    player.vy = axis.y * player.speed * nitroSpeedMultiplier * speedPowerup;

    if (axis.x !== 0 || axis.y !== 0) {
      player.angle = Math.atan2(axis.y, axis.x);
    }

    const oldX = player.x;
    const oldY = player.y;
    const boundaryPad = config.cell * 0.5;
    const nextX = clamp(player.x + player.vx * dt, boundaryPad, config.worldWidth - boundaryPad);
    const nextY = clamp(player.y + player.vy * dt, boundaryPad, config.worldHeight - boundaryPad);

    const col = toCell(nextX, config.cell, cols - 1);
    const row = toCell(nextY, config.cell, rows - 1);
    const idx = cellToIndex(col, row, cols);
    const isClaimed = claimed[idx] === 1;
    const curCol = toCell(player.x, config.cell, cols - 1);
    const curRow = toCell(player.y, config.cell, rows - 1);
    const curIdx = cellToIndex(curCol, curRow, cols);
    const currentIsClaimed = claimed[curIdx] === 1;

    if (!player.trailActive) {
      if (isClaimed) {
        player.x = nextX;
        player.y = nextY;
        return;
      }
      if (currentIsClaimed && (axis.x !== 0 || axis.y !== 0)) {
        player.trailActive = true;
        player.x = nextX;
        player.y = nextY;
        this.recordTrailCell(idx);
        return;
      }
      return;
    }

    player.x = nextX;
    player.y = nextY;

    if (isClaimed) {
      player.trailActive = false;
      this.closeTrailAndClaim();
      return;
    }

    if (this.state.trailMask[idx]) {
      const last = this.state.trailCells[this.state.trailCells.length - 1];
      if (last !== idx) {
        if (!this.hasActivePowerup("shield")) {
          this.loseLife();
        }
      }
      return;
    }

    this.recordTrailCell(idx);

    if (oldX === player.x && oldY === player.y && (axis.x !== 0 || axis.y !== 0)) {
      if (!this.hasActivePowerup("shield")) {
        this.loseLife();
      }
    }
  }

  updateNitro(dt, input) {
    const { nitro } = this.state;

    if (nitro.activeSeconds > 0) {
      nitro.activeSeconds = Math.max(0, nitro.activeSeconds - dt);
      if (nitro.activeSeconds === 0 && nitro.cooldownSeconds <= 0) {
        nitro.cooldownSeconds = config.ignitionNitroCooldown;
      }
    } else if (nitro.cooldownSeconds > 0) {
      nitro.cooldownSeconds = Math.max(0, nitro.cooldownSeconds - dt);
    }

    if (input.consume("Space") || input.consume("ShiftLeft") || input.consume("ShiftRight")) {
      this.activateNitro();
    }
  }

  activateNitro() {
    if (this.state.mode !== "playing") {
      return false;
    }

    const { nitro } = this.state;
    if (nitro.activeSeconds > 0 || nitro.cooldownSeconds > 0) {
      return false;
    }

    nitro.activeSeconds = config.ignitionNitroDuration;
    this.screenShake = Math.max(this.screenShake, 0.26);
    this.screenShakeTime = Math.max(this.screenShakeTime, 0.1);
    audio.playNitro();

    if (this.touchMode && navigator.vibrate) {
      navigator.vibrate(40);
    }

    return true;
  }

  recordTrailCell(idx) {
    this.state.trailMask[idx] = 1;
    this.state.trailCells.push(idx);
  }

  closeTrailAndClaim() {
    if (this.state.trailCells.length < 2) {
      clearMask(this.state.trailMask, this.state.trailCells);
      return;
    }

    const prevPercent = this.state.claimedPercent;

    // Store cells for claim flash animation
    this.claimFlashCells = [...this.state.trailCells];

    for (const idx of this.state.trailCells) {
      this.state.claimed[idx] = 1;
      this.state.trailMask[idx] = 0;
    }
    this.state.trailCells.length = 0;

    const reachable = floodFromEnemies(this.state.claimed, this.state.enemies);
    forEachInterior(cols, rows, (col, row) => {
      const idx = cellToIndex(col, row, cols);
      if (!this.state.claimed[idx] && !reachable[idx]) {
        this.state.claimed[idx] = 1;
        this.claimFlashCells.push(idx);
      }
    });

    this.state.claimedPercent = getClaimedPercent(this.state.claimed);
    this.terrainCacheVersion += 1;

    // Claim animation timer
    this.claimFlashTime = 0.4;

    // Score for claim
    const claimDelta = this.state.claimedPercent - prevPercent;
    const claimPoints = Math.round(claimDelta * 10000);
    // Big claim bonus
    const bigBonus = claimDelta > 0.1 ? 500 : 0;
    this.comboCount += 1;
    this.streakCount += 1;
    if (this.streakCount > this.streakBestThisRun) {
      this.streakBestThisRun = this.streakCount;
    }

    // Streak reward at milestones (3, 5, 7, 10, 15, 20...)
    let streakBonus = 0;
    if (this.streakCount === 3 || this.streakCount === 5 || this.streakCount === 7 ||
        (this.streakCount >= 10 && this.streakCount % 5 === 0)) {
      streakBonus = this.streakCount * 100;
      this.streakFlash = 1.2;
      audio.playStreak();
    }

    this.addScore(claimPoints + bigBonus + streakBonus);

    audio.playClaim(this.state.claimedPercent);

    if (this.touchMode && navigator.vibrate) {
      navigator.vibrate(25);
    }

    for (const enemy of this.state.enemies) {
      const enemyCell = cellToIndex(
        toCell(enemy.x, config.cell, cols - 1),
        toCell(enemy.y, config.cell, rows - 1),
        cols
      );
      if (!this.state.claimed[enemyCell]) {
        continue;
      }
      const open = findNearestOpenCell(
        this.state.claimed,
        toCell(enemy.x, config.cell, cols - 1),
        toCell(enemy.y, config.cell, rows - 1)
      );
      if (open === null) {
        continue;
      }
      const col = open % cols;
      const row = Math.floor(open / cols);
      enemy.x = (col + 0.5) * config.cell;
      enemy.y = (row + 0.5) * config.cell;
    }

    if (this.state.claimedPercent >= config.winClaimPercent) {
      this.advanceLevel();
    }
  }

  updatePowerups(dt) {
    const st = this.state;
    // Spawn timer
    st.powerupSpawnTimer -= dt;
    if (st.powerupSpawnTimer <= 0 && st.powerups.length < config.maxPowerups) {
      st.powerupSpawnTimer = config.powerupSpawnInterval + Math.random() * 2;
      const pu = createPowerup(config.worldWidth, config.worldHeight, config.cell, st.claimed, cols);
      if (pu) {
        st.powerups.push(pu);
      }
    }

    // Age and collect
    const { player } = st;
    let write = 0;
    for (let i = 0; i < st.powerups.length; i++) {
      const pu = st.powerups[i];
      pu.life += dt;
      pu.pulse += dt * 3;
      if (pu.life >= pu.maxLife) continue;

      // Player collision
      const dx = player.x - pu.x;
      const dy = player.y - pu.y;
      if (dx * dx + dy * dy <= (player.radius + pu.radius) * (player.radius + pu.radius)) {
        this.collectPowerup(pu);
        continue;
      }

      st.powerups[write] = pu;
      write++;
    }
    st.powerups.length = write;
  }

  collectPowerup(pu) {
    audio.playPickup();

    if (this.touchMode && navigator.vibrate) {
      navigator.vibrate(20);
    }

    if (pu.type === "extraLife") {
      this.state.lives += 1;
      this.addScore(200);
    } else if (pu.type === "bomb") {
      // Bomb: stun all enemies for 2.5s, clear sparks
      audio.playBomb();
      this.screenShake = 0.8;
      this.screenShakeTime = 0.3;
      for (const enemy of this.state.enemies) {
        enemy.stunTimer = 2.5;
        enemy.preStunVx = enemy.vx;
        enemy.preStunVy = enemy.vy;
        enemy.vx = 0;
        enemy.vy = 0;
      }
      this.state.sparks.length = 0;
      this.addScore(300);
    } else {
      const effect = createActivePowerupEffect(pu.type);
      if (effect) {
        // Replace existing of same type
        const existing = this.state.activePowerups.findIndex(p => p.type === pu.type);
        if (existing >= 0) {
          this.state.activePowerups[existing].remaining = effect.remaining;
        } else {
          this.state.activePowerups.push(effect);
        }
      }
      this.addScore(150);
    }
  }

  updateActivePowerups(dt) {
    let write = 0;
    const ap = this.state.activePowerups;
    for (let i = 0; i < ap.length; i++) {
      ap[i].remaining -= dt;
      if (ap[i].remaining > 0) {
        ap[write] = ap[i];
        write++;
      }
    }
    ap.length = write;
  }

  updateEnemies(dt) {
    const playerX = this.state.player.x;
    const playerY = this.state.player.y;

    for (const enemy of this.state.enemies) {
      enemy.spin += dt * 2.2;
      enemy.firePhase += dt * 4.5;

      // Bomb stun
      if (enemy.stunTimer > 0) {
        enemy.stunTimer -= dt;
        if (enemy.stunTimer <= 0) {
          enemy.vx = enemy.preStunVx || 0;
          enemy.vy = enemy.preStunVy || 0;
          enemy.stunTimer = 0;
        }
        continue;
      }

      // Tracker variant: nudge toward player
      if (enemy.variant === "tracker") {
        const dx = playerX - enemy.x;
        const dy = playerY - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1) {
          const nudge = 35 * dt;
          enemy.vx += (dx / dist) * nudge;
          enemy.vy += (dy / dist) * nudge;
        }
      }

      // Charger variant: periodic charge toward player
      if (enemy.variant === "charger") {
        if (!enemy.charging) {
          enemy.chargeTimer -= dt;
          if (enemy.chargeTimer <= 0) {
            enemy.charging = true;
            enemy.chargeTimeLeft = 0.6;
            const dx = playerX - enemy.x;
            const dy = playerY - enemy.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1) {
              const chargeSpeed = config.enemySpeedMax * 2.2;
              enemy.vx = (dx / dist) * chargeSpeed;
              enemy.vy = (dy / dist) * chargeSpeed;
            }
          }
        } else {
          enemy.chargeTimeLeft -= dt;
          if (enemy.chargeTimeLeft <= 0) {
            enemy.charging = false;
            enemy.chargeTimer = 2.5 + Math.random() * 2;
            // Normalize back after charge
            const speed = Math.hypot(enemy.vx, enemy.vy);
            if (speed > 0) {
              const target = config.enemySpeedMax * ENEMY_VARIANTS.charger.speedMul;
              enemy.vx = (enemy.vx / speed) * target;
              enemy.vy = (enemy.vy / speed) * target;
            }
          }
        }
      }

      let bouncedX = false;
      let bouncedY = false;

      const trialX = enemy.x + enemy.vx * dt;
      if (circleIntersectsSolid(this.state.claimed, cols, rows, config.cell, trialX, enemy.y, enemy.radius)) {
        enemy.vx *= -1;
        bouncedX = true;
      } else {
        enemy.x = trialX;
      }

      const trialY = enemy.y + enemy.vy * dt;
      if (circleIntersectsSolid(this.state.claimed, cols, rows, config.cell, enemy.x, trialY, enemy.radius)) {
        enemy.vy *= -1;
        bouncedY = true;
      } else {
        enemy.y = trialY;
      }

      if (bouncedX || bouncedY) {
        const boost = randomRange(0.96, 1.05);
        enemy.vx *= boost;
        enemy.vy *= boost;
        this.screenShake = 0.32;
        this.screenShakeTime = Math.max(this.screenShakeTime, 0.08);
      }

      // Don't normalize charger while charging
      if (!(enemy.variant === "charger" && enemy.charging)) {
        this.normalizeEnemySpeed(enemy);
      }

      enemy.sparkBudget += config.sparkSpawnRate * dt;
      while (enemy.sparkBudget >= 1) {
        enemy.sparkBudget -= 1;
        if (this.state.sparks.length >= config.maxSparks) {
          break;
        }
        const travelAngle = Math.atan2(enemy.vy, enemy.vx);
        const angle = travelAngle + Math.PI + (Math.random() - 0.5) * 1.5;
        const distance = enemy.radius * (0.6 + Math.random() * 0.6);
        this.state.sparks.push(
          createSpark(
            enemy.x + Math.cos(angle) * distance,
            enemy.y + Math.sin(angle) * distance,
            angle,
            0.85 + Math.random() * 0.7
          )
        );
      }

      const speed = Math.hypot(enemy.vx, enemy.vy);
      const speedRatio = clamp(speed / config.enemySpeedMax, 0.5, 1.25);
      enemy.smokeBudget += config.smokeSpawnRate * dt * speedRatio;
      while (enemy.smokeBudget >= 1) {
        enemy.smokeBudget -= 1;
        if (this.state.smoke.length >= config.maxSmoke) {
          break;
        }
        const travelAngle = Math.atan2(enemy.vy, enemy.vx);
        const tailAngle = travelAngle + Math.PI + (Math.random() - 0.5) * 1.2;
        const tailRadius = enemy.radius + 4 + Math.random() * 8;
        const hotness = 0.65 + Math.random() * 0.45;
        this.state.smoke.push(
          createSmoke(
            enemy.x + Math.cos(tailAngle) * tailRadius,
            enemy.y + Math.sin(tailAngle) * tailRadius,
            tailAngle,
            0.65 + Math.random() * 0.6,
            hotness
          )
        );
      }
    }
  }

  updateSparks(dt) {
    const sparks = this.state.sparks;
    let write = 0;
    for (let i = 0; i < sparks.length; i += 1) {
      const spark = sparks[i];
      spark.life += dt;
      if (spark.life >= spark.maxLife) {
        continue;
      }

      spark.prevX = spark.x;
      spark.prevY = spark.y;
      spark.vx *= spark.drag;
      spark.vy *= spark.drag;
      spark.vy += 28 * dt;
      spark.vy += Math.sin((this.elapsedSeconds * 11 + spark.flicker + i * 0.07) * 1.4) * 13 * dt;
      spark.vx += Math.cos(this.elapsedSeconds * 7 + spark.flicker) * 6 * dt;

      const nextX = spark.x + spark.vx * dt;
      const nextY = spark.y + spark.vy * dt;
      let hitAny = false;

      const hitX = circleIntersectsSolid(this.state.claimed, cols, rows, config.cell, nextX, spark.y, spark.size);
      if (hitX) {
        spark.vx *= -spark.bounceLoss;
        spark.vy *= 0.95;
        spark.heat = Math.max(0.2, spark.heat * 0.9);
        hitAny = true;
      } else {
        spark.x = nextX;
      }

      const hitY = circleIntersectsSolid(this.state.claimed, cols, rows, config.cell, spark.x, nextY, spark.size);
      if (hitY) {
        spark.vy *= -spark.bounceLoss * 0.92;
        spark.vx *= 0.95;
        spark.heat = Math.max(0.2, spark.heat * 0.88);
        hitAny = true;
      } else {
        spark.y = nextY;
      }

      if (spark.x < -20 || spark.y < -20 || spark.x > config.worldWidth + 20 || spark.y > config.worldHeight + 20) {
        continue;
      }

      const lifeRatio = spark.life / spark.maxLife;
      spark.heat = Math.max(0.12, spark.heat - dt * 0.22 - lifeRatio * 0.04);

      if (hitAny && Math.random() < 0.35 && this.state.smoke.length < config.maxSmoke) {
        const impactAngle = Math.atan2(-spark.vy, -spark.vx);
        this.state.smoke.push(
          createSmoke(
            spark.x,
            spark.y,
            impactAngle + (Math.random() - 0.5) * 1.3,
            0.4 + Math.random() * 0.45,
            0.35 + spark.heat * 0.45
          )
        );
      }

      sparks[write] = spark;
      write += 1;
    }
    sparks.length = write;
  }

  updateSmoke(dt) {
    const smoke = this.state.smoke;
    let write = 0;
    for (let i = 0; i < smoke.length; i += 1) {
      const puff = smoke[i];
      puff.life += dt;
      if (puff.life >= puff.maxLife) {
        continue;
      }

      puff.prevX = puff.x;
      puff.prevY = puff.y;
      puff.vx *= 0.982;
      puff.vy *= 0.982;
      puff.vy -= (8 + puff.buoyancy * 7) * dt;
      puff.vx += Math.sin(this.elapsedSeconds * 5.3 + puff.turbulence) * 5.5 * dt;
      puff.vy += Math.cos(this.elapsedSeconds * 4.7 + puff.turbulence) * 2.5 * dt;

      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      puff.size += dt * (8 + puff.hotness * 8);

      if (puff.x < -40 || puff.y < -40 || puff.x > config.worldWidth + 40 || puff.y > config.worldHeight + 40) {
        continue;
      }

      smoke[write] = puff;
      write += 1;
    }
    smoke.length = write;
  }

  detectDamage() {
    if (this.state.mode !== "playing") {
      return;
    }

    const { enemies, player, trailMask } = this.state;
    const shielded = this.hasActivePowerup("shield");

    // Skip damage from stunned enemies
    if (player.invuln <= 0 && !shielded) {
      for (const enemy of enemies) {
        if (enemy.stunTimer > 0) continue;
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const minDist = enemy.radius + player.radius;
        if (dx * dx + dy * dy <= minDist * minDist) {
          this.loseLife();
          return;
        }
      }
    }

    if (player.trailActive && !shielded) {
      for (const enemy of enemies) {
        if (enemy.stunTimer > 0) continue;
        if (circleIntersectsMask(trailMask, cols, rows, config.cell, enemy.x, enemy.y, enemy.radius)) {
          this.loseLife();
          return;
        }
      }
    }
  }

  /** Exhaust trail particles from car */
  updateExhaustParticles(dt) {
    const { player } = this.state;
    const speed = Math.hypot(player.vx, player.vy);

    // Spawn exhaust when moving
    if (speed > 20 && this.exhaustParticles.length < 60) {
      const tailAngle = player.angle + Math.PI;
      const spawnX = player.x + Math.cos(tailAngle) * player.radius * 0.8;
      const spawnY = player.y + Math.sin(tailAngle) * player.radius * 0.8;
      this.exhaustParticles.push({
        x: spawnX + (Math.random() - 0.5) * 4,
        y: spawnY + (Math.random() - 0.5) * 4,
        vx: Math.cos(tailAngle) * (20 + Math.random() * 30),
        vy: Math.sin(tailAngle) * (20 + Math.random() * 30) - 8,
        life: 0,
        maxLife: 0.3 + Math.random() * 0.3,
        size: 2 + Math.random() * 3,
      });
    }

    // Update particles
    let write = 0;
    for (let i = 0; i < this.exhaustParticles.length; i++) {
      const p = this.exhaustParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.size += dt * 4;
      this.exhaustParticles[write] = p;
      write++;
    }
    this.exhaustParticles.length = write;
  }

  /** Trail magnet: auto-close trail when near claimed territory */
  updateTrailMagnet(dt) {
    if (!this.hasActivePowerup("trailMagnet")) return;
    if (!this.state.player.trailActive || this.state.trailCells.length < 3) return;

    const { player, claimed } = this.state;
    const col = toCell(player.x, config.cell, cols - 1);
    const row = toCell(player.y, config.cell, rows - 1);

    // Check if any neighboring cell (within 2 cells) is claimed
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const idx = cellToIndex(nc, nr, cols);
        if (claimed[idx]) {
          // Near a wall - auto close
          this.closeTrailAndClaim();
          return;
        }
      }
    }
  }

  /** Find closest enemy distance to any trail cell */
  getTrailDangerLevel() {
    if (!this.state.player.trailActive || this.state.trailCells.length === 0) return 0;
    const { enemies, trailCells } = this.state;
    let minDist = Infinity;
    for (const enemy of enemies) {
      for (let i = 0; i < trailCells.length; i += Math.max(1, Math.floor(trailCells.length / 10))) {
        const idx = trailCells[i];
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cx = (col + 0.5) * config.cell;
        const cy = (row + 0.5) * config.cell;
        const d = Math.hypot(enemy.x - cx, enemy.y - cy);
        if (d < minDist) minDist = d;
      }
    }
    // Normalize: danger increases as enemy gets closer to trail
    return clamp(1 - minDist / 200, 0, 1);
  }

  render() {
    const shakeX = this.screenShake > 0 ? Math.sin(this.elapsedSeconds * 70) * 8 * this.screenShake : 0;
    const shakeY = this.screenShake > 0 ? Math.cos(this.elapsedSeconds * 84) * 6 * this.screenShake : 0;
    const snapshot = {
      canvasWidth: this.layoutWidth,
      canvasHeight: this.layoutHeight,
      elapsedSeconds: this.elapsedSeconds,
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
      worldOffsetX: this.worldOffsetX + shakeX,
      worldOffsetY: this.worldOffsetY + shakeY,
      viewScale: this.viewScale,
      state: this.state,
      config,
      score: this.score,
      highScore: this.highScore,
      paused: this.paused,
      damageFlash: this.damageFlash,
      claimFlashCells: this.claimFlashCells,
      claimFlashTime: this.claimFlashTime,
      trailDanger: this.getTrailDangerLevel(),
      highContrastMode: this.highContrastMode,
      tutorialShown: this.tutorialShown,
      tutorialTime: this.tutorialTime,
      terrainCacheVersion: this.terrainCacheVersion,
      theme: this.currentTheme,
      levelTransitionTime: this.levelTransitionTime,
      levelTransitionDuration: this.levelTransitionDuration,
      levelTransitionLevel: this.levelTransitionLevel,
      streakCount: this.streakCount,
      streakFlash: this.streakFlash,
      exhaustParticles: this.exhaustParticles,
      runHistory: loadRunHistory(),
    };

    if (this.rotateForPortrait) {
      this.ctx.save();
      this.ctx.translate(this.canvasWidth, 0);
      this.ctx.rotate(Math.PI / 2);
      renderWorld(this.ctx, snapshot);
      this.ctx.restore();
      renderOverlay(this.ctx, {
        ...snapshot,
        touchMode: this.touchMode,
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight,
      });
    } else {
      renderFrame(this.ctx, {
        ...snapshot,
        touchMode: this.touchMode,
      });
    }

  }

  renderToText() {
    const { player, enemies, mode, sparks, smoke, lives, claimedPercent, trailCells, nitro, level, enemyCount } = this.state;
    let claimedCells = 0;
    let minClaimCol = cols;
    let minClaimRow = rows;
    let maxClaimCol = -1;
    let maxClaimRow = -1;

    forEachInterior(cols, rows, (col, row) => {
      const idx = cellToIndex(col, row, cols);
      if (!this.state.claimed[idx]) {
        return;
      }
      claimedCells += 1;
      minClaimCol = Math.min(minClaimCol, col);
      minClaimRow = Math.min(minClaimRow, row);
      maxClaimCol = Math.max(maxClaimCol, col);
      maxClaimRow = Math.max(maxClaimRow, row);
    });

    const claimedBounds =
      claimedCells > 0
        ? {
            minCol: minClaimCol,
            minRow: minClaimRow,
            maxCol: maxClaimCol,
            maxRow: maxClaimRow,
          }
        : null;

    const payload = {
      coordinateSystem: "origin=top-left,+x=right,+y=down",
      mode,
      score: this.score,
      highScore: this.highScore,
      paused: this.paused,
      player: {
        x: Number(player.x.toFixed(2)),
        y: Number(player.y.toFixed(2)),
        vx: Number(player.vx.toFixed(2)),
        vy: Number(player.vy.toFixed(2)),
        angle: Number(player.angle.toFixed(3)),
        lives,
        trailActive: player.trailActive,
        invuln: Number(player.invuln.toFixed(3)),
      },
      level: {
        number: level,
        activeEnemyCount: enemyCount,
        selectedStartingEnemyCount: this.selectedEnemyCount,
      },
      enemies: enemies.map((enemy) => ({
        x: Number(enemy.x.toFixed(2)),
        y: Number(enemy.y.toFixed(2)),
        vx: Number(enemy.vx.toFixed(2)),
        vy: Number(enemy.vy.toFixed(2)),
        radius: enemy.radius,
        variant: enemy.variant || "normal",
      })),
      enemy:
        enemies.length > 0
          ? {
              x: Number(enemies[0].x.toFixed(2)),
              y: Number(enemies[0].y.toFixed(2)),
              vx: Number(enemies[0].vx.toFixed(2)),
              vy: Number(enemies[0].vy.toFixed(2)),
              radius: enemies[0].radius,
            }
          : null,
      territory: {
        claimedPercent: Number(claimedPercent.toFixed(4)),
        claimedInteriorCells: claimedCells,
        claimedBounds,
        targetPercent: config.winClaimPercent,
        activeTrailCells: trailCells.length,
      },
      sparks: {
        count: sparks.length,
        sample: sparks.slice(0, 6).map((spark) => ({
          x: Number(spark.x.toFixed(1)),
          y: Number(spark.y.toFixed(1)),
          life: Number(spark.life.toFixed(3)),
        })),
      },
      smoke: {
        count: smoke.length,
      },
      presentation: {
        rotatedPortrait: this.rotateForPortrait,
        touchMode: this.touchMode,
        highContrastMode: this.highContrastMode,
      },
      nitro: {
        activeSeconds: Number(nitro.activeSeconds.toFixed(3)),
        cooldownSeconds: Number(nitro.cooldownSeconds.toFixed(3)),
        speedMultiplier: nitro.activeSeconds > 0 ? config.ignitionNitroMultiplier : 1,
      },
      powerups: {
        onField: this.state.powerups.length,
        active: this.state.activePowerups.map(p => ({ type: p.type, remaining: Number(p.remaining.toFixed(2)) })),
      },
    };
    return JSON.stringify(payload, null, 2);
  }
}
