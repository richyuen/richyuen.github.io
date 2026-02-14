function drawDustBackground(ctx, width, height, elapsedSeconds) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#6f4a2f");
  gradient.addColorStop(0.45, "#423021");
  gradient.addColorStop(1, "#1e1712");
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
  ctx.fillStyle = "#201713";
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

function drawGridGlow(ctx, worldWidth, worldHeight, cell) {
  ctx.strokeStyle = "rgba(255, 196, 132, 0.03)";
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

function drawClaimedTerrain(ctx, state, config) {
  const { claimed } = state;
  const { cell } = config;
  const cols = Math.floor(config.worldWidth / cell);
  const rows = Math.floor(config.worldHeight / cell);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const idx = row * cols + col;
      if (!claimed[idx]) {
        continue;
      }
      const x = col * cell;
      const y = row * cell;
      const border = row === 0 || col === 0 || row === rows - 1 || col === cols - 1;
      const tone = ((col * 11 + row * 17) % 5) / 5;
      ctx.fillStyle = border ? "#dccab0" : `rgba(${118 + tone * 24}, ${100 + tone * 20}, ${78 + tone * 16}, 0.92)`;
      ctx.fillRect(x, y, cell, cell);
      if (!border) {
        if ((col + row) % 2 === 0) {
          ctx.fillStyle = "rgba(255, 236, 208, 0.16)";
          ctx.fillRect(x, y, cell, cell * 0.45);
        }
        if ((col + row) % 5 === 0) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
          ctx.fillRect(x, y + cell * 0.55, cell, cell * 0.45);
        }
      }
    }
  }
}

function drawClaimEdges(ctx, state, config) {
  const { claimed } = state;
  const { cell } = config;
  const cols = Math.floor(config.worldWidth / cell);
  const rows = Math.floor(config.worldHeight / cell);
  const segments = [];

  for (let row = 1; row < rows - 1; row += 1) {
    for (let col = 1; col < cols - 1; col += 1) {
      const idx = row * cols + col;
      if (!claimed[idx]) {
        continue;
      }
      const left = claimed[idx - 1];
      const right = claimed[idx + 1];
      const top = claimed[idx - cols];
      const bottom = claimed[idx + cols];
      if (left && right && top && bottom) {
        continue;
      }
      const x = col * cell;
      const y = row * cell;
      if (!left) segments.push([x, y, x, y + cell]);
      if (!right) segments.push([x + cell, y, x + cell, y + cell]);
      if (!top) segments.push([x, y, x + cell, y]);
      if (!bottom) segments.push([x, y + cell, x + cell, y + cell]);
    }
  }

  if (segments.length === 0) {
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  ctx.strokeStyle = "rgba(255, 123, 68, 0.66)";
  ctx.lineWidth = 6.2;
  for (const [x1, y1, x2, y2] of segments) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 245, 220, 0.98)";
  ctx.lineWidth = 2.35;
  for (const [x1, y1, x2, y2] of segments) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTrail(ctx, state, config, elapsedSeconds) {
  const { trailCells } = state;
  const { cell } = config;
  const cols = Math.floor(config.worldWidth / cell);
  ctx.fillStyle = "#ff9f5c";
  for (let i = 0; i < trailCells.length; i += 1) {
    const idx = trailCells[i];
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = col * cell;
    const y = row * cell;
    ctx.fillRect(x, y, cell, cell);
  }

  if (trailCells.length > 0) {
    const pulse = 0.45 + Math.sin(elapsedSeconds * 10) * 0.2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255, 186, 120, ${pulse})`;
    for (let i = 0; i < trailCells.length; i += 1) {
      const idx = trailCells[i];
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      ctx.fillRect(col * cell, row * cell, cell, cell);
    }
    ctx.restore();
  }
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
    ctx.lineCap = "round";
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

  const layers = [
    { base: enemy.radius + 16, wake: 16, noise: 7, color: "rgba(255, 70, 24, 0.17)" },
    { base: enemy.radius + 11, wake: 12, noise: 5, color: "rgba(255, 124, 40, 0.24)" },
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

function drawEnemy(ctx, enemy, elapsedSeconds) {
  drawHeatHaze(ctx, enemy, elapsedSeconds);
  drawEnemyFire(ctx, enemy, elapsedSeconds);

  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(enemy.spin);

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

  ctx.restore();
}

function drawCar(ctx, player, elapsedSeconds) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);

  const bob = Math.sin(elapsedSeconds * 12) * 0.7;
  ctx.translate(0, bob);

  const bodyW = 36;
  const bodyH = 20;

  if (player.invuln > 0) {
    ctx.globalAlpha = 0.7 + Math.sin(elapsedSeconds * 30) * 0.2;
  }

  ctx.fillStyle = "#181615";
  ctx.fillRect(-bodyW * 0.36, -bodyH * 0.72, bodyW * 0.72, bodyH * 1.44);

  ctx.fillStyle = "#82311d";
  ctx.beginPath();
  ctx.moveTo(-bodyW * 0.5, -bodyH * 0.38);
  ctx.lineTo(bodyW * 0.44, -bodyH * 0.48);
  ctx.lineTo(bodyW * 0.58, 0);
  ctx.lineTo(bodyW * 0.44, bodyH * 0.48);
  ctx.lineTo(-bodyW * 0.5, bodyH * 0.38);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#5f2617";
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

function drawHud(ctx, state, canvasWidth) {
  const percent = Math.round(state.claimedPercent * 100);
  ctx.fillStyle = "rgba(12, 9, 7, 0.62)";
  ctx.fillRect(18, 14, 350, 84);
  ctx.strokeStyle = "rgba(255, 194, 128, 0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(18, 14, 350, 84);

  ctx.fillStyle = "#f5d4a5";
  ctx.font = '600 20px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.fillText(`Territory: ${percent}% / 75%`, 34, 46);
  ctx.fillText(`Lives: ${state.lives}`, 34, 74);

  ctx.fillStyle = "rgba(245, 212, 165, 0.7)";
  ctx.font = '500 14px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.fillText("Wasteland Sector", canvasWidth - 170, 32);
}

function drawEndMessage(ctx, canvasWidth, canvasHeight, didWin) {
  ctx.fillStyle = "rgba(8, 7, 6, 0.72)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.textAlign = "center";
  ctx.fillStyle = didWin ? "#ffd28e" : "#ff9e69";
  ctx.font = '700 58px "Impact", "Haettenschweiler", sans-serif';
  ctx.fillText(didWin ? "SECTOR SECURED" : "WRECKED OUT", canvasWidth / 2, canvasHeight / 2 - 18);
  ctx.fillStyle = "#f4dcc1";
  ctx.font = '500 22px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.fillText("Press Space to restart", canvasWidth / 2, canvasHeight / 2 + 30);
  ctx.textAlign = "left";
}

export function renderFrame(ctx, game) {
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
  } = game;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  drawDustBackground(ctx, canvasWidth, canvasHeight, elapsedSeconds);

  ctx.save();
  ctx.translate(worldOffsetX, worldOffsetY);
  ctx.scale(viewScale, viewScale);

  ctx.fillStyle = "#1a1411";
  ctx.fillRect(0, 0, worldWidth, worldHeight);

  drawGridGlow(ctx, worldWidth, worldHeight, config.cell);
  drawClaimedTerrain(ctx, state, config);
  drawTrail(ctx, state, config, elapsedSeconds);
  drawSmoke(ctx, state.smoke, elapsedSeconds);
  drawSparks(ctx, state.sparks, elapsedSeconds);
  drawEnemy(ctx, state.enemy, elapsedSeconds);
  drawClaimEdges(ctx, state, config);
  drawCar(ctx, state.player, elapsedSeconds);

  ctx.strokeStyle = "rgba(255, 210, 159, 0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, worldWidth, worldHeight);
  ctx.restore();

  drawHud(ctx, state, canvasWidth);

  if (state.mode === "won") {
    drawEndMessage(ctx, canvasWidth, canvasHeight, true);
  } else if (state.mode === "lost") {
    drawEndMessage(ctx, canvasWidth, canvasHeight, false);
  }
}
