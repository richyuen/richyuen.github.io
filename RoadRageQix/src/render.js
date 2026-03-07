import { POWERUP_TYPES } from "./powerups.js";

// Module-level terrain cache
let cachedTerrainCanvas = null;
let cachedEdgeCanvas = null;
let terrainCacheVersion = -1;

function drawDustBackground(ctx, width, height, elapsedSeconds, theme) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, theme?.bg1 || "#6f4a2f");
  gradient.addColorStop(0.45, theme?.bg2 || "#423021");
  gradient.addColorStop(1, theme?.bg3 || "#1e1712");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 7; i += 1) {
    const y = (i / 6) * height;
    ctx.fillStyle = i % 2 === 0 ? "#ffb476" : "#5f402a";
    ctx.fillRect(0, y + Math.sin(elapsedSeconds * 0.8 + i) * 5, width, height * 0.02);
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = theme?.hillColor || "#201713";
  for (let i = 0; i < 14; i += 1) {
    const hillW = width * (0.16 + i * 0.02);
    const hillH = height * (0.05 + (i % 3) * 0.018);
    const x = ((i * 197 + elapsedSeconds * 8) % (width + hillW)) - hillW;
    ctx.beginPath();
    ctx.ellipse(x, height * 0.78 + (i % 4) * 9, hillW, hillH, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGridGlow(ctx, worldWidth, worldHeight, cell, theme) {
  ctx.strokeStyle = theme?.grid || "rgba(255, 196, 132, 0.03)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= worldWidth; x += cell * 5) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, worldHeight);
    ctx.stroke();
  }
  for (let y = 0; y <= worldHeight; y += cell * 5) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(worldWidth, y + 0.5);
    ctx.stroke();
  }
}

/** Renders claimed terrain to an offscreen canvas (cached) */
function renderTerrainToCache(state, config, highContrast, theme) {
  const { claimed } = state;
  const { cell } = config;
  const cols = Math.floor(config.worldWidth / cell);
  const rows = Math.floor(config.worldHeight / cell);
  const tb = theme?.terrainBase || [118, 100, 78];
  const borderColor = theme?.border || "#dccab0";
  const highlightColor = theme?.terrainHighlight || "rgba(255, 236, 208, 0.16)";

  const terrainCanvas = document.createElement("canvas");
  terrainCanvas.width = config.worldWidth;
  terrainCanvas.height = config.worldHeight;
  const tctx = terrainCanvas.getContext("2d");

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const idx = row * cols + col;
      if (!claimed[idx]) continue;
      const x = col * cell;
      const y = row * cell;
      const border = row === 0 || col === 0 || row === rows - 1 || col === cols - 1;
      const tone = ((col * 11 + row * 17) % 5) / 5;
      if (highContrast) {
        tctx.fillStyle = border ? "#eee" : `rgb(${80 + tone * 30}, ${140 + tone * 30}, ${200 + tone * 20})`;
      } else {
        tctx.fillStyle = border ? borderColor : `rgba(${tb[0] + tone * 24}, ${tb[1] + tone * 20}, ${tb[2] + tone * 16}, 0.92)`;
      }
      tctx.fillRect(x, y, cell, cell);
      if (!border) {
        if ((col + row) % 2 === 0) {
          tctx.fillStyle = highContrast ? "rgba(200, 230, 255, 0.22)" : highlightColor;
          tctx.fillRect(x, y, cell, cell * 0.45);
        }
        if ((col + row) % 5 === 0) {
          tctx.fillStyle = "rgba(0, 0, 0, 0.3)";
          tctx.fillRect(x, y + cell * 0.55, cell, cell * 0.45);
        }
      }
    }
  }

  // Edge canvas
  const edgeCanvas = document.createElement("canvas");
  edgeCanvas.width = config.worldWidth;
  edgeCanvas.height = config.worldHeight;
  const ectx = edgeCanvas.getContext("2d");
  const segments = [];

  for (let row = 1; row < rows - 1; row += 1) {
    for (let col = 1; col < cols - 1; col += 1) {
      const idx = row * cols + col;
      if (!claimed[idx]) continue;
      const left = claimed[idx - 1];
      const right = claimed[idx + 1];
      const top = claimed[idx - cols];
      const bottom = claimed[idx + cols];
      if (left && right && top && bottom) continue;
      const x = col * cell;
      const y = row * cell;
      if (!left) segments.push([x, y, x, y + cell]);
      if (!right) segments.push([x + cell, y, x + cell, y + cell]);
      if (!top) segments.push([x, y, x + cell, y]);
      if (!bottom) segments.push([x, y + cell, x + cell, y + cell]);
    }
  }

  if (segments.length > 0) {
    ectx.globalCompositeOperation = "lighter";
    ectx.lineCap = "round";
    const edgeColor1 = highContrast ? "rgba(100, 180, 255, 0.7)" : (theme?.edge || "rgba(255, 123, 68, 0.66)");
    const edgeColor2 = highContrast ? "rgba(200, 230, 255, 0.98)" : (theme?.edgeBright || "rgba(255, 245, 220, 0.98)");

    ectx.strokeStyle = edgeColor1;
    ectx.lineWidth = 6.2;
    for (const [x1, y1, x2, y2] of segments) {
      ectx.beginPath();
      ectx.moveTo(x1, y1);
      ectx.lineTo(x2, y2);
      ectx.stroke();
    }

    ectx.strokeStyle = edgeColor2;
    ectx.lineWidth = 2.35;
    for (const [x1, y1, x2, y2] of segments) {
      ectx.beginPath();
      ectx.moveTo(x1, y1);
      ectx.lineTo(x2, y2);
      ectx.stroke();
    }
  }

  return { terrainCanvas, edgeCanvas };
}

function drawTrail(ctx, state, config, elapsedSeconds, trailDanger, highContrast) {
  const { trailCells } = state;
  const { cell } = config;
  const cols = Math.floor(config.worldWidth / cell);

  // Base trail color shifts toward red with danger
  const r = Math.round(255);
  const g = Math.round(159 - trailDanger * 100);
  const b = Math.round(92 - trailDanger * 70);
  const baseColor = highContrast ? `rgb(255, ${255 - trailDanger * 200}, ${50})` : `rgb(${r}, ${g}, ${b})`;

  ctx.fillStyle = baseColor;
  for (let i = 0; i < trailCells.length; i += 1) {
    const idx = trailCells[i];
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    ctx.fillRect(col * cell, row * cell, cell, cell);
  }

  if (trailCells.length > 0) {
    const dangerPulseSpeed = 10 + trailDanger * 15;
    const pulse = 0.45 + Math.sin(elapsedSeconds * dangerPulseSpeed) * (0.2 + trailDanger * 0.25);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glowR = 255;
    const glowG = Math.round(186 - trailDanger * 140);
    const glowB = Math.round(120 - trailDanger * 100);
    ctx.fillStyle = `rgba(${glowR}, ${glowG}, ${glowB}, ${pulse})`;
    for (let i = 0; i < trailCells.length; i += 1) {
      const idx = trailCells[i];
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      ctx.fillRect(col * cell, row * cell, cell, cell);
    }
    ctx.restore();
  }
}

function drawClaimFlash(ctx, cells, flashTime, config) {
  if (!cells || cells.length === 0 || flashTime <= 0) return;
  const { cell } = config;
  const cols = Math.floor(config.worldWidth / cell);
  const alpha = flashTime / 0.4;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = `rgba(255, 240, 180, ${0.5 * alpha})`;
  for (const idx of cells) {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    ctx.fillRect(col * cell, row * cell, cell, cell);
  }
  ctx.restore();
}

function drawSmoke(ctx, smoke, elapsedSeconds) {
  if (!smoke || smoke.length === 0) {
    return;
  }

  ctx.save();
  for (const puff of smoke) {
    const age = puff.life / puff.maxLife;
    const alpha = Math.max(0, (1 - age) * (1 - age) * puff.density);
    if (alpha <= 0.01) {
      continue;
    }

    const driftX = Math.sin(elapsedSeconds * 2.2 + puff.turbulence) * 2.2;
    const driftY = Math.cos(elapsedSeconds * 1.8 + puff.turbulence) * 1.6;
    const cx = puff.x + driftX;
    const cy = puff.y + driftY;
    const radius = puff.size * (0.85 + age * 0.95);

    const hot = Math.max(0, puff.hotness * (1 - age * 1.15));
    const g = ctx.createRadialGradient(cx, cy, radius * 0.12, cx, cy, radius);
    g.addColorStop(0, `rgba(${70 + hot * 120}, ${52 + hot * 72}, ${42 + hot * 36}, ${alpha * (0.62 + hot * 0.32)})`);
    g.addColorStop(0.45, `rgba(64, 54, 49, ${alpha * 0.48})`);
    g.addColorStop(1, `rgba(32, 29, 28, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    if (hot > 0.22) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255, 132, 74, ${alpha * hot * 0.24})`;
      ctx.beginPath();
      ctx.arc(cx - 0.5, cy - 0.6, radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
  }
  ctx.restore();
}

function drawSparks(ctx, sparks, elapsedSeconds) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  const richTrails = sparks.length < 420;
  for (const spark of sparks) {
    const age = spark.life / spark.maxLife;
    const alpha = Math.max(0, 1 - age);
    const heat = Math.max(0.08, spark.heat * (1 - age * 0.55));
    const dx = spark.x - spark.prevX;
    const dy = spark.y - spark.prevY;
    const speed = Math.hypot(dx, dy);
    const dirX = speed > 0.001 ? dx / speed : Math.cos(spark.flicker + elapsedSeconds * 7);
    const dirY = speed > 0.001 ? dy / speed : Math.sin(spark.flicker + elapsedSeconds * 7);
    const tailLength = Math.max(spark.size * 2, speed * (2.5 + heat * 2.4));
    const tailX = spark.x - dirX * tailLength;
    const tailY = spark.y - dirY * tailLength;

    // Simplified color for performance (avoid per-spark gradient when many sparks)
    if (richTrails) {
      const trailGradient = ctx.createLinearGradient(spark.x, spark.y, tailX, tailY);
      trailGradient.addColorStop(0, `rgba(255, 248, 226, ${0.92 * alpha})`);
      trailGradient.addColorStop(0.45, `rgba(255, 180, 84, ${0.7 * alpha})`);
      trailGradient.addColorStop(1, `rgba(255, 82, 24, ${0.12 * alpha})`);
      ctx.strokeStyle = trailGradient;
    } else {
      ctx.strokeStyle = `rgba(255, 174, 84, ${0.5 * alpha})`;
    }
    ctx.lineWidth = spark.size * (1.2 + heat * 1.3);
    ctx.beginPath();
    ctx.moveTo(spark.x, spark.y);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 200, 116, ${spark.glow * 0.35 * alpha})`;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, spark.size * (2.3 + heat), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 246, 224, ${0.9 * heat * alpha})`;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, spark.size * (0.65 + heat * 0.35), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 105, 34, ${0.55 * alpha})`;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, spark.size * (1.35 + heat * 0.35), 0, Math.PI * 2);
    ctx.fill();

    if (alpha < 0.75) {
      ctx.fillStyle = `rgba(38, 30, 23, ${(1 - alpha) * 0.2})`;
      ctx.beginPath();
      ctx.arc(spark.x - dirX * 1.5, spark.y - dirY * 1.5, spark.size * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawHeatHaze(ctx, enemy, elapsedSeconds) {
  const speed = Math.hypot(enemy.vx, enemy.vy);
  const nx = speed > 0.001 ? enemy.vx / speed : 1;
  const ny = speed > 0.001 ? enemy.vy / speed : 0;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(Math.atan2(ny, nx));

  for (let i = 0; i < 3; i += 1) {
    const pulse = 1 + Math.sin(elapsedSeconds * (4.2 + i * 1.4) + i * 1.3) * 0.09;
    const rx = (enemy.radius * (1.9 + i * 0.55) + speed * 0.03) * pulse;
    const ry = (enemy.radius * (1.2 + i * 0.38)) * pulse;
    const offset = -speed * 0.06 - i * 5;
    ctx.strokeStyle = `rgba(255, 210, 160, ${0.09 - i * 0.022})`;
    ctx.lineWidth = 2.6 - i * 0.5;
    ctx.beginPath();
    ctx.ellipse(offset, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawEnemyFire(ctx, enemy, elapsedSeconds) {
  const speed = Math.hypot(enemy.vx, enemy.vy);
  const trailX = speed > 0.001 ? -enemy.vx / speed : 0;
  const trailY = speed > 0.001 ? -enemy.vy / speed : 0;
  const flowAngle = Math.atan2(trailY, trailX);
  const twopi = Math.PI * 2;

  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.globalCompositeOperation = "lighter";

  // Variant tint
  const vc = enemy.variantColor;

  const layers = [
    { base: enemy.radius + 16, wake: 16, noise: 7, color: vc ? `rgba(${hexToR(vc)}, ${hexToG(vc)}, ${hexToB(vc)}, 0.17)` : "rgba(255, 70, 24, 0.17)" },
    { base: enemy.radius + 11, wake: 12, noise: 5, color: vc ? `rgba(${hexToR(vc)}, ${hexToG(vc)}, ${hexToB(vc)}, 0.24)` : "rgba(255, 124, 40, 0.24)" },
    { base: enemy.radius + 6, wake: 8, noise: 3.5, color: "rgba(255, 212, 116, 0.36)" },
  ];

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const layer = layers[layerIndex];
    const points = 34;
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    for (let i = 0; i <= points; i += 1) {
      const angle = (i / points) * twopi;
      const wakeDot = Math.max(0, Math.cos(angle - flowAngle));
      const turbulence =
        Math.sin(angle * 4 + elapsedSeconds * 8 + layerIndex * 1.3 + enemy.firePhase) * 0.58 +
        Math.sin(angle * 7 - elapsedSeconds * 11 + layerIndex) * 0.32;
      const r = layer.base + wakeDot * layer.wake + turbulence * layer.noise;
      const wx = trailX * wakeDot * (5 + layerIndex * 2.2);
      const wy = trailY * wakeDot * (5 + layerIndex * 2.2);
      const px = Math.cos(angle) * r + wx;
      const py = Math.sin(angle) * r + wy;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
  }

  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * twopi + enemy.firePhase * 0.28;
    const wakeDot = Math.max(0, Math.cos(angle - flowAngle));
    const base = enemy.radius + 4 + wakeDot * 12;
    const length = 7 + wakeDot * 14 + Math.sin(elapsedSeconds * 12 + i * 1.4) * 3;
    const x1 = Math.cos(angle) * base;
    const y1 = Math.sin(angle) * base;
    const x2 = Math.cos(angle) * (base + length) + trailX * wakeDot * 7;
    const y2 = Math.sin(angle) * (base + length) + trailY * wakeDot * 7;
    ctx.strokeStyle = `rgba(255, ${176 + i * 6}, 82, 0.46)`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.restore();
}

// Hex color helpers for variant tinting
function hexToR(hex) { return parseInt(hex.slice(1, 3), 16); }
function hexToG(hex) { return parseInt(hex.slice(3, 5), 16); }
function hexToB(hex) { return parseInt(hex.slice(5, 7), 16); }

function drawEnemy(ctx, enemy, elapsedSeconds) {
  drawHeatHaze(ctx, enemy, elapsedSeconds);
  drawEnemyFire(ctx, enemy, elapsedSeconds);

  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(enemy.spin);

  // Variant indicator ring
  if (enemy.variantColor) {
    ctx.save();
    ctx.globalAlpha = 0.45 + Math.sin(elapsedSeconds * 5) * 0.15;
    ctx.strokeStyle = enemy.variantColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = "#28221c";
  ctx.lineWidth = 3.2;
  for (let i = 0; i < enemy.spikeCount; i += 1) {
    const angle = (i / enemy.spikeCount) * Math.PI * 2;
    const inner = enemy.radius - 2;
    const outer = enemy.radius + 14 + (i % 2) * 3 + Math.sin(enemy.firePhase + i) * 1.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();
  }

  const shell = ctx.createRadialGradient(-4, -5, 4, 0, 0, enemy.radius + 4);
  shell.addColorStop(0, "#ffaf6d");
  shell.addColorStop(0.25, "#f16029");
  shell.addColorStop(0.55, "#903117");
  shell.addColorStop(1, "#261b16");
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 233, 174, 0.8)";
  ctx.beginPath();
  ctx.arc(-4, -4, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 198, 128, 0.35)";
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 4; i += 1) {
    const arcRadius = enemy.radius * (0.36 + i * 0.12);
    const start = enemy.firePhase * 0.6 + i * 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, arcRadius, start, start + 0.85);
    ctx.stroke();
  }

  // Charger glow when about to charge
  if (enemy.variant === "charger" && !enemy.charging && enemy.chargeTimer < 1) {
    ctx.globalAlpha = (1 - enemy.chargeTimer) * 0.6;
    ctx.fillStyle = "#ff2222";
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawCar(ctx, player, elapsedSeconds, shielded, skin) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);

  const bob = Math.sin(elapsedSeconds * 12) * 0.7;
  ctx.translate(0, bob);

  const bodyW = 36;
  const bodyH = 20;
  const bodyColor = skin?.body || "#82311d";
  const accentColor = skin?.accent || "#5f2617";

  if (player.invuln > 0) {
    ctx.globalAlpha = 0.7 + Math.sin(elapsedSeconds * 30) * 0.2;
  }

  // Shield bubble
  if (shielded) {
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.sin(elapsedSeconds * 6) * 0.1;
    ctx.strokeStyle = "#44bbff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(68, 187, 255, 0.08)";
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = "#181615";
  ctx.fillRect(-bodyW * 0.36, -bodyH * 0.72, bodyW * 0.72, bodyH * 1.44);

  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(-bodyW * 0.5, -bodyH * 0.38);
  ctx.lineTo(bodyW * 0.44, -bodyH * 0.48);
  ctx.lineTo(bodyW * 0.58, 0);
  ctx.lineTo(bodyW * 0.44, bodyH * 0.48);
  ctx.lineTo(-bodyW * 0.5, bodyH * 0.38);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = accentColor;
  ctx.fillRect(-7, -6, 18, 12);
  ctx.fillStyle = "#2f2f2f";
  ctx.fillRect(-2, -5, 10, 10);

  ctx.fillStyle = "#111";
  const wheelW = 5;
  const wheelH = 7;
  ctx.fillRect(-15, -12, wheelW, wheelH + 1);
  ctx.fillRect(-15, 5, wheelW, wheelH + 1);
  ctx.fillRect(12, -12, wheelW, wheelH + 1);
  ctx.fillRect(12, 5, wheelW, wheelH + 1);

  ctx.fillStyle = "#b19f8f";
  ctx.fillRect(15, -2, 5, 4);
  ctx.fillStyle = "rgba(255, 170, 88, 0.6)";
  ctx.fillRect(-18, -3, 4, 2);
  ctx.fillRect(-18, 1, 4, 2);

  ctx.restore();
}

function drawPowerups(ctx, powerups, elapsedSeconds) {
  for (const pu of powerups) {
    const def = POWERUP_TYPES[pu.type];
    if (!def) continue;
    const pulse = 0.8 + Math.sin(pu.pulse) * 0.2;
    const r = pu.radius * pulse;

    // Glow
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.45 + Math.sin(pu.pulse) * 0.15;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, r * 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body
    ctx.save();
    ctx.fillStyle = def.color;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Icon
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(r * 1.2)}px "Impact", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.icon, pu.x, pu.y + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.restore();

    // Life remaining ring
    const lifeRatio = 1 - pu.life / pu.maxLife;
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, r + 3, -Math.PI / 2, -Math.PI / 2 + lifeRatio * Math.PI * 2);
    ctx.stroke();
  }
}

function drawMinimap(ctx, state, config, canvasWidth) {
  const mapW = 100;
  const mapH = Math.round(mapW * (config.worldHeight / config.worldWidth));
  const x = canvasWidth - mapW - 22;
  const y = 50;
  const cols = Math.floor(config.worldWidth / config.cell);
  const rows = Math.floor(config.worldHeight / config.cell);
  const cellW = mapW / cols;
  const cellH = mapH / rows;

  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = "rgba(12, 9, 7, 0.75)";
  ctx.fillRect(x - 2, y - 2, mapW + 4, mapH + 4);
  ctx.strokeStyle = "rgba(255, 194, 128, 0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 2, y - 2, mapW + 4, mapH + 4);

  // Claimed
  ctx.fillStyle = "rgba(180, 150, 110, 0.8)";
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (state.claimed[row * cols + col]) {
        ctx.fillRect(x + col * cellW, y + row * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }
  }

  // Trail
  if (state.trailCells.length > 0) {
    ctx.fillStyle = "rgba(255, 159, 92, 0.9)";
    for (const idx of state.trailCells) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      ctx.fillRect(x + col * cellW, y + row * cellH, Math.ceil(cellW), Math.ceil(cellH));
    }
  }

  // Player
  const px = x + (state.player.x / config.worldWidth) * mapW;
  const py = y + (state.player.y / config.worldHeight) * mapH;
  ctx.fillStyle = "#44ff88";
  ctx.fillRect(px - 2, py - 2, 4, 4);

  // Enemies
  const enemies = state.enemies ?? [];
  for (const enemy of enemies) {
    const ex = x + (enemy.x / config.worldWidth) * mapW;
    const ey = y + (enemy.y / config.worldHeight) * mapH;
    ctx.fillStyle = enemy.variantColor || "#ff4422";
    ctx.fillRect(ex - 2, ey - 2, 4, 4);
  }

  // Powerups
  for (const pu of (state.powerups ?? [])) {
    const ppx = x + (pu.x / config.worldWidth) * mapW;
    const ppy = y + (pu.y / config.worldHeight) * mapH;
    ctx.fillStyle = POWERUP_TYPES[pu.type]?.color ?? "#fff";
    ctx.beginPath();
    ctx.arc(ppx, ppy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawExhaustParticles(ctx, particles) {
  if (!particles || particles.length === 0) return;
  ctx.save();
  for (const p of particles) {
    const age = p.life / p.maxLife;
    const alpha = (1 - age) * 0.5;
    if (alpha <= 0.01) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgb(${120 + age * 60}, ${100 + age * 40}, ${80 + age * 30})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawEnemyWarningIndicators(ctx, enemies, player, worldWidth, worldHeight) {
  if (!enemies || enemies.length === 0) return;
  ctx.save();
  for (const enemy of enemies) {
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 80) continue; // too close for arrow, player can see it

    const angle = Math.atan2(dy, dx);
    // Arrow position: clamp to edge of a rect around player
    const margin = 40;
    const halfW = worldWidth / 2 - margin;
    const halfH = worldHeight / 2 - margin;
    const cx = worldWidth / 2;
    const cy = worldHeight / 2;

    // Position on world border pointing toward enemy
    const edgeDist = Math.min(halfW / Math.abs(Math.cos(angle) || 0.001), halfH / Math.abs(Math.sin(angle) || 0.001));
    const arrowDist = Math.min(dist * 0.4, edgeDist);
    const ax = player.x + Math.cos(angle) * arrowDist;
    const ay = player.y + Math.sin(angle) * arrowDist;

    // Clamp to world
    const clampedX = Math.max(margin, Math.min(worldWidth - margin, ax));
    const clampedY = Math.max(margin, Math.min(worldHeight - margin, ay));

    // Urgency based on distance
    const urgency = Math.max(0, 1 - dist / 300);
    const alpha = 0.3 + urgency * 0.5;
    const size = 6 + urgency * 4;

    ctx.save();
    ctx.translate(clampedX, clampedY);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = enemy.variantColor || "#ff4422";
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.6, -size * 0.5);
    ctx.lineTo(-size * 0.6, size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawLevelTransition(ctx, canvasWidth, canvasHeight, transitionTime, duration, level, themeName) {
  if (transitionTime <= 0) return;
  const progress = 1 - transitionTime / duration;

  // Wipe effect
  const wipeWidth = canvasWidth * 0.15;
  const wipeX = progress < 0.5
    ? -wipeWidth + (canvasWidth + wipeWidth * 2) * (progress * 2)
    : canvasWidth + wipeWidth;

  if (progress < 0.5) {
    ctx.save();
    ctx.fillStyle = `rgba(255, 200, 100, ${0.15 * (1 - progress * 2)})`;
    ctx.fillRect(wipeX - wipeWidth, 0, wipeWidth, canvasHeight);
    ctx.restore();
  }

  // Banner
  const bannerAlpha = progress < 0.15 ? progress / 0.15
    : progress > 0.7 ? (1 - progress) / 0.3
    : 1;

  if (bannerAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = bannerAlpha * 0.85;
    ctx.fillStyle = "rgba(8, 7, 6, 0.7)";
    const bannerH = 90;
    const bannerY = canvasHeight / 2 - bannerH / 2;
    ctx.fillRect(0, bannerY, canvasWidth, bannerH);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd28e";
    ctx.font = '700 42px "Impact", "Haettenschweiler", sans-serif';
    ctx.fillText(`LEVEL ${level}`, canvasWidth / 2, canvasHeight / 2 - 6);
    ctx.fillStyle = "#f4dcc1";
    ctx.font = '500 18px "Bahnschrift", "Segoe UI", sans-serif';
    ctx.fillText(themeName || "Wasteland", canvasWidth / 2, canvasHeight / 2 + 26);
    ctx.textAlign = "left";
    ctx.restore();
  }
}

function drawStreakIndicator(ctx, canvasWidth, streakCount, streakFlash) {
  if (streakCount < 2) return;
  const x = canvasWidth / 2;
  const y = 52;

  ctx.save();
  ctx.textAlign = "center";

  if (streakFlash > 0) {
    const flashAlpha = streakFlash / 1.2;
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle = "#ffdd44";
    ctx.font = '700 28px "Impact", "Haettenschweiler", sans-serif';
    ctx.fillText(`STREAK x${streakCount}!`, x, y);
  } else {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#ffd28e";
    ctx.font = '600 16px "Bahnschrift", "Segoe UI", sans-serif';
    ctx.fillText(`Streak: ${streakCount}`, x, y);
  }

  ctx.textAlign = "left";
  ctx.restore();
}

function drawRunHistory(ctx, canvasWidth, canvasHeight, runHistory) {
  if (!runHistory || runHistory.length === 0) return;
  const x = canvasWidth / 2;
  let y = canvasHeight / 2 + 100;

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "#f4dcc1";
  ctx.font = '600 14px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.fillText("Recent Runs:", x, y);
  y += 20;

  ctx.font = '500 12px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.fillStyle = "rgba(244, 220, 193, 0.7)";
  const shown = runHistory.slice(0, 5);
  for (const run of shown) {
    ctx.fillText(`Lv${run.level} | Score: ${run.score} | Streak: ${run.streak}`, x, y);
    y += 16;
  }
  ctx.textAlign = "left";
  ctx.restore();
}

function drawBurnZones(ctx, burnZones, config, elapsedSeconds) {
  if (!burnZones || burnZones.length === 0) return;
  const { cell } = config;
  const cols = Math.floor(config.worldWidth / cell);
  ctx.save();
  for (const bz of burnZones) {
    const col = bz.idx % cols;
    const row = Math.floor(bz.idx / cols);
    const x = col * cell;
    const y = row * cell;
    const alpha = Math.min(1, bz.timeLeft / 0.5) * 0.6;
    const flicker = 0.8 + Math.sin(elapsedSeconds * 15 + bz.idx) * 0.2;
    ctx.globalAlpha = alpha * flicker;
    ctx.fillStyle = "#ff4400";
    ctx.fillRect(x, y, cell, cell);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255, 200, 50, ${alpha * 0.4})`;
    ctx.fillRect(x - 1, y - 1, cell + 2, cell + 2);
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();
}

function drawClaimParticles(ctx, particles) {
  if (!particles || particles.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    const age = p.life / p.maxLife;
    const alpha = (1 - age) * 0.8;
    if (alpha <= 0.01) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `hsl(${p.hue}, 100%, ${60 + age * 20}%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1 - age * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawShockwaves(ctx, shockwaves) {
  if (!shockwaves || shockwaves.length === 0) return;
  ctx.save();
  for (const sw of shockwaves) {
    const age = sw.life / sw.maxLife;
    const alpha = (1 - age) * 0.6;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = sw.color || "#ff6622";
    ctx.lineWidth = 3 * (1 - age);
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCRTFilter(ctx, canvasWidth, canvasHeight) {
  ctx.save();
  // Scanlines
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#000";
  for (let y = 0; y < canvasHeight; y += 3) {
    ctx.fillRect(0, y, canvasWidth, 1);
  }
  // Vignette
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(
    canvasWidth / 2, canvasHeight / 2, canvasWidth * 0.3,
    canvasWidth / 2, canvasHeight / 2, canvasWidth * 0.75
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  // Subtle RGB shift
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.015;
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(1, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = "#0000ff";
  ctx.fillRect(-1, 0, canvasWidth, canvasHeight);
  ctx.restore();
}

function drawKillCamEffect(ctx, canvasWidth, canvasHeight, killCamTime) {
  if (killCamTime <= 0) return;
  const alpha = killCamTime / 0.3;
  ctx.save();
  // Radial blur effect (simulated with semi-transparent overlay)
  const g = ctx.createRadialGradient(
    canvasWidth / 2, canvasHeight / 2, canvasWidth * 0.1,
    canvasWidth / 2, canvasHeight / 2, canvasWidth * 0.6
  );
  g.addColorStop(0, `rgba(60, 10, 10, 0)`);
  g.addColorStop(1, `rgba(60, 10, 10, ${0.3 * alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  // "SLOW-MO" text flash
  ctx.globalAlpha = alpha * 0.5;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ff4444";
  ctx.font = '700 20px "Impact", sans-serif';
  ctx.fillText("SLOW-MO", canvasWidth / 2, canvasHeight / 2 + 60);
  ctx.textAlign = "left";
  ctx.restore();
}

function drawAchievementFlash(ctx, canvasWidth, flash) {
  if (!flash) return;
  const alpha = Math.min(1, flash.time / 0.5, (3 - (3 - flash.time)) > 2 ? (3 - flash.time) : 1);
  ctx.save();
  ctx.globalAlpha = Math.min(1, flash.time < 0.5 ? flash.time / 0.5 : flash.time > 2.5 ? (3 - flash.time) / 0.5 : 1) * 0.9;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(8, 7, 6, 0.7)";
  ctx.fillRect(canvasWidth / 2 - 150, 70, 300, 40);
  ctx.fillStyle = "#ffdd44";
  ctx.font = '700 18px "Impact", sans-serif';
  ctx.fillText(`ACHIEVEMENT: ${flash.name}`, canvasWidth / 2, 96);
  ctx.textAlign = "left";
  ctx.restore();
}

function drawStunnedEffect(ctx, enemy, elapsedSeconds) {
  if (!enemy.stunTimer || enemy.stunTimer <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.4 + Math.sin(elapsedSeconds * 10) * 0.2;
  ctx.strokeStyle = "#ffdd44";
  ctx.lineWidth = 2;
  // Stars around stunned enemy
  for (let i = 0; i < 3; i++) {
    const angle = elapsedSeconds * 3 + i * (Math.PI * 2 / 3);
    const sx = enemy.x + Math.cos(angle) * (enemy.radius + 8);
    const sy = enemy.y + Math.sin(angle) * (enemy.radius + 8);
    ctx.beginPath();
    ctx.arc(sx, sy, 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHud(ctx, state, canvasWidth, config, touchMode, score, highScore, theme, streakCount) {
  const percent = Math.round(state.claimedPercent * 100);
  const nitro = state.nitro ?? { activeSeconds: 0, cooldownSeconds: 0 };
  const nitroReady = nitro.activeSeconds <= 0 && nitro.cooldownSeconds <= 0;
  const nitroActive = nitro.activeSeconds > 0;
  const level = state.level ?? 1;
  const enemyCount = state.enemyCount ?? (state.enemies?.length ?? 1);

  ctx.fillStyle = "rgba(12, 9, 7, 0.62)";
  ctx.fillRect(18, 14, 390, 155);
  ctx.strokeStyle = "rgba(255, 194, 128, 0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(18, 14, 390, 155);

  const hudColor = theme?.hudAccent || "#f5d4a5";
  ctx.fillStyle = hudColor;
  ctx.font = '600 20px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.fillText(`Territory: ${percent}% / 75%`, 34, 46);
  ctx.fillText(`Lives: ${state.lives}`, 34, 74);
  ctx.font = '600 16px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.fillText(`Level: ${level}  Enemies: ${enemyCount}`, 34, 95);

  // Score
  ctx.fillStyle = "#ffd28f";
  ctx.font = '600 16px "Bahnschrift", "Segoe UI", sans-serif';
  const streakTxt = streakCount >= 2 ? `  Streak: ${streakCount}` : "";
  ctx.fillText(`Score: ${score}  High: ${highScore}${streakTxt}`, 34, 114);

  const nitroLabel = nitroActive
    ? `IGNITION ACTIVE ${nitro.activeSeconds.toFixed(1)}s`
    : nitroReady
      ? touchMode
        ? "IGNITION READY (Tap Ignition)"
        : "IGNITION READY (Space/Shift)"
      : `IGNITION COOLING ${nitro.cooldownSeconds.toFixed(1)}s`;
  ctx.fillStyle = nitroActive ? "#ffd28f" : nitroReady ? "#ffb36f" : "rgba(245, 212, 165, 0.88)";
  ctx.font = '600 14px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.fillText(nitroLabel, 34, 134);

  const barX = 34;
  const barY = 141;
  const barWidth = 260;
  const barHeight = 9;
  let fill = 1;
  if (nitroActive) {
    fill = nitro.activeSeconds / config.ignitionNitroDuration;
  } else if (!nitroReady) {
    fill = 1 - nitro.cooldownSeconds / config.ignitionNitroCooldown;
  }
  fill = Math.max(0, Math.min(1, fill));

  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.fillStyle = nitroActive ? "rgba(255, 180, 78, 0.95)" : "rgba(214, 120, 58, 0.92)";
  ctx.fillRect(barX, barY, barWidth * fill, barHeight);
  ctx.strokeStyle = "rgba(255, 206, 152, 0.85)";
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barWidth, barHeight);

  // Active powerups display
  const activePowerups = state.activePowerups ?? [];
  if (activePowerups.length > 0) {
    let px = 34;
    const py = 164;
    ctx.font = '600 11px "Bahnschrift", "Segoe UI", sans-serif';
    for (const ap of activePowerups) {
      const def = POWERUP_TYPES[ap.type];
      if (!def) continue;
      ctx.fillStyle = def.color;
      ctx.fillText(`${def.label} ${ap.remaining.toFixed(1)}s`, px, py);
      px += ctx.measureText(`${def.label} ${ap.remaining.toFixed(1)}s`).width + 12;
    }
  }

  ctx.fillStyle = "rgba(245, 212, 165, 0.7)";
  ctx.font = '500 14px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.fillText(`${theme?.name || "Wasteland"} Sector`, canvasWidth - 170, 32);
}

function drawDamageFlash(ctx, canvasWidth, canvasHeight, flashTime) {
  if (flashTime <= 0) return;
  const alpha = flashTime / 0.35;
  ctx.save();
  // Red vignette
  const g = ctx.createRadialGradient(
    canvasWidth / 2, canvasHeight / 2, canvasWidth * 0.2,
    canvasWidth / 2, canvasHeight / 2, canvasWidth * 0.7
  );
  g.addColorStop(0, `rgba(180, 20, 10, 0)`);
  g.addColorStop(1, `rgba(180, 20, 10, ${0.4 * alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Border flash
  ctx.strokeStyle = `rgba(255, 40, 20, ${0.6 * alpha})`;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, canvasWidth - 6, canvasHeight - 6);
  ctx.restore();
}

function drawPauseOverlay(ctx, canvasWidth, canvasHeight) {
  ctx.fillStyle = "rgba(8, 7, 6, 0.6)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd28e";
  ctx.font = '700 52px "Impact", "Haettenschweiler", sans-serif';
  ctx.fillText("PAUSED", canvasWidth / 2, canvasHeight / 2 - 10);
  ctx.fillStyle = "#f4dcc1";
  ctx.font = '500 20px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.fillText("Press P or Esc to resume", canvasWidth / 2, canvasHeight / 2 + 30);
  ctx.textAlign = "left";
}

function drawTutorial(ctx, canvasWidth, canvasHeight, tutorialTime, touchMode) {
  const fadeIn = Math.min(1, tutorialTime / 0.5);
  const fadeOut = Math.max(0, 1 - (tutorialTime - 3.5) / 1.5);
  const alpha = Math.min(fadeIn, fadeOut);
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha * 0.85;
  ctx.textAlign = "center";

  const y = canvasHeight - 60;
  ctx.fillStyle = "rgba(12, 9, 7, 0.7)";
  ctx.fillRect(canvasWidth / 2 - 240, y - 22, 480, 34);

  ctx.fillStyle = "#ffd9ac";
  ctx.font = '500 15px "Bahnschrift", "Segoe UI", sans-serif';
  if (touchMode) {
    ctx.fillText("Drive into open territory and return to walls to claim area!", canvasWidth / 2, y);
  } else {
    ctx.fillText("WASD to move | Drive into open territory | Return to walls to claim", canvasWidth / 2, y);
  }
  ctx.textAlign = "left";
  ctx.restore();
}

function drawEndMessage(ctx, canvasWidth, canvasHeight, didWin, restartPrompt, score, highScore) {
  ctx.fillStyle = "rgba(8, 7, 6, 0.72)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.textAlign = "center";
  ctx.fillStyle = didWin ? "#ffd28e" : "#ff9e69";
  ctx.font = '700 58px "Impact", "Haettenschweiler", sans-serif';
  ctx.fillText(didWin ? "SECTOR SECURED" : "WRECKED OUT", canvasWidth / 2, canvasHeight / 2 - 30);
  ctx.fillStyle = "#ffd28f";
  ctx.font = '600 24px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.fillText(`Score: ${score}`, canvasWidth / 2, canvasHeight / 2 + 10);
  if (score >= highScore && score > 0) {
    ctx.fillStyle = "#ffdd44";
    ctx.font = '600 18px "Bahnschrift", "Segoe UI", sans-serif';
    ctx.fillText("NEW HIGH SCORE!", canvasWidth / 2, canvasHeight / 2 + 36);
  }
  ctx.fillStyle = "#f4dcc1";
  ctx.font = '500 22px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.fillText(restartPrompt, canvasWidth / 2, canvasHeight / 2 + 64);
  ctx.textAlign = "left";
}

export function renderWorld(ctx, game) {
  const {
    canvasWidth,
    canvasHeight,
    elapsedSeconds,
    worldWidth,
    worldHeight,
    worldOffsetX,
    worldOffsetY,
    viewScale,
    state,
    config,
    trailDanger,
    highContrastMode,
    claimFlashCells,
    claimFlashTime,
    theme,
    exhaustParticles,
    burnZones,
    claimParticles,
    shockwaves,
    carSkin,
  } = game;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  drawDustBackground(ctx, canvasWidth, canvasHeight, elapsedSeconds, theme);

  ctx.save();
  ctx.translate(worldOffsetX, worldOffsetY);
  ctx.scale(viewScale, viewScale);

  ctx.fillStyle = "#1a1411";
  ctx.fillRect(0, 0, worldWidth, worldHeight);

  drawGridGlow(ctx, worldWidth, worldHeight, config.cell, theme);

  // Cached terrain rendering
  const cacheVersion = game.terrainCacheVersion ?? 0;
  if (cacheVersion !== terrainCacheVersion || !cachedTerrainCanvas) {
    const cached = renderTerrainToCache(state, config, highContrastMode, theme);
    cachedTerrainCanvas = cached.terrainCanvas;
    cachedEdgeCanvas = cached.edgeCanvas;
    terrainCacheVersion = cacheVersion;
  }
  if (cachedTerrainCanvas) {
    ctx.drawImage(cachedTerrainCanvas, 0, 0);
  }

  drawTrail(ctx, state, config, elapsedSeconds, trailDanger || 0, highContrastMode);
  drawClaimFlash(ctx, claimFlashCells, claimFlashTime, config);

  // Burn zones
  drawBurnZones(ctx, burnZones, config, elapsedSeconds);

  // Exhaust particles
  drawExhaustParticles(ctx, exhaustParticles);

  drawSmoke(ctx, state.smoke, elapsedSeconds);
  drawSparks(ctx, state.sparks, elapsedSeconds);

  // Claim particles
  drawClaimParticles(ctx, claimParticles);

  const enemies = state.enemies ?? (state.enemy ? [state.enemy] : []);
  for (const enemy of enemies) {
    if (enemy.dead) continue; // Don't render dead enemies
    drawEnemy(ctx, enemy, elapsedSeconds);
    drawStunnedEffect(ctx, enemy, elapsedSeconds);
  }

  // Shockwave rings
  drawShockwaves(ctx, shockwaves);

  // Enemy warning indicators (skip dead)
  const aliveEnemies = enemies.filter(e => !e.dead);
  drawEnemyWarningIndicators(ctx, aliveEnemies, state.player, worldWidth, worldHeight);

  // Edges from cache
  if (cachedEdgeCanvas) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(cachedEdgeCanvas, 0, 0);
    ctx.restore();
  }

  // Powerups
  drawPowerups(ctx, state.powerups ?? [], elapsedSeconds);

  const shielded = (state.activePowerups ?? []).some(p => p.type === "shield");
  drawCar(ctx, state.player, elapsedSeconds, shielded, carSkin);

  ctx.strokeStyle = "rgba(255, 210, 159, 0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, worldWidth, worldHeight);
  ctx.restore();
}

export function renderOverlay(ctx, game) {
  const {
    canvasWidth,
    canvasHeight,
    touchMode,
    state,
    config,
    score,
    highScore,
    paused,
    damageFlash,
    tutorialShown,
    tutorialTime,
    theme,
    levelTransitionTime,
    levelTransitionDuration,
    levelTransitionLevel,
    streakCount,
    streakFlash,
    runHistory,
    killCamTime,
    crtEnabled,
    achievementFlash,
    unlockedAchievements,
    cumulativeScore,
  } = game;
  const restartPrompt = touchMode ? "Tap Ignition to restart" : "Press Space to restart";

  drawHud(ctx, state, canvasWidth, config, touchMode, score || 0, highScore || 0, theme, streakCount || 0);
  drawMinimap(ctx, state, config, canvasWidth);

  // Streak indicator
  drawStreakIndicator(ctx, canvasWidth, streakCount || 0, streakFlash || 0);

  // Tutorial overlay
  if (!tutorialShown && state.mode === "playing") {
    drawTutorial(ctx, canvasWidth, canvasHeight, tutorialTime || 0, touchMode);
  }

  if (state.mode === "won") {
    drawEndMessage(ctx, canvasWidth, canvasHeight, true, restartPrompt, score || 0, highScore || 0);
  } else if (state.mode === "lost") {
    drawEndMessage(ctx, canvasWidth, canvasHeight, false, restartPrompt, score || 0, highScore || 0);
    drawRunHistory(ctx, canvasWidth, canvasHeight, runHistory);
    // Show unlocked achievements on death screen
    if (unlockedAchievements && unlockedAchievements.length > 0) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(244, 220, 193, 0.5)";
      ctx.font = '500 11px "Bahnschrift", "Segoe UI", sans-serif';
      ctx.fillText(`Badges: ${unlockedAchievements.join(", ")}`, canvasWidth / 2, canvasHeight / 2 + 195);
      ctx.textAlign = "left";
      ctx.restore();
    }
  }

  // Kill cam effect
  if (killCamTime > 0) {
    drawKillCamEffect(ctx, canvasWidth, canvasHeight, killCamTime);
  }

  // Damage flash (screen-space)
  if (damageFlash > 0) {
    drawDamageFlash(ctx, canvasWidth, canvasHeight, damageFlash);
  }

  // Achievement flash
  drawAchievementFlash(ctx, canvasWidth, achievementFlash);

  // Level transition animation
  if (levelTransitionTime > 0) {
    drawLevelTransition(ctx, canvasWidth, canvasHeight, levelTransitionTime, levelTransitionDuration || 1.8, levelTransitionLevel || 1, theme?.name);
  }

  // CRT filter (always last)
  if (crtEnabled) {
    drawCRTFilter(ctx, canvasWidth, canvasHeight);
  }

  // Pause overlay
  if (paused) {
    drawPauseOverlay(ctx, canvasWidth, canvasHeight);
  }
}

export function renderFrame(ctx, game) {
  renderWorld(ctx, game);
  renderOverlay(ctx, game);
}
