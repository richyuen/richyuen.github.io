import { circleIntersectsMask, circleIntersectsSolid, clamp, cellToIndex, toCell } from "./collision.js";
import { createEnemy, createPlayer, createSmoke, createSpark } from "./entities.js";
import { renderFrame, renderOverlay, renderWorld } from "./render.js";

const config = {
  cell: 8,
  worldWidth: 960,
  worldHeight: 640,
  initialLives: 3,
  ignitionNitroDuration: 1.35,
  ignitionNitroMultiplier: 1.85,
  ignitionNitroCooldown: 3.4,
  winClaimPercent: 0.75,
  playerInvulnSeconds: 1.2,
  enemySpeedMin: 165,
  enemySpeedMax: 205,
  sparkSpawnRate: 72,
  maxSparks: 760,
  smokeSpawnRate: 32,
  maxSmoke: 320,
};

const cols = Math.floor(config.worldWidth / config.cell);
const rows = Math.floor(config.worldHeight / config.cell);
const interiorCellCount = (cols - 2) * (rows - 2);

function randomRange(min, max) {
  return min + Math.random() * (max - min);
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

function floodFromEnemy(claimed, enemy) {
  const enemyCol = toCell(enemy.x, config.cell, cols - 1);
  const enemyRow = toCell(enemy.y, config.cell, rows - 1);
  let startIdx = cellToIndex(enemyCol, enemyRow, cols);

  if (claimed[startIdx]) {
    startIdx = findNearestOpenCell(claimed, enemyCol, enemyRow);
  }
  if (startIdx === null) {
    return new Uint8Array(cols * rows);
  }

  const visited = new Uint8Array(cols * rows);
  const queue = [startIdx];
  visited[startIdx] = 1;
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
      if (visited[nIdx] || claimed[nIdx]) {
        continue;
      }
      visited[nIdx] = 1;
      queue.push(nIdx);
    }
  }
  return visited;
}

export class Game {
  constructor(canvas, menuOverlay) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.menuOverlay = menuOverlay;

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

    this.state = this.createFreshState();
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

  createFreshState() {
    const claimed = buildInitialClaimedMap();
    const player = createPlayer(config.worldWidth * 0.5, config.cell * 0.5);
    const enemy = createEnemy(config.worldWidth * 0.5, config.worldHeight * 0.5);
    return {
      mode: "menu",
      lives: config.initialLives,
      nitro: {
        activeSeconds: 0,
        cooldownSeconds: 0,
      },
      claimed,
      claimedPercent: getClaimedPercent(claimed),
      player,
      enemy,
      sparks: [],
      smoke: [],
      trailMask: new Uint8Array(cols * rows),
      trailCells: [],
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
  }

  syncMenuVisibility() {
    if (!this.menuOverlay) {
      return;
    }
    this.menuOverlay.classList.toggle("hidden", this.state.mode !== "menu");
  }

  startGame() {
    this.state = this.createFreshState();
    this.state.mode = "playing";
    this.syncMenuVisibility();
  }

  restartGame() {
    this.startGame();
  }

  loseLife() {
    this.state.lives -= 1;
    clearMask(this.state.trailMask, this.state.trailCells);
    this.state.player.trailActive = false;
    this.screenShake = 1;
    this.screenShakeTime = 0.2;

    if (this.state.lives <= 0) {
      this.state.mode = "lost";
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

  normalizeEnemySpeed() {
    const speed = Math.hypot(this.state.enemy.vx, this.state.enemy.vy);
    if (speed < config.enemySpeedMin || speed > config.enemySpeedMax) {
      const angle = Math.atan2(this.state.enemy.vy, this.state.enemy.vx);
      const nextSpeed = clamp(speed, config.enemySpeedMin, config.enemySpeedMax);
      this.state.enemy.vx = Math.cos(angle) * nextSpeed;
      this.state.enemy.vy = Math.sin(angle) * nextSpeed;
    }
  }

  update(dt, input) {
    this.elapsedSeconds += dt;
    if (this.screenShakeTime > 0) {
      this.screenShakeTime -= dt;
      this.screenShake = this.screenShakeTime > 0 ? this.screenShakeTime / 0.2 : 0;
    }

    if (this.state.mode === "menu") {
      return;
    }

    if (this.state.mode === "won" || this.state.mode === "lost") {
      if (input.consume("Space")) {
        this.restartGame();
      }
      return;
    }

    this.updateNitro(dt, input);
    this.updatePlayer(dt, input);
    this.updateEnemy(dt);
    this.updateSparks(dt);
    this.updateSmoke(dt);
    this.detectDamage();

    if (this.state.player.invuln > 0) {
      this.state.player.invuln = Math.max(0, this.state.player.invuln - dt);
    }
  }

  updatePlayer(dt, input) {
    const axis = input.axis();
    const { player, claimed, nitro } = this.state;
    const nitroSpeedMultiplier = nitro.activeSeconds > 0 ? config.ignitionNitroMultiplier : 1;

    player.vx = axis.x * player.speed * nitroSpeedMultiplier;
    player.vy = axis.y * player.speed * nitroSpeedMultiplier;

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
        this.loseLife();
      }
      return;
    }

    this.recordTrailCell(idx);

    if (oldX === player.x && oldY === player.y && (axis.x !== 0 || axis.y !== 0)) {
      this.loseLife();
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

    for (const idx of this.state.trailCells) {
      this.state.claimed[idx] = 1;
      this.state.trailMask[idx] = 0;
    }
    this.state.trailCells.length = 0;

    const reachable = floodFromEnemy(this.state.claimed, this.state.enemy);
    forEachInterior(cols, rows, (col, row) => {
      const idx = cellToIndex(col, row, cols);
      if (!this.state.claimed[idx] && !reachable[idx]) {
        this.state.claimed[idx] = 1;
      }
    });

    this.state.claimedPercent = getClaimedPercent(this.state.claimed);

    const enemyCell = cellToIndex(
      toCell(this.state.enemy.x, config.cell, cols - 1),
      toCell(this.state.enemy.y, config.cell, rows - 1),
      cols
    );
    if (this.state.claimed[enemyCell]) {
      const open = findNearestOpenCell(
        this.state.claimed,
        toCell(this.state.enemy.x, config.cell, cols - 1),
        toCell(this.state.enemy.y, config.cell, rows - 1)
      );
      if (open !== null) {
        const col = open % cols;
        const row = Math.floor(open / cols);
        this.state.enemy.x = (col + 0.5) * config.cell;
        this.state.enemy.y = (row + 0.5) * config.cell;
      }
    }

    if (this.state.claimedPercent >= config.winClaimPercent) {
      this.state.mode = "won";
    }
  }

  updateEnemy(dt) {
    const enemy = this.state.enemy;
    enemy.spin += dt * 2.2;
    enemy.firePhase += dt * 4.5;

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

    this.normalizeEnemySpeed();

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

    const { enemy, player, trailMask } = this.state;

    if (player.invuln <= 0) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const minDist = enemy.radius + player.radius;
      if (dx * dx + dy * dy <= minDist * minDist) {
        this.loseLife();
        return;
      }
    }

    if (player.trailActive) {
      if (circleIntersectsMask(trailMask, cols, rows, config.cell, enemy.x, enemy.y, enemy.radius)) {
        this.loseLife();
      }
    }
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
      return;
    }

    renderFrame(this.ctx, {
      ...snapshot,
      touchMode: this.touchMode,
    });
  }

  renderToText() {
    const { player, enemy, mode, sparks, smoke, lives, claimedPercent, trailCells, nitro } = this.state;
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
      enemy: {
        x: Number(enemy.x.toFixed(2)),
        y: Number(enemy.y.toFixed(2)),
        vx: Number(enemy.vx.toFixed(2)),
        vy: Number(enemy.vy.toFixed(2)),
        radius: enemy.radius,
      },
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
      },
      nitro: {
        activeSeconds: Number(nitro.activeSeconds.toFixed(3)),
        cooldownSeconds: Number(nitro.cooldownSeconds.toFixed(3)),
        speedMultiplier: nitro.activeSeconds > 0 ? config.ignitionNitroMultiplier : 1,
      },
    };
    return JSON.stringify(payload, null, 2);
  }
}
