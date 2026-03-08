import { circleIntersectsMask, circleIntersectsSolid, clamp, cellToIndex, toCell } from "./collision.js";
import { createEnemy, createPlayer, createSmoke, createSpark } from "./entities.js";
import { renderFrame, renderOverlay, renderWorld } from "./render.js";
import { createPowerup, createActivePowerupEffect, POWERUP_TYPES } from "./powerups.js";
import { getThemeForLevel } from "./themes.js";
import * as audio from "./audio.js";

export const GAME_VERSION = "1.1.1";

const AUTOSAVE_KEY = "roadrageqix_autosave";
const AUTOSAVE_INTERVAL = 5; // seconds between auto-saves

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
  fuseTimerDuration: 6,
  bonusZoneCount: 2,
  nearMissDistance: 35,
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
  normal: { radiusMul: 1, speedMul: 1, spikeCount: 12, color: null },
  fast: { radiusMul: 0.7, speedMul: 1.4, spikeCount: 10, color: "#44ddff" },
  tracker: { radiusMul: 0.85, speedMul: 1.0, spikeCount: 12, color: "#ff44cc" },
  charger: { radiusMul: 1.15, speedMul: 0.9, spikeCount: 18, color: "#ff3333" },
  boss: { radiusMul: 2.2, speedMul: 0.55, spikeCount: 24, color: "#ffaa00" },
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
  const isBossLevel = level >= 4 && level % 4 === 0;
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

  // Boss levels: add a boss enemy
  if (isBossLevel) {
    const bDef = ENEMY_VARIANTS.boss;
    const boss = createEnemy(centerX, centerY);
    boss.variant = "boss";
    boss.radius = Math.round(boss.radius * bDef.radiusMul);
    boss.spikeCount = bDef.spikeCount;
    boss.variantColor = bDef.color;
    boss.bossHP = 3 + Math.floor(level / 4); // 4HP at level 4, 5HP at level 8, etc.
    boss.bossMaxHP = boss.bossHP;
    boss.bossPhase = 0; // 0=roam, 1=charge, 2=spin
    boss.bossPhaseTimer = 3 + Math.random() * 2;
    const spd = Math.hypot(boss.vx, boss.vy) * bDef.speedMul;
    const ba = Math.atan2(boss.vy, boss.vx);
    boss.vx = Math.cos(ba) * spd;
    boss.vy = Math.sin(ba) * spd;
    enemies.push(boss);
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
    if (enemy.dead) continue; // Skip dead enemies
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

/** Car skins — now with gameplay stats */
export const CAR_SKINS = [
  { id: "default", name: "Rusty Red", body: "#82311d", accent: "#5f2617", threshold: 0, speedMul: 1, radiusMul: 1, nitroDurMul: 1 },
  { id: "chrome", name: "Chrome", body: "#888899", accent: "#666677", threshold: 5000, speedMul: 1.08, radiusMul: 0.95, nitroDurMul: 1 },
  { id: "midnight", name: "Midnight", body: "#223355", accent: "#112244", threshold: 15000, speedMul: 1.15, radiusMul: 0.9, nitroDurMul: 1.1 },
  { id: "toxic", name: "Toxic Green", body: "#22aa66", accent: "#118844", threshold: 30000, speedMul: 1.05, radiusMul: 1, nitroDurMul: 1.3 },
  { id: "gold", name: "Gold Rush", body: "#ddaa33", accent: "#bb8822", threshold: 50000, speedMul: 1.2, radiusMul: 0.85, nitroDurMul: 1.2 },
  { id: "phantom", name: "Phantom", body: "#443366", accent: "#332255", threshold: 80000, speedMul: 1.25, radiusMul: 0.8, nitroDurMul: 1.15 },
  { id: "inferno", name: "Inferno", body: "#cc2200", accent: "#991100", threshold: 120000, speedMul: 1.1, radiusMul: 1, nitroDurMul: 1.5 },
];

/** Skill tree — permanent upgrades bought with cumulative score */
export const SKILL_TREE = [
  { id: "speed1", name: "Turbo I", desc: "+10% base speed", cost: 5000, effect: { speedMul: 1.1 } },
  { id: "speed2", name: "Turbo II", desc: "+20% base speed", cost: 20000, requires: "speed1", effect: { speedMul: 1.2 } },
  { id: "lives1", name: "Reinforced", desc: "+1 starting life", cost: 8000, effect: { extraLives: 1 } },
  { id: "lives2", name: "Armored", desc: "+2 starting lives", cost: 30000, requires: "lives1", effect: { extraLives: 2 } },
  { id: "nitro1", name: "Fuel Tank I", desc: "+30% nitro duration", cost: 6000, effect: { nitroDurMul: 1.3 } },
  { id: "nitro2", name: "Fuel Tank II", desc: "+60% nitro duration", cost: 25000, requires: "nitro1", effect: { nitroDurMul: 1.6 } },
  { id: "bomb1", name: "Ammo Crate", desc: "Start with 2 bombs", cost: 10000, effect: { startBombs: 2 } },
  { id: "bomb2", name: "Arsenal", desc: "Start with 3 bombs", cost: 35000, requires: "bomb1", effect: { startBombs: 3 } },
  { id: "magnet1", name: "Magnet Range", desc: "Powerup collect radius +50%", cost: 7000, effect: { collectRadiusMul: 1.5 } },
  { id: "combo1", name: "Combo Master", desc: "Combo timer +2s", cost: 12000, effect: { comboTimerBonus: 2 } },
];

const SKILL_TREE_KEY = "roadrageqix_skills";

/** Achievements */
export const ACHIEVEMENTS = [
  { id: "first_claim", name: "First Blood", desc: "Claim 25% territory", icon: "T" },
  { id: "daredevil", name: "Daredevil", desc: "10-claim streak", icon: "D" },
  { id: "speedrunner", name: "Speedrunner", desc: "Clear level in <30s", icon: "S" },
  { id: "survivor", name: "Survivor", desc: "Reach level 5", icon: "V" },
  { id: "bomb_squad", name: "Bomb Squad", desc: "Use 3 bombs in one run", icon: "B" },
  { id: "territory_master", name: "Land Grab", desc: "Claim >15% in one trail", icon: "L" },
];

/** Score helpers */
const SCORE_STORAGE_KEY = "roadrageqix_highscore";
const CUMULATIVE_SCORE_KEY = "roadrageqix_cumulative";
const ACHIEVEMENTS_KEY = "roadrageqix_achievements";
const SELECTED_SKIN_KEY = "roadrageqix_skin";

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

function loadCumulativeScore() {
  try { return parseInt(localStorage.getItem(CUMULATIVE_SCORE_KEY), 10) || 0; } catch { return 0; }
}
function saveCumulativeScore(score) {
  try { localStorage.setItem(CUMULATIVE_SCORE_KEY, String(score)); } catch {}
}
function loadUnlockedAchievements() {
  try { return JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY)) || []; } catch { return []; }
}
function saveAchievement(id) {
  try {
    const list = loadUnlockedAchievements();
    if (!list.includes(id)) { list.push(id); localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(list)); }
  } catch {}
}
function loadSelectedSkin() {
  try { return localStorage.getItem(SELECTED_SKIN_KEY) || "default"; } catch { return "default"; }
}
function saveSelectedSkin(id) {
  try { localStorage.setItem(SELECTED_SKIN_KEY, id); } catch {}
}

const SETTINGS_KEY = "roadrageqix_settings";
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

function loadSkills() {
  try { return JSON.parse(localStorage.getItem(SKILL_TREE_KEY)) || []; } catch { return []; }
}
function saveSkills(skills) {
  try { localStorage.setItem(SKILL_TREE_KEY, JSON.stringify(skills)); } catch {}
}
function getSkillEffect(unlockedSkills) {
  const effect = { speedMul: 1, extraLives: 0, nitroDurMul: 1, startBombs: 1, collectRadiusMul: 1, comboTimerBonus: 0 };
  for (const skill of SKILL_TREE) {
    if (!unlockedSkills.includes(skill.id)) continue;
    const e = skill.effect;
    if (e.speedMul) effect.speedMul = Math.max(effect.speedMul, e.speedMul);
    if (e.extraLives) effect.extraLives = Math.max(effect.extraLives, e.extraLives);
    if (e.nitroDurMul) effect.nitroDurMul = Math.max(effect.nitroDurMul, e.nitroDurMul);
    if (e.startBombs) effect.startBombs = Math.max(effect.startBombs, e.startBombs);
    if (e.collectRadiusMul) effect.collectRadiusMul = Math.max(effect.collectRadiusMul, e.collectRadiusMul);
    if (e.comboTimerBonus) effect.comboTimerBonus = Math.max(effect.comboTimerBonus, e.comboTimerBonus);
  }
  return effect;
}

function saveAutoSave(data) {
  try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data)); } catch {}
}
function loadAutoSave() {
  try { return JSON.parse(localStorage.getItem(AUTOSAVE_KEY)); } catch { return null; }
}
function clearAutoSave() {
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch {}
}

export class Game {
  constructor(canvas, menuOverlay) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.menuOverlay = menuOverlay;
    this.menuTitle = menuOverlay?.querySelector("#menu-title");
    this.menuSubtitle = menuOverlay?.querySelector("#menu-subtitle");
    this.menuStartButton = menuOverlay?.querySelector("#start-btn");
    this.menuContinueButton = menuOverlay?.querySelector("#continue-btn");
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

    // Burn zones (enemy trail fire)
    this.burnZones = [];

    // Territory decay timer


    // Kill cam
    this.killCamTime = 0;
    this.killCamPending = false;
    this.bombSlowMoTime = 0;

    // Claim particles
    this.claimParticles = [];

    // Shockwave rings from bomb
    this.shockwaves = [];

    // CRT filter
    this.crtEnabled = false;

    // Car skin
    this.selectedSkin = loadSelectedSkin();
    this.cumulativeScore = loadCumulativeScore();

    // Achievements
    this.unlockedAchievements = loadUnlockedAchievements();
    this.achievementFlash = null; // { id, name, time }
    this.bombsUsedThisRun = 0;
    this.levelStartTime = 0;

    // Fuse timer - trail burns from behind if player takes too long
    this.fuseTimer = 0;
    this.fuseBurnIndex = 0;

    // Bonus zones - special areas worth extra points
    this.bonusZones = [];
    this.bonusZoneFlash = null; // { points, time, x, y }

    // Near-miss slow-mo
    this.nearMissTime = 0;
    this.nearMissCooldown = 0;

    // Weather particles
    this.weatherParticles = [];
    this.maxWeatherParticles = 60;

    // Enemy explosion effects (screen-space overlays)
    this.enemyExplosions = [];

    // Tire track ghost positions
    this.tireTrackGhosts = []; // { x, y, angle, age }

    // Auto-save timer
    this.autoSaveTimer = 0;

    // Combo system — escalating multiplier for quick successive claims
    this.comboTimer = 0;
    this.comboLevel = 0; // 0=no combo, 1=x1.5, 2=x2, 3=x3, 4=x4, etc.

    // Bomb inventory — collect bombs, press B to use
    this.bombInventory = 1;

    // Warp tunnels — portal pairs on opposite borders
    this.warpTunnels = [];

    // Enemy spawner cells — unclaimed zones that spawn enemies
    this.spawnerCells = [];
    this.spawnerTimer = 0;
    this.turrets = [];
    this.turretProjectiles = [];
    this.turretSpawnTimer = 0;

    // Drift trails — skid marks when turning fast
    this.driftParticles = [];
    this.debrisParticles = [];

    // Territory fill animation — paint pour effect
    this.fillWave = null; // { cells, progress, speed }

    // Skill tree
    this.unlockedSkills = loadSkills();
    this.skillEffect = getSkillEffect(this.unlockedSkills);

    // Undo death — snapshot history for rewind
    this.snapshots = [];
    this.snapshotInterval = 0.5;
    this.snapshotTimer = 0;
    this.undoAvailable = true; // one undo per life

    // Settings
    const savedSettings = loadSettings();
    this.settingsVolume = savedSettings.volume ?? 0.45;
    this.settingsShakeEnabled = savedSettings.shakeEnabled ?? true;
    audio.setMasterVolume(this.settingsVolume);

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

  hasAutoSave() {
    const save = loadAutoSave();
    return save && save.version === GAME_VERSION;
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

  toggleCRT() {
    this.crtEnabled = !this.crtEnabled;
    return this.crtEnabled;
  }

  cycleCarSkin() {
    const unlocked = CAR_SKINS.filter(s => s.threshold <= this.cumulativeScore);
    const currentIdx = unlocked.findIndex(s => s.id === this.selectedSkin);
    const nextIdx = (currentIdx + 1) % unlocked.length;
    this.selectedSkin = unlocked[nextIdx].id;
    saveSelectedSkin(this.selectedSkin);
    return this.selectedSkin;
  }

  getCarSkin() {
    return CAR_SKINS.find(s => s.id === this.selectedSkin) || CAR_SKINS[0];
  }

  checkAchievement(id) {
    if (this.unlockedAchievements.includes(id)) return;
    saveAchievement(id);
    this.unlockedAchievements = loadUnlockedAchievements();
    const def = ACHIEVEMENTS.find(a => a.id === id);
    if (def) {
      this.achievementFlash = { id, name: def.name, time: 3 };
      audio.playAnnouncerAchievement();
    }
  }

  toggleHighContrast() {
    this.highContrastMode = !this.highContrastMode;
    this.terrainCacheVersion += 1;
    return this.highContrastMode;
  }

  setVolume(v) {
    this.settingsVolume = Math.max(0, Math.min(1, v));
    audio.setMasterVolume(this.settingsVolume);
    const s = loadSettings();
    s.volume = this.settingsVolume;
    saveSettings(s);
  }

  setShakeEnabled(enabled) {
    this.settingsShakeEnabled = Boolean(enabled);
    const s = loadSettings();
    s.shakeEnabled = this.settingsShakeEnabled;
    saveSettings(s);
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
        ? `Run ended on level ${this.currentLevel}. Score: ${this.score} | High: ${this.highScore} | Total: ${this.cumulativeScore}`
        : "Stake territory before the inferno spike-ball burns your trail.";
    }

    if (this.menuStartButton) {
      this.menuStartButton.textContent = inDeathScreen ? "Restart Run" : "Start Engine";
    }

    // Show continue button on death screen (continue from current level, score resets)
    if (this.menuContinueButton) {
      if (inDeathScreen && this.currentLevel > 1) {
        this.menuContinueButton.classList.remove("hidden");
        this.menuContinueButton.textContent = `Continue from Level ${this.currentLevel} (Score Reset)`;
      } else {
        this.menuContinueButton.classList.add("hidden");
      }
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
    audio.startReverb();
    setTimeout(() => {
      audio.startAmbient();
      audio.startEngine();
      audio.startMusic();
      audio.startProximityTone();
      audio.startReverb();
    }, 150);
    this.skillEffect = getSkillEffect(this.unlockedSkills);
    this.currentLevel = 1;
    this.currentEnemyCount = this.selectedEnemyCount;
    this.score = 0;
    this.comboCount = 0;
    this.scoreMultiplier = 1;
    this.streakCount = 0;
    this.streakFlash = 0;
    this.streakBestThisRun = 0;
    this.exhaustParticles = [];
    this.burnZones = [];
    this.claimParticles = [];
    this.shockwaves = [];
    this.killCamTime = 0;
    this.killCamPending = false;
    this.bombSlowMoTime = 0;
    this.bombsUsedThisRun = 0;
    this.levelStartTime = 0;

    this.fuseTimer = 0;
    this.fuseBurnIndex = 0;
    this.nearMissTime = 0;
    this.nearMissCooldown = 0;
    this.weatherParticles = [];
    this.enemyExplosions = [];
    this.tireTrackGhosts = [];
    this.autoSaveTimer = 0;
    this.paused = false;
    this.tutorialShown = false;
    this.tutorialTime = 0;
    this.levelTransitionTime = 0;
    this.currentTheme = getThemeForLevel(1);
    this.terrainCacheVersion += 1;
    this.bonusZones = [];
    this.bonusZoneFlash = null;
    // New systems
    this.comboTimer = 0;
    this.comboLevel = 0;
    this.bombInventory = this.skillEffect.startBombs;
    this.warpTunnels = [];
    this.spawnerCells = [];
    this.spawnerTimer = 0;
    this.turrets = [];
    this.turretProjectiles = [];
    this.turretSpawnTimer = 0;
    this.driftParticles = [];
    this.debrisParticles = [];
    this.fillWave = null;
    this.snapshots = [];
    this.snapshotTimer = 0;
    this.undoAvailable = true;
    clearAutoSave();
    const startLives = config.initialLives + this.skillEffect.extraLives;
    this.state = this.createFreshState({
      enemyCount: this.currentEnemyCount,
      lives: startLives,
      mode: "playing",
      level: this.currentLevel,
    });
    this.spawnBonusZones();
    this.spawnWarpTunnels();
    this.spawnSpawnerCells();
    this.syncMenuVisibility();
  }

  restartGame() {
    this.startGame();
  }

  /** Continue run from current level but reset score to 0 */
  continueGame() {
    audio.ensureAudioResumed();
    audio.startAmbient();
    audio.startEngine();
    audio.startMusic();
    audio.startProximityTone();
    audio.startReverb();
    setTimeout(() => {
      audio.startAmbient();
      audio.startEngine();
      audio.startMusic();
      audio.startProximityTone();
      audio.startReverb();
    }, 150);

    // Keep current level and enemy count, reset score and lives
    this.skillEffect = getSkillEffect(this.unlockedSkills);
    this.score = 0;
    this.comboCount = 0;
    this.scoreMultiplier = 1;
    this.streakCount = 0;
    this.streakFlash = 0;
    this.streakBestThisRun = 0;
    this.exhaustParticles = [];
    this.burnZones = [];
    this.claimParticles = [];
    this.shockwaves = [];
    this.killCamTime = 0;
    this.killCamPending = false;
    this.bombSlowMoTime = 0;
    this.bombsUsedThisRun = 0;
    this.levelStartTime = 0;

    this.fuseTimer = 0;
    this.fuseBurnIndex = 0;
    this.nearMissTime = 0;
    this.nearMissCooldown = 0;
    this.weatherParticles = [];
    this.enemyExplosions = [];
    this.tireTrackGhosts = [];
    this.autoSaveTimer = 0;
    this.paused = false;
    this.tutorialShown = true;
    this.tutorialTime = 0;
    this.levelTransitionTime = 0;
    this.currentTheme = getThemeForLevel(this.currentLevel);
    this.terrainCacheVersion += 1;
    this.bonusZones = [];
    this.bonusZoneFlash = null;
    this.comboTimer = 0;
    this.comboLevel = 0;
    this.bombInventory = this.skillEffect.startBombs;
    this.warpTunnels = [];
    this.spawnerCells = [];
    this.spawnerTimer = 0;
    this.turrets = [];
    this.turretProjectiles = [];
    this.turretSpawnTimer = 0;
    this.driftParticles = [];
    this.debrisParticles = [];
    this.fillWave = null;
    this.snapshots = [];
    this.snapshotTimer = 0;
    this.undoAvailable = true;
    clearAutoSave();
    const startLives = config.initialLives + this.skillEffect.extraLives;
    this.state = this.createFreshState({
      enemyCount: this.currentEnemyCount,
      lives: startLives,
      mode: "playing",
      level: this.currentLevel,
    });
    this.spawnBonusZones();
    this.spawnWarpTunnels();
    this.spawnSpawnerCells();
    this.syncMenuVisibility();
  }

  advanceLevel() {
    // Speedrunner achievement: level cleared in <30s
    if (this.levelStartTime > 0 && (this.elapsedSeconds - this.levelStartTime) < 30) {
      this.checkAchievement("speedrunner");
    }

    this.currentLevel += 1;
    this.currentEnemyCount += 1;
    const preservedLives = this.state.lives;
    // Level-up bonus score
    const levelBonus = this.currentLevel * 500;
    this.score += levelBonus;
    audio.playLevelUp();
    audio.playAnnouncerLevelUp();

    // Survivor achievement
    if (this.currentLevel >= 5) this.checkAchievement("survivor");

    // Explode all enemies on level completion
    for (const enemy of this.state.enemies) {
      this.spawnEnemyExplosion(enemy.x, enemy.y, enemy.variantColor,
        enemy.variant === "boss" ? 1.8 : 1);
    }
    // Dramatic slow-mo for level completion
    this.bombSlowMoTime = 1.0;

    // Start level transition animation
    this.levelTransitionTime = this.levelTransitionDuration;
    this.levelTransitionLevel = this.currentLevel;
    this.currentTheme = getThemeForLevel(this.currentLevel);

    this.terrainCacheVersion += 1;
    this.exhaustParticles = [];
    this.burnZones = [];
    this.claimParticles = [];
    this.weatherParticles = [];
    this.tireTrackGhosts = [];
    this.levelStartTime = this.elapsedSeconds;
    this.driftParticles = [];
    this.debrisParticles = [];
    this.fillWave = null;
    this.snapshots = [];
    this.snapshotTimer = 0;
    this.undoAvailable = true;

    this.fuseTimer = 0;
    this.fuseBurnIndex = 0;
    this.nearMissTime = 0;
    // Keep enemy count modest; spawner cells handle scaling
    this.state = this.createFreshState({
      enemyCount: Math.min(this.currentEnemyCount, 4),
      lives: preservedLives,
      mode: "playing",
      level: this.currentLevel,
    });
    this.spawnBonusZones();
    this.spawnWarpTunnels();
    this.spawnSpawnerCells();
    this.syncMenuVisibility();
  }

  loseLife() {
    // Undo death: if available, rewind instead of dying
    if (this.undoAvailable && this.snapshots.length > 0) {
      this.undoAvailable = false;
      this.restoreSnapshot();
      this.screenShake = 0.5;
      this.screenShakeTime = 0.15;
      this.damageFlash = 0.2;
      this.state.player.invuln = config.playerInvulnSeconds * 2;
      audio.playDamage();
      return;
    }

    this.state.lives -= 1;
    clearMask(this.state.trailMask, this.state.trailCells);
    this.state.player.trailActive = false;
    this.screenShake = 1;
    this.screenShakeTime = 0.2;
    this.damageFlash = 0.35;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.comboLevel = 0;
    this.streakCount = 0;

    // Kill cam slow-mo
    this.killCamTime = 0.3;

    audio.playDamage();

    // Haptic feedback
    if (this.touchMode && navigator.vibrate) {
      navigator.vibrate([80, 30, 80]);
    }

    if (this.state.lives <= 0) {
      this.state.mode = "lost";
      clearAutoSave();
      if (this.score > this.highScore) {
        this.highScore = this.score;
        saveHighScore(this.score);
      }
      // Update cumulative score
      this.cumulativeScore += this.score;
      saveCumulativeScore(this.cumulativeScore);
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
      audio.stopReverb();
      this.syncMenuVisibility();
      return;
    }

    // Reset undo for next life
    this.undoAvailable = true;
    this.snapshots = [];
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
    const comboMul = 1 + this.comboLevel * 0.5; // combo: x1, x1.5, x2, x2.5...
    this.score += Math.round(points * multi * comboMul * (1 + this.comboCount * 0.25));
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

    // Kill cam, bomb slow-mo & near-miss slow-mo
    let effectiveDt = dt;
    if (this.bombSlowMoTime > 0) {
      this.bombSlowMoTime = Math.max(0, this.bombSlowMoTime - dt);
      effectiveDt = dt * 0.12; // Very dramatic slow-mo for bombs
    } else if (this.killCamTime > 0) {
      this.killCamTime = Math.max(0, this.killCamTime - dt);
      effectiveDt = dt * 0.15;
    } else if (this.nearMissTime > 0) {
      effectiveDt = dt * 0.35;
    }

    // Achievement flash timer
    if (this.achievementFlash) {
      this.achievementFlash.time -= dt;
      if (this.achievementFlash.time <= 0) this.achievementFlash = null;
    }
    // Bonus zone flash timer
    if (this.bonusZoneFlash) {
      this.bonusZoneFlash.time -= dt;
      if (this.bonusZoneFlash.time <= 0) this.bonusZoneFlash = null;
    }

    this.updateNitro(dt, input);
    this.updatePlayer(dt, input);
    this.updateEnemies(effectiveDt);
    this.updateSparks(effectiveDt);
    this.updateSmoke(effectiveDt);
    this.updatePowerups(dt);
    this.updateActivePowerups(dt);
    this.updateExhaustParticles(dt);
    this.updateTrailMagnet(dt);
    this.updateBurnZones(dt);
    this.updateClaimParticles(dt);
    this.updateShockwaves(effectiveDt);
    this.updateFuseTimer(effectiveDt);
    this.updateNearMiss(effectiveDt);
    this.updateWeather(dt);
    this.updateEnemyExplosions(dt);
    this.updateTireTrackGhosts(dt);
    this.updateComboTimer(dt);
    this.updateSpawnerCells(dt);
    this.updateTurrets(dt);
    this.updateDriftParticles(dt);
    this.updateDebris(dt);
    this.updateFillWave(dt);
    this.updateSnapshots(dt);
    this.updateAutoSave(dt);
    this.detectDamage();

    // Engine audio
    const playerSpeed = Math.hypot(this.state.player.vx, this.state.player.vy) / this.state.player.speed;
    audio.updateEngine(playerSpeed, this.state.nitro.activeSeconds > 0);

    // Dynamic music + reverb
    audio.updateMusic(this.state.claimedPercent);
    audio.updateReverb(this.state.claimedPercent);

    // Proximity warning + announcer danger
    const danger = this.getTrailDangerLevel();
    audio.updateProximityTone(danger);
    if (danger > 0.8 && !this._dangerAnnounced) {
      audio.playAnnouncerDanger();
      this._dangerAnnounced = true;
    } else if (danger < 0.5) {
      this._dangerAnnounced = false;
    }

    if (this.state.player.invuln > 0) {
      this.state.player.invuln = Math.max(0, this.state.player.invuln - effectiveDt);
    }
  }

  updatePlayer(dt, input) {
    // Bomb use: press B to deploy a bomb from inventory
    if (input.consume("KeyB")) {
      this.useBomb();
    }

    const axis = input.axis();
    const { player, claimed, nitro } = this.state;
    const carSkin = this.getCarSkin();
    const carSpeedMul = carSkin.speedMul || 1;
    const skillSpeedMul = this.skillEffect.speedMul;
    const nitroSpeedMultiplier = nitro.activeSeconds > 0 ? config.ignitionNitroMultiplier : 1;
    const speedPowerup = this.hasActivePowerup("speed") ? 1.4 : 1;

    // 4x speed on claimed territory or border walls
    const curCol = toCell(player.x, config.cell, cols - 1);
    const curRow = toCell(player.y, config.cell, rows - 1);
    const curIdx = cellToIndex(curCol, curRow, cols);
    const onClaimedOrBorder = claimed[curIdx] === 1 || curCol === 0 || curCol === cols - 1 || curRow === 0 || curRow === rows - 1;
    const territorySpeedMul = onClaimedOrBorder && !player.trailActive ? 4 : 1;

    const prevAngle = player.angle;
    player.vx = axis.x * player.speed * nitroSpeedMultiplier * speedPowerup * territorySpeedMul * carSpeedMul * skillSpeedMul;
    player.vy = axis.y * player.speed * nitroSpeedMultiplier * speedPowerup * territorySpeedMul * carSpeedMul * skillSpeedMul;

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
      // If player is on unclaimed territory (e.g., after bomb), allow free movement
      if (!currentIsClaimed && (axis.x !== 0 || axis.y !== 0)) {
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
        // Hit own trail — close and claim instead of dying
        this.connectTrailToWall();
        player.trailActive = false;
        this.closeTrailAndClaim();
      }
      return;
    }

    this.recordTrailCell(idx);

    if (oldX === player.x && oldY === player.y && (axis.x !== 0 || axis.y !== 0)) {
      // Stuck while trailing — close and claim instead of dying
      this.connectTrailToWall();
      player.trailActive = false;
      this.closeTrailAndClaim();
    }

    // Warp tunnel teleport
    this.checkWarpTunnels();

    // Drift particles when turning fast on borders
    const speed = Math.hypot(player.vx, player.vy);
    const angleDiff = Math.abs(player.angle - prevAngle);
    if (speed > 300 && angleDiff > 0.3 && onClaimedOrBorder && this.driftParticles.length < 60) {
      for (let i = 0; i < 3; i++) {
        this.driftParticles.push({
          x: player.x + (Math.random() - 0.5) * 8,
          y: player.y + (Math.random() - 0.5) * 8,
          vx: -player.vx * 0.1 + (Math.random() - 0.5) * 40,
          vy: -player.vy * 0.1 + (Math.random() - 0.5) * 40 - 20,
          life: 0,
          maxLife: 0.6 + Math.random() * 0.4,
          size: 3 + Math.random() * 5,
        });
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

    const carSkin = this.getCarSkin();
    nitro.activeSeconds = config.ignitionNitroDuration * (carSkin.nitroDurMul || 1) * this.skillEffect.nitroDurMul;
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

  /** Connect the end of an open trail back to the nearest claimed cell */
  connectTrailToWall() {
    const player = this.state.player;
    let col = toCell(player.x, config.cell, cols - 1);
    let row = toCell(player.y, config.cell, rows - 1);

    // Walk toward the nearest border/claimed cell in all 4 directions, pick shortest
    const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    let bestPath = null;
    let bestLen = Infinity;

    for (const [dc, dr] of directions) {
      const path = [];
      let c = col + dc;
      let r = row + dr;
      while (c >= 0 && c < cols && r >= 0 && r < rows) {
        const idx = cellToIndex(c, r, cols);
        if (this.state.claimed[idx]) break;
        if (!this.state.trailMask[idx]) {
          path.push(idx);
        }
        c += dc;
        r += dr;
      }
      if (c >= 0 && c < cols && r >= 0 && r < rows && path.length < bestLen) {
        bestLen = path.length;
        bestPath = path;
      }
    }

    // Add connecting cells to the trail
    if (bestPath) {
      for (const idx of bestPath) {
        if (!this.state.trailMask[idx]) {
          this.state.trailMask[idx] = 1;
          this.state.trailCells.push(idx);
        }
      }
    }
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

    // Territory fill animation — paint pour wave
    if (this.claimFlashCells.length > 4) {
      this.fillWave = { cells: [...this.claimFlashCells], progress: 0, speed: 3 };
    }

    // Combo system — reset timer and increase level
    this.comboTimer = 4 + this.skillEffect.comboTimerBonus;
    this.comboLevel = Math.min(this.comboLevel + 1, 8);

    // Spawn claim particles along new edge segments
    this.spawnClaimParticles();

    // Score for claim
    const claimDelta = this.state.claimedPercent - prevPercent;
    const claimPoints = Math.round(claimDelta * 10000);
    // Big claim bonus
    const bigBonus = claimDelta > 0.1 ? 500 : 0;
    // Ricochet claim: nitro active = 10% bonus
    const nitroBonus = this.state.nitro.activeSeconds > 0 ? Math.round(claimPoints * 0.1) : 0;
    this.comboCount += 1;
    this.streakCount += 1;

    // Achievement checks
    if (this.state.claimedPercent >= 0.25) this.checkAchievement("first_claim");
    if (this.streakCount >= 10) this.checkAchievement("daredevil");
    if (claimDelta > 0.15) this.checkAchievement("territory_master");
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
      audio.playAnnouncerStreak();
    }

    this.addScore(claimPoints + bigBonus + streakBonus + nitroBonus);

    audio.playClaim(this.state.claimedPercent);

    if (this.touchMode && navigator.vibrate) {
      navigator.vibrate(25);
    }

    // Boss takes damage from large territory claims (>8%)
    if (claimDelta > 0.08) {
      for (const enemy of this.state.enemies) {
        if (enemy.variant === "boss" && !enemy.dead && enemy.bossHP > 0) {
          enemy.bossHP -= 1;
          this.screenShake = 0.6;
          this.screenShakeTime = 0.15;
          this.spawnEnemyExplosion(enemy.x, enemy.y, enemy.variantColor);
          if (enemy.bossHP <= 0) {
            enemy.dead = true;
            enemy.respawnTimer = 999;
            this.addScore(2000);
            this.spawnEnemyExplosion(enemy.x, enemy.y, "#ffffff");
          }
        }
      }
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

    // Check bonus zones
    this.checkBonusZones();

    // Reset fuse timer on successful claim
    this.fuseTimer = 0;
    this.fuseBurnIndex = 0;

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

      // Player collision (skill magnet extends range)
      const dx = player.x - pu.x;
      const dy = player.y - pu.y;
      const collectRadius = (player.radius + pu.radius) * this.skillEffect.collectRadiusMul;
      if (dx * dx + dy * dy <= collectRadius * collectRadius) {
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
    } else if (pu.type === "lightning") {
      // Lightning: destroy a random non-boss enemy instantly
      const alive = this.state.enemies.filter(e => !e.dead && e.variant !== "boss" && (!e.stunTimer || e.stunTimer <= 0));
      if (alive.length > 0) {
        const target = alive[Math.floor(Math.random() * alive.length)];
        target.dead = true;
        target.respawnTimer = 6;
        target.vx = 0;
        target.vy = 0;
        this.spawnEnemyExplosion(target.x, target.y, target.variantColor || "#ffee44", 1);
        this.shockwaves.push({ x: target.x, y: target.y, radius: 0, maxRadius: 60, life: 0, maxLife: 0.4, color: "#ffee44" });
        audio.playBomb();
        this.screenShake = 0.4;
        this.screenShakeTime = 0.15;
        this.bombSlowMoTime = 0.4;
      }
      this.addScore(400);
    } else if (pu.type === "trailClose") {
      // Trail Close: instantly close and claim current trail
      if (this.state.player.trailActive && this.state.trailCells.length >= 2) {
        this.connectTrailToWall();
        this.state.player.trailActive = false;
        this.closeTrailAndClaim();
        this.screenShake = 0.2;
        this.screenShakeTime = 0.1;
      }
      this.addScore(250);
    } else if (pu.type === "freeze") {
      // Freeze: stun all enemies for the duration
      for (const enemy of this.state.enemies) {
        if (enemy.dead) continue;
        enemy.stunTimer = 5;
        enemy.preStunVx = enemy.vx;
        enemy.preStunVy = enemy.vy;
        enemy.vx = 0;
        enemy.vy = 0;
      }
      this.addScore(200);
    } else if (pu.type === "shrink") {
      // Shrink: handled as active powerup effect — enemies rendered smaller
      const effect = createActivePowerupEffect(pu.type);
      if (effect) {
        const existing = this.state.activePowerups.findIndex(p => p.type === pu.type);
        if (existing >= 0) {
          this.state.activePowerups[existing].remaining = effect.remaining;
        } else {
          this.state.activePowerups.push(effect);
        }
      }
      this.addScore(150);
    } else if (pu.type === "bomb") {
      // Add bomb to inventory instead of using immediately
      this.bombInventory += 1;
      this.addScore(100);
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

      // Dead enemy respawn
      if (enemy.dead) {
        enemy.respawnTimer -= dt;
        if (enemy.respawnTimer <= 0) {
          enemy.dead = false;
          // Respawn at random open cell
          const open = findNearestOpenCell(this.state.claimed, Math.floor(cols / 2), Math.floor(rows / 2));
          if (open !== null) {
            const col = open % cols;
            const row = Math.floor(open / cols);
            enemy.x = (col + 0.5) * config.cell;
            enemy.y = (row + 0.5) * config.cell;
          }
          const angle = Math.random() * Math.PI * 2;
          const spd = config.enemySpeedMin;
          enemy.vx = Math.cos(angle) * spd;
          enemy.vy = Math.sin(angle) * spd;
        }
        continue;
      }

      // Bomb stun (legacy compat)
      if (enemy.stunTimer > 0) {
        enemy.stunTimer -= dt;
        if (enemy.stunTimer <= 0) {
          enemy.vx = enemy.preStunVx || 0;
          enemy.vy = enemy.preStunVy || 0;
          enemy.stunTimer = 0;
        }
        continue;
      }

      // Enemy trail burn: if enemy crosses a trail cell, mark it as burning
      if (this.state.player.trailActive && this.state.trailCells.length > 0) {
        const eCol = toCell(enemy.x, config.cell, cols - 1);
        const eRow = toCell(enemy.y, config.cell, rows - 1);
        const eIdx = cellToIndex(eCol, eRow, cols);
        if (this.state.trailMask[eIdx]) {
          // Add burn zone at this cell
          if (!this.burnZones.some(b => b.idx === eIdx)) {
            this.burnZones.push({ idx: eIdx, timeLeft: 1.5 });
          }
        }
      }

      // Boss variant: multi-phase AI
      if (enemy.variant === "boss") {
        enemy.bossPhaseTimer -= dt;
        if (enemy.bossPhaseTimer <= 0) {
          // Cycle phases: roam -> charge -> spin -> roam
          enemy.bossPhase = (enemy.bossPhase + 1) % 3;
          if (enemy.bossPhase === 0) {
            enemy.bossPhaseTimer = 3 + Math.random() * 2;
          } else if (enemy.bossPhase === 1) {
            // Charge at player
            enemy.bossPhaseTimer = 0.8;
            const dx = playerX - enemy.x;
            const dy = playerY - enemy.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1) {
              const chargeSpd = config.enemySpeedMax * 1.8;
              enemy.vx = (dx / dist) * chargeSpd;
              enemy.vy = (dy / dist) * chargeSpd;
            }
          } else {
            // Spin phase: fast rotation, moderate tracking
            enemy.bossPhaseTimer = 2 + Math.random();
          }
        }

        // Spin phase: gentle tracking + fast spin
        if (enemy.bossPhase === 2) {
          const dx = playerX - enemy.x;
          const dy = playerY - enemy.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 1) {
            const nudge = 50 * dt;
            enemy.vx += (dx / dist) * nudge;
            enemy.vy += (dy / dist) * nudge;
          }
          enemy.spin += dt * 18;
        }
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

      // Don't normalize charger while charging or boss during charge phase
      if (!(enemy.variant === "charger" && enemy.charging) &&
          !(enemy.variant === "boss" && enemy.bossPhase === 1)) {
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
    const shrinkMul = this.hasActivePowerup("shrink") ? 0.5 : 1;

    // Player is invulnerable on the border walls
    const pCol = toCell(player.x, config.cell, cols - 1);
    const pRow = toCell(player.y, config.cell, rows - 1);
    const onBorder = pCol === 0 || pCol === cols - 1 || pRow === 0 || pRow === rows - 1;

    // Skip damage from stunned/dead enemies
    if (player.invuln <= 0 && !shielded && !onBorder) {
      for (const enemy of enemies) {
        if (enemy.stunTimer > 0 || enemy.dead) continue;
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const minDist = enemy.radius * shrinkMul + player.radius;
        if (dx * dx + dy * dy <= minDist * minDist) {
          this.loseLife();
          return;
        }
      }
    }

    if (player.trailActive && !shielded) {
      for (const enemy of enemies) {
        if (enemy.stunTimer > 0 || enemy.dead) continue;
        if (circleIntersectsMask(trailMask, cols, rows, config.cell, enemy.x, enemy.y, enemy.radius)) {
          this.loseLife();
          return;
        }
      }
    }

    // Burn zone damage: player steps on burning trail cell
    if (!shielded && player.invuln <= 0) {
      const pCol = toCell(player.x, config.cell, cols - 1);
      const pRow = toCell(player.y, config.cell, rows - 1);
      const pIdx = cellToIndex(pCol, pRow, cols);
      for (const bz of this.burnZones) {
        if (bz.idx === pIdx && bz.timeLeft > 0) {
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

  /** Burn zones - fire left by enemies crossing trail */
  updateBurnZones(dt) {
    let write = 0;
    for (let i = 0; i < this.burnZones.length; i++) {
      this.burnZones[i].timeLeft -= dt;
      if (this.burnZones[i].timeLeft > 0) {
        this.burnZones[write] = this.burnZones[i];
        write++;
      }
    }
    this.burnZones.length = write;
  }


  /** Claim particles - sparks along new edges */
  updateClaimParticles(dt) {
    let write = 0;
    for (let i = 0; i < this.claimParticles.length; i++) {
      const p = this.claimParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 80 * dt;
      p.vx *= 0.97;
      this.claimParticles[write] = p;
      write++;
    }
    this.claimParticles.length = write;
  }

  spawnClaimParticles() {
    if (this.claimFlashCells.length === 0) return;
    // Spawn a few particles at random claim cells
    const count = Math.min(20, this.claimFlashCells.length);
    for (let i = 0; i < count; i++) {
      const idx = this.claimFlashCells[Math.floor(Math.random() * this.claimFlashCells.length)];
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = (col + 0.5) * config.cell;
      const y = (row + 0.5) * config.cell;
      this.claimParticles.push({
        x, y,
        vx: (Math.random() - 0.5) * 120,
        vy: -40 - Math.random() * 80,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.4,
        size: 1.5 + Math.random() * 2.5,
        hue: Math.random() < 0.5 ? 40 : 30, // gold/orange
      });
    }
  }

  /** Shockwave rings from bombs */
  updateShockwaves(dt) {
    let write = 0;
    for (let i = 0; i < this.shockwaves.length; i++) {
      const sw = this.shockwaves[i];
      sw.life += dt;
      if (sw.life >= sw.maxLife) continue;
      sw.radius = (sw.life / sw.maxLife) * sw.maxRadius;
      this.shockwaves[write] = sw;
      write++;
    }
    this.shockwaves.length = write;
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

  /** Fuse timer: trail burns from behind if player takes too long */
  updateFuseTimer(dt) {
    if (!this.state.player.trailActive || this.state.trailCells.length < 2) {
      this.fuseTimer = 0;
      this.fuseBurnIndex = 0;
      return;
    }

    this.fuseTimer += dt;
    if (this.fuseTimer < config.fuseTimerDuration) return;

    // Burn trail cells from the start
    const burnRate = 8; // cells per second once fuse starts
    const cellsToBurn = Math.floor((this.fuseTimer - config.fuseTimerDuration) * burnRate);
    while (this.fuseBurnIndex < cellsToBurn && this.fuseBurnIndex < this.state.trailCells.length - 1) {
      const idx = this.state.trailCells[this.fuseBurnIndex];
      this.state.trailMask[idx] = 0;
      // Add burn zone visual at burned cell
      if (!this.burnZones.some(b => b.idx === idx)) {
        this.burnZones.push({ idx, timeLeft: 1.0 });
      }
      this.fuseBurnIndex++;
      audio.playFuseBurn();
    }

    // If fuse catches up to player, lose life
    if (this.fuseBurnIndex >= this.state.trailCells.length - 1) {
      if (!this.hasActivePowerup("shield")) {
        this.loseLife();
      } else {
        // Shield protects - just close trail
        this.state.player.trailActive = false;
        clearMask(this.state.trailMask, this.state.trailCells);
      }
      this.fuseTimer = 0;
      this.fuseBurnIndex = 0;
    }
  }

  /** Spawn bonus zones in unclaimed territory */
  spawnBonusZones() {
    this.bonusZones = [];
    const count = config.bonusZoneCount + Math.floor(this.currentLevel / 3);
    for (let i = 0; i < count; i++) {
      const maxAttempts = 60;
      for (let a = 0; a < maxAttempts; a++) {
        const col = 3 + Math.floor(Math.random() * (cols - 6));
        const row = 3 + Math.floor(Math.random() * (rows - 6));
        const idx = cellToIndex(col, row, cols);
        if (!this.state.claimed[idx] && !this.bonusZones.some(b => b.col === col && b.row === row)) {
          this.bonusZones.push({
            col, row, idx,
            radius: 2 + Math.floor(Math.random() * 2), // 2-3 cell radius
            points: 10000 + this.currentLevel * 2000,
            collected: false,
            pulse: Math.random() * Math.PI * 2,
          });
          break;
        }
      }
    }
  }

  /** Check if bonus zones have been claimed */
  checkBonusZones() {
    for (const bz of this.bonusZones) {
      if (bz.collected) continue;
      // Check if any cell in the bonus zone radius is now claimed
      let allClaimed = true;
      for (let dr = -bz.radius; dr <= bz.radius; dr++) {
        for (let dc = -bz.radius; dc <= bz.radius; dc++) {
          if (dc * dc + dr * dr > bz.radius * bz.radius) continue;
          const c = bz.col + dc;
          const r = bz.row + dr;
          if (c < 1 || r < 1 || c >= cols - 1 || r >= rows - 1) continue;
          const idx = cellToIndex(c, r, cols);
          if (!this.state.claimed[idx]) {
            allClaimed = false;
            break;
          }
        }
        if (!allClaimed) break;
      }
      if (allClaimed) {
        bz.collected = true;
        this.addScore(bz.points);
        audio.playBonusZone();
        // Screen shake + flash for juicy feedback
        this.screenShake = 0.5;
        this.screenShakeTime = 0.15;
        // Show bonus zone flash with point value
        this.bonusZoneFlash = { points: bz.points, time: 2.0, x: bz.col, y: bz.row };
        // Spawn big celebration particles
        const cx = (bz.col + 0.5) * config.cell;
        const cy = (bz.row + 0.5) * config.cell;
        for (let i = 0; i < 24; i++) {
          const angle = (i / 24) * Math.PI * 2;
          this.claimParticles.push({
            x: cx, y: cy,
            vx: Math.cos(angle) * (100 + Math.random() * 150),
            vy: Math.sin(angle) * (100 + Math.random() * 150) - 40,
            life: 0, maxLife: 0.8 + Math.random() * 0.5,
            size: 3 + Math.random() * 4,
            hue: 50, // bright gold
          });
        }
        // Shockwave ring at bonus zone
        this.shockwaves.push({ x: cx, y: cy, radius: 0, maxRadius: bz.radius * config.cell * 3, life: 0, maxLife: 0.5, color: "#ffdd44" });
      }
    }
  }

  /** Near-miss slow-mo: brief bullet-time when barely dodging */
  updateNearMiss(dt) {
    if (this.nearMissCooldown > 0) {
      this.nearMissCooldown -= dt;
    }
    if (this.nearMissTime > 0) {
      this.nearMissTime = Math.max(0, this.nearMissTime - dt);
    }

    if (this.nearMissCooldown > 0 || this.state.player.invuln > 0) return;

    const { enemies, player } = this.state;
    const shielded = this.hasActivePowerup("shield");
    if (shielded) return;

    for (const enemy of enemies) {
      if (enemy.dead || enemy.stunTimer > 0) continue;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const dist = Math.hypot(dx, dy);
      const minDist = enemy.radius + player.radius;
      const nearDist = minDist + config.nearMissDistance;
      if (dist > minDist && dist < nearDist) {
        this.nearMissTime = 0.4;
        this.nearMissCooldown = 1.5;
        this.addScore(100);
        audio.playNearMiss();
        break;
      }
    }
  }

  /** Weather particle system */
  updateWeather(dt) {
    const weather = this.currentTheme?.weather;
    if (!weather) return;

    // Spawn new particles
    if (this.weatherParticles.length < this.maxWeatherParticles && Math.random() < 0.3) {
      const p = { life: 1, maxLife: 1 };
      switch (weather) {
        case "rain":
          p.x = Math.random() * config.worldWidth;
          p.y = -10;
          p.vx = -30 + Math.random() * 10;
          p.vy = 400 + Math.random() * 200;
          p.maxLife = 2;
          p.life = 2;
          p.len = 8 + Math.random() * 12;
          break;
        case "snow":
          p.x = Math.random() * config.worldWidth;
          p.y = -5;
          p.vx = -15 + Math.random() * 30;
          p.vy = 30 + Math.random() * 40;
          p.maxLife = 6;
          p.life = 6;
          p.size = 2 + Math.random() * 3;
          break;
        case "dust":
        case "sandstorm":
          p.x = -10;
          p.y = Math.random() * config.worldHeight;
          p.vx = 60 + Math.random() * (weather === "sandstorm" ? 140 : 60);
          p.vy = -10 + Math.random() * 20;
          p.maxLife = 4;
          p.life = 4;
          p.size = 2 + Math.random() * 4;
          break;
        case "embers":
          p.x = Math.random() * config.worldWidth;
          p.y = config.worldHeight + 5;
          p.vx = -20 + Math.random() * 40;
          p.vy = -(40 + Math.random() * 60);
          p.maxLife = 3;
          p.life = 3;
          p.size = 1.5 + Math.random() * 2.5;
          break;
        case "spores":
          p.x = Math.random() * config.worldWidth;
          p.y = Math.random() * config.worldHeight;
          p.vx = 0;
          p.vy = 0;
          p.maxLife = 4;
          p.life = 4;
          p.size = 2 + Math.random() * 3;
          p.phase = Math.random() * Math.PI * 2;
          break;
      }
      this.weatherParticles.push(p);
    }

    // Update
    for (let i = this.weatherParticles.length - 1; i >= 0; i--) {
      const p = this.weatherParticles[i];
      p.life -= dt;
      if (p.life <= 0 || p.x > config.worldWidth + 20 || p.y > config.worldHeight + 20 || p.y < -20) {
        this.weatherParticles.splice(i, 1);
        continue;
      }
      if (weather === "spores") {
        p.x += Math.sin(this.elapsedSeconds * 1.2 + p.phase) * 15 * dt;
        p.y += Math.cos(this.elapsedSeconds * 0.9 + p.phase * 1.3) * 10 * dt;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
  }

  /** Tire track ghost: faint afterimage of player path */
  updateTireTrackGhosts(dt) {
    const player = this.state.player;
    const speed = Math.hypot(player.vx, player.vy);

    // Spawn a ghost every ~8px of movement
    if (speed > 30) {
      const last = this.tireTrackGhosts[this.tireTrackGhosts.length - 1];
      const dist = last ? Math.hypot(player.x - last.x, player.y - last.y) : 999;
      if (dist > 8) {
        this.tireTrackGhosts.push({ x: player.x, y: player.y, angle: player.angle, age: 0 });
        if (this.tireTrackGhosts.length > 80) this.tireTrackGhosts.shift();
      }
    }

    // Age and cull
    for (let i = this.tireTrackGhosts.length - 1; i >= 0; i--) {
      this.tireTrackGhosts[i].age += dt;
      if (this.tireTrackGhosts[i].age > 2.5) {
        this.tireTrackGhosts.splice(i, 1);
      }
    }
  }

  /** Enemy explosion overlay effects */
  updateEnemyExplosions(dt) {
    for (let i = this.enemyExplosions.length - 1; i >= 0; i--) {
      const e = this.enemyExplosions[i];
      e.time -= dt;
      // Transition from fly to impact at 40% through the animation
      const progress = 1 - e.time / e.maxTime;
      if (e.phase === "fly" && progress >= 0.4) {
        e.phase = "impact";
        e.impactTime = 0;
      }
      if (e.phase === "impact") {
        e.impactTime += dt;
      }
      if (e.time <= 0) {
        this.enemyExplosions.splice(i, 1);
      }
    }
  }

  spawnEnemyExplosion(x, y, color, scale) {
    const s = scale || 1;
    this.enemyExplosions.push({
      x, y,
      color: color || "#ff6622",
      time: 1.8 * s,
      maxTime: 1.8 * s,
      radius: (20 + Math.random() * 15) * s,
      spikeCount: 10 + Math.floor(Math.random() * 8),
      spinAngle: Math.random() * Math.PI * 2,
      phase: "fly", // "fly" then "impact"
      impactTime: 0, // time spent in impact phase
    });
    // Spawn explosion debris
    this.spawnDebris(x, y, color || "#888888");
  }

  /** Chain reactions: nearby dead enemies amplify explosions */
  processChainReactions(deadEnemies) {
    const chainRadius = 100;
    const chainBonus = 150;
    let chains = 0;

    for (let i = 0; i < deadEnemies.length; i++) {
      const a = deadEnemies[i];
      for (let j = i + 1; j < deadEnemies.length; j++) {
        const b = deadEnemies[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < chainRadius) {
          chains++;
          // Chain explosion at midpoint
          const mx = (a.x + b.x) * 0.5;
          const my = (a.y + b.y) * 0.5;
          this.spawnEnemyExplosion(mx, my, "#ffcc00", 1.5);
          this.shockwaves.push({ x: mx, y: my, radius: 0, maxRadius: 120, life: 0, maxLife: 0.6, color: "#ffaa00" });
        }
      }
    }

    if (chains > 0) {
      this.addScore(chains * chainBonus);
      this.screenShake = Math.min(1, 0.4 + chains * 0.2);
      this.screenShakeTime = 0.3;
    }
  }

  /** Auto-save current run state */
  // ===== NEW FEATURE METHODS =====

  /** Combo timer: decays over time, resets on claim */
  updateComboTimer(dt) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboTimer = 0;
        this.comboLevel = 0;
      }
    }
  }

  /** Use bomb from inventory */
  useBomb() {
    if (this.bombInventory <= 0 || this.state.mode !== "playing") return;
    this.bombInventory -= 1;

    // If trail is active, close it first
    if (this.state.player.trailActive && this.state.trailCells.length >= 2) {
      this.connectTrailToWall();
      this.state.player.trailActive = false;
      this.closeTrailAndClaim();
    }

    audio.playBomb();
    this.screenShake = 0.8;
    this.screenShakeTime = 0.3;
    const deadEnemies = [];
    for (const enemy of this.state.enemies) {
      if (enemy.dead) continue;
      this.shockwaves.push({ x: enemy.x, y: enemy.y, radius: 0, maxRadius: enemy.radius * 4, life: 0, maxLife: 0.5, color: enemy.variantColor || "#ff6622" });
      if (enemy.variant === "boss") {
        enemy.bossHP = Math.max(0, (enemy.bossHP || 1) - 1);
        if (enemy.bossHP <= 0) {
          enemy.dead = true;
          enemy.respawnTimer = 999;
          deadEnemies.push(enemy);
        } else {
          enemy.stunTimer = 1.5;
          enemy.preStunVx = enemy.vx;
          enemy.preStunVy = enemy.vy;
          enemy.vx = 0;
          enemy.vy = 0;
        }
      } else {
        enemy.dead = true;
        enemy.respawnTimer = 999; // Permanent kill
        deadEnemies.push(enemy);
      }
      enemy.vx = 0;
      enemy.vy = 0;
    }
    for (const enemy of deadEnemies) {
      this.spawnEnemyExplosion(enemy.x, enemy.y, enemy.variantColor,
        enemy.variant === "boss" ? 1.8 : 1);
    }
    this.processChainReactions(deadEnemies);
    this.bombSlowMoTime = 0.8;
    this.state.sparks.length = 0;
    this.bombsUsedThisRun += 1;
    if (this.bombsUsedThisRun >= 3) this.checkAchievement("bomb_squad");
    this.addScore(300);

    // Post-bomb auto-claim: claim all areas not reachable from live enemies/spawners
    this.postBombClaim();

    // If player is stuck on unclaimed territory, teleport to nearest claimed cell
    const pCol = toCell(this.state.player.x, config.cell, cols - 1);
    const pRow = toCell(this.state.player.y, config.cell, rows - 1);
    const pIdx = cellToIndex(pCol, pRow, cols);
    if (!this.state.claimed[pIdx]) {
      this.resetPlayer();
      this.state.player.invuln = config.playerInvulnSeconds;
    }
  }

  /** After bomb: claim all unclaimed areas not reachable from live enemies or active spawners */
  postBombClaim() {
    const prevPercent = this.state.claimedPercent;
    const reachable = floodFromEnemies(this.state.claimed, this.state.enemies);
    const newClaimed = [];
    forEachInterior(cols, rows, (col, row) => {
      const idx = cellToIndex(col, row, cols);
      if (!this.state.claimed[idx] && !reachable[idx]) {
        this.state.claimed[idx] = 1;
        newClaimed.push(idx);
      }
    });
    if (newClaimed.length > 0) {
      this.state.claimedPercent = getClaimedPercent(this.state.claimed);
      this.terrainCacheVersion += 1;
      this.claimFlashCells = newClaimed;
      this.claimFlashTime = 0.5;
      if (newClaimed.length > 4) {
        this.fillWave = { cells: [...newClaimed], progress: 0, speed: 2 };
      }
      this.spawnClaimParticles();
      const claimDelta = this.state.claimedPercent - prevPercent;
      this.addScore(Math.round(claimDelta * 10000));
      if (this.state.claimedPercent >= config.winClaimPercent) {
        this.advanceLevel();
      }
    }
  }

  /** Spawn warp tunnels on opposite borders */
  spawnWarpTunnels() {
    this.warpTunnels = [];
    // Horizontal pair (left <-> right)
    const hRow = 10 + Math.floor(Math.random() * (rows - 20));
    this.warpTunnels.push({
      ax: config.cell * 0.5, ay: (hRow + 0.5) * config.cell,
      bx: config.worldWidth - config.cell * 0.5, by: (hRow + 0.5) * config.cell,
      cooldown: 0,
    });
    // Vertical pair (top <-> bottom)
    const vCol = 10 + Math.floor(Math.random() * (cols - 20));
    this.warpTunnels.push({
      ax: (vCol + 0.5) * config.cell, ay: config.cell * 0.5,
      bx: (vCol + 0.5) * config.cell, by: config.worldHeight - config.cell * 0.5,
      cooldown: 0,
    });
  }

  /** Check if player stepped on a warp portal */
  checkWarpTunnels() {
    const { player } = this.state;
    const warpRadius = config.cell * 2;
    for (const warp of this.warpTunnels) {
      if (warp.cooldown > 0) continue;
      const da = Math.hypot(player.x - warp.ax, player.y - warp.ay);
      const db = Math.hypot(player.x - warp.bx, player.y - warp.by);
      if (da < warpRadius) {
        player.x = warp.bx;
        player.y = warp.by;
        warp.cooldown = 1.0;
        audio.playPickup();
        break;
      } else if (db < warpRadius) {
        player.x = warp.ax;
        player.y = warp.ay;
        warp.cooldown = 1.0;
        audio.playPickup();
        break;
      }
    }
    // Cool down warps
    for (const warp of this.warpTunnels) {
      if (warp.cooldown > 0) warp.cooldown -= 1 / 60;
    }
  }

  /** Spawn enemy spawner cells — increases with level */
  spawnSpawnerCells() {
    this.spawnerCells = [];
    const count = Math.min(6, Math.floor(this.currentLevel / 2));
    for (let i = 0; i < count; i++) {
      for (let a = 0; a < 60; a++) {
        const col = 5 + Math.floor(Math.random() * (cols - 10));
        const row = 5 + Math.floor(Math.random() * (rows - 10));
        const idx = cellToIndex(col, row, cols);
        if (!this.state.claimed[idx]) {
          this.spawnerCells.push({
            col, row, idx,
            spawnTimer: 8 + Math.random() * 4,
            maxSpawnTimer: 8 + Math.random() * 4,
            spawnedEnemy: null, // reference to the enemy spawned by this cell
          });
          break;
        }
      }
    }
  }

  /** Spawner cells periodically create new enemies */
  updateSpawnerCells(dt) {
    for (const sc of this.spawnerCells) {
      // If the spawner cell has been claimed, disable it
      if (this.state.claimed[sc.idx]) continue;
      // Only spawn if no living enemy from this spawner
      if (sc.spawnedEnemy && !sc.spawnedEnemy.dead) continue;
      sc.spawnTimer -= dt;
      if (sc.spawnTimer <= 0) {
        sc.spawnTimer = sc.maxSpawnTimer;
        const x = (sc.col + 0.5) * config.cell;
        const y = (sc.row + 0.5) * config.cell;
        const variant = pickEnemyVariant(this.currentLevel, 0);
        const def = ENEMY_VARIANTS[variant];
        const enemy = createEnemy(x, y);
        enemy.variant = variant;
        enemy.radius = Math.round(enemy.radius * def.radiusMul);
        enemy.spikeCount = def.spikeCount;
        enemy.variantColor = def.color;
        const spd = Math.hypot(enemy.vx, enemy.vy) * def.speedMul;
        const angle = Math.atan2(enemy.vy, enemy.vx);
        enemy.vx = Math.cos(angle) * spd;
        enemy.vy = Math.sin(angle) * spd;
        if (variant === "charger") {
          enemy.chargeTimer = 3 + Math.random() * 2;
          enemy.charging = false;
          enemy.chargeTimeLeft = 0;
        }
        sc.spawnedEnemy = enemy;
        this.state.enemies.push(enemy);
        this.state.enemyCount = this.state.enemies.length;
        // Shockwave at spawn point
        this.shockwaves.push({ x, y, radius: 0, maxRadius: 40, life: 0, maxLife: 0.3, color: "#ff4444" });
      }
    }
  }

  /** Update drift particles */
  /** Turrets: spawn on claimed edge cells, fire at nearby enemies */
  updateTurrets(dt) {
    // Periodically spawn turrets on newly claimed edge cells
    this.turretSpawnTimer -= dt;
    if (this.turretSpawnTimer <= 0) {
      this.turretSpawnTimer = 3;
      this.refreshTurrets();
    }

    // Fire projectiles at nearby enemies
    for (const turret of this.turrets) {
      turret.cooldown -= dt;
      if (turret.cooldown > 0) continue;
      // Check if turret cell is still claimed
      if (!this.state.claimed[turret.idx]) continue;
      // Find nearest alive enemy within range
      let closest = null;
      let closestDist = 120; // turret range in pixels
      for (const enemy of this.state.enemies) {
        if (enemy.dead || enemy.stunTimer > 0) continue;
        const d = Math.hypot(enemy.x - turret.x, enemy.y - turret.y);
        if (d < closestDist) {
          closestDist = d;
          closest = enemy;
        }
      }
      if (closest) {
        turret.cooldown = 1.5;
        const angle = Math.atan2(closest.y - turret.y, closest.x - turret.x);
        this.turretProjectiles.push({
          x: turret.x, y: turret.y,
          vx: Math.cos(angle) * 300,
          vy: Math.sin(angle) * 300,
          life: 0, maxLife: 0.5,
        });
      }
    }

    // Update projectiles
    let write = 0;
    for (let i = 0; i < this.turretProjectiles.length; i++) {
      const p = this.turretProjectiles[i];
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Hit enemies
      let hit = false;
      for (const enemy of this.state.enemies) {
        if (enemy.dead) continue;
        const d = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        if (d < enemy.radius + 4) {
          // Stun enemy briefly
          enemy.stunTimer = 1.0;
          enemy.preStunVx = enemy.vx;
          enemy.preStunVy = enemy.vy;
          enemy.vx = 0;
          enemy.vy = 0;
          this.shockwaves.push({ x: p.x, y: p.y, radius: 0, maxRadius: 20, life: 0, maxLife: 0.2, color: "#ffaa44" });
          hit = true;
          break;
        }
      }
      if (hit) continue;
      this.turretProjectiles[write] = p;
      write++;
    }
    this.turretProjectiles.length = write;
  }

  refreshTurrets() {
    // Place turrets on claimed cells adjacent to unclaimed cells (frontier)
    this.turrets = [];
    const maxTurrets = Math.min(8, 2 + Math.floor(this.state.claimedPercent * 10));
    const frontier = [];
    for (let row = 2; row < rows - 2; row += 3) {
      for (let col = 2; col < cols - 2; col += 3) {
        const idx = cellToIndex(col, row, cols);
        if (!this.state.claimed[idx]) continue;
        // Check if adjacent to unclaimed
        const hasUnclaimed = !this.state.claimed[idx - 1] || !this.state.claimed[idx + 1] ||
          !this.state.claimed[idx - cols] || !this.state.claimed[idx + cols];
        if (hasUnclaimed) {
          frontier.push({ col, row, idx });
        }
      }
    }
    // Pick random frontier cells
    for (let i = frontier.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [frontier[i], frontier[j]] = [frontier[j], frontier[i]];
    }
    for (let i = 0; i < Math.min(maxTurrets, frontier.length); i++) {
      const f = frontier[i];
      this.turrets.push({
        x: (f.col + 0.5) * config.cell,
        y: (f.row + 0.5) * config.cell,
        idx: f.idx,
        cooldown: Math.random() * 1.5,
      });
    }
  }

  /** Update debris particles from explosions */
  updateDebris(dt) {
    let write = 0;
    for (let i = 0; i < this.debrisParticles.length; i++) {
      const p = this.debrisParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt; // gravity
      p.vx *= 0.98;
      p.angle += p.spin * dt;
      // Bounce off world bounds
      if (p.y > config.worldHeight) { p.y = config.worldHeight; p.vy *= -0.5; }
      if (p.x < 0 || p.x > config.worldWidth) { p.vx *= -0.8; }
      this.debrisParticles[write] = p;
      write++;
    }
    this.debrisParticles.length = write;
  }

  /** Spawn debris from an enemy explosion */
  spawnDebris(x, y, color) {
    const count = 6 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 200;
      this.debrisParticles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 100,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 15,
        life: 0,
        maxLife: 1.0 + Math.random() * 1.0,
        size: 2 + Math.random() * 4,
        color: color || "#888888",
      });
    }
  }

  updateDriftParticles(dt) {
    let write = 0;
    for (let i = 0; i < this.driftParticles.length; i++) {
      const p = this.driftParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 30 * dt; // gravity
      p.vx *= 0.96;
      this.driftParticles[write] = p;
      write++;
    }
    this.driftParticles.length = write;
  }

  /** Territory fill wave animation */
  updateFillWave(dt) {
    if (!this.fillWave) return;
    this.fillWave.progress += dt * this.fillWave.speed;
    if (this.fillWave.progress >= 1) {
      this.fillWave = null;
    }
  }

  /** Snapshot system for undo-death rewind */
  updateSnapshots(dt) {
    if (this.state.mode !== "playing") return;
    this.snapshotTimer -= dt;
    if (this.snapshotTimer > 0) return;
    this.snapshotTimer = this.snapshotInterval;
    // Keep last 6 snapshots (~3 seconds)
    if (this.snapshots.length >= 6) this.snapshots.shift();
    this.snapshots.push(this.takeSnapshot());
  }

  takeSnapshot() {
    const { player, claimed, enemies, lives, claimedPercent } = this.state;
    return {
      px: player.x, py: player.y, pAngle: player.angle, trailActive: player.trailActive,
      claimed: new Uint8Array(claimed),
      trailCells: [...this.state.trailCells],
      trailMask: new Uint8Array(this.state.trailMask),
      enemies: enemies.map(e => ({ x: e.x, y: e.y, vx: e.vx, vy: e.vy, dead: e.dead, variant: e.variant, radius: e.radius })),
      lives,
      claimedPercent,
      score: this.score,
    };
  }

  restoreSnapshot() {
    const snap = this.snapshots.pop();
    if (!snap) return;
    this.snapshots = [];
    const { player } = this.state;
    player.x = snap.px;
    player.y = snap.py;
    player.angle = snap.pAngle;
    player.trailActive = false;
    player.vx = 0;
    player.vy = 0;
    // Restore claimed territory
    this.state.claimed.set(snap.claimed);
    this.state.claimedPercent = snap.claimedPercent;
    // Clear trail
    clearMask(this.state.trailMask, this.state.trailCells);
    // Restore enemy positions
    for (let i = 0; i < this.state.enemies.length && i < snap.enemies.length; i++) {
      const e = this.state.enemies[i];
      const se = snap.enemies[i];
      e.x = se.x;
      e.y = se.y;
      e.vx = se.vx;
      e.vy = se.vy;
    }
    this.terrainCacheVersion += 1;
    this.score = snap.score;
    this.burnZones = [];
  }

  /** Skill tree: buy a skill with cumulative score */
  buySkill(skillId) {
    const skill = SKILL_TREE.find(s => s.id === skillId);
    if (!skill) return false;
    if (this.unlockedSkills.includes(skillId)) return false;
    if (skill.requires && !this.unlockedSkills.includes(skill.requires)) return false;
    if (this.cumulativeScore < skill.cost) return false;
    this.cumulativeScore -= skill.cost;
    saveCumulativeScore(this.cumulativeScore);
    this.unlockedSkills.push(skillId);
    saveSkills(this.unlockedSkills);
    this.skillEffect = getSkillEffect(this.unlockedSkills);
    return true;
  }

  updateAutoSave(dt) {
    this.autoSaveTimer -= dt;
    if (this.autoSaveTimer > 0) return;
    this.autoSaveTimer = AUTOSAVE_INTERVAL;
    this.saveCurrentRun();
  }

  saveCurrentRun() {
    if (this.state.mode !== "playing") return;
    const st = this.state;
    saveAutoSave({
      version: GAME_VERSION,
      score: this.score,
      level: this.currentLevel,
      lives: st.lives,
      enemyCount: this.currentEnemyCount,
      selectedEnemyCount: this.selectedEnemyCount,
      claimedPercent: st.claimedPercent,
      claimed: Array.from(st.claimed),
      playerX: st.player.x,
      playerY: st.player.y,
      streakCount: this.streakCount,
      bombsUsedThisRun: this.bombsUsedThisRun,
      bombInventory: this.bombInventory,
      elapsedSeconds: this.elapsedSeconds,
      levelStartTime: this.levelStartTime,
    });
  }

  tryResumeAutoSave() {
    const save = loadAutoSave();
    if (!save || save.version !== GAME_VERSION) {
      clearAutoSave();
      return false;
    }
    this.score = save.score || 0;
    this.currentLevel = save.level || 1;
    this.currentEnemyCount = save.enemyCount || 1;
    this.selectedEnemyCount = save.selectedEnemyCount || 1;
    this.streakCount = save.streakCount || 0;
    this.bombsUsedThisRun = save.bombsUsedThisRun || 0;
    this.bombInventory = save.bombInventory ?? this.skillEffect.startBombs;
    this.elapsedSeconds = save.elapsedSeconds || 0;
    this.levelStartTime = save.levelStartTime || 0;
    this.currentTheme = getThemeForLevel(this.currentLevel);

    this.state = this.createFreshState({
      enemyCount: this.currentEnemyCount,
      lives: save.lives || config.initialLives,
      mode: "playing",
      level: this.currentLevel,
    });

    // Restore claimed territory
    if (save.claimed && save.claimed.length === this.state.claimed.length) {
      this.state.claimed.set(save.claimed);
      this.state.claimedPercent = getClaimedPercent(this.state.claimed);
    }

    // Restore player position
    if (save.playerX != null) this.state.player.x = save.playerX;
    if (save.playerY != null) this.state.player.y = save.playerY;

    this.terrainCacheVersion += 1;
    this.spawnBonusZones();
    this.paused = false;
    this.tutorialShown = true;
    this.weatherParticles = [];
    this.enemyExplosions = [];

    // Start audio systems
    audio.ensureAudioResumed();
    audio.startAmbient();
    audio.startEngine();
    audio.startMusic();
    audio.startProximityTone();
    audio.startReverb();
    setTimeout(() => {
      audio.startAmbient();
      audio.startEngine();
      audio.startMusic();
      audio.startProximityTone();
      audio.startReverb();
    }, 150);

    this.syncMenuVisibility();
    clearAutoSave();
    return true;
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
    const shakeEnabled = this.settingsShakeEnabled;
    const shakeX = shakeEnabled && this.screenShake > 0 ? Math.sin(this.elapsedSeconds * 70) * 8 * this.screenShake : 0;
    const shakeY = shakeEnabled && this.screenShake > 0 ? Math.cos(this.elapsedSeconds * 84) * 6 * this.screenShake : 0;
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
      killCamTime: this.killCamTime,
      burnZones: this.burnZones,
      claimParticles: this.claimParticles,
      shockwaves: this.shockwaves,
      crtEnabled: this.crtEnabled,
      carSkin: this.getCarSkin(),
      achievementFlash: this.achievementFlash,
      unlockedAchievements: this.unlockedAchievements,
      cumulativeScore: this.cumulativeScore,
      bonusZones: this.bonusZones,
      nearMissTime: this.nearMissTime,
      fuseTimer: this.fuseTimer,
      fuseTimerDuration: config.fuseTimerDuration,
      fuseBurnIndex: this.fuseBurnIndex,
      weatherParticles: this.weatherParticles,
      enemyExplosions: this.enemyExplosions,
      tireTrackGhosts: this.tireTrackGhosts,
      bonusZoneFlash: this.bonusZoneFlash,
      bombSlowMoTime: this.bombSlowMoTime,
      shrinkActive: this.hasActivePowerup("shrink"),
      freezeActive: this.hasActivePowerup("freeze"),
      comboLevel: this.comboLevel,
      comboTimer: this.comboTimer,
      bombInventory: this.bombInventory,
      warpTunnels: this.warpTunnels,
      spawnerCells: this.spawnerCells,
      driftParticles: this.driftParticles,
      debrisParticles: this.debrisParticles,
      turrets: this.turrets,
      turretProjectiles: this.turretProjectiles,
      fillWave: this.fillWave,
      undoAvailable: this.undoAvailable,
      skillEffect: this.skillEffect,
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
