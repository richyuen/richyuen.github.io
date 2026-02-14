export function createPlayer(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    speed: 210,
    radius: 11,
    invuln: 0,
    trailActive: false,
  };
}

export function createEnemy(x, y) {
  const angle = Math.random() * Math.PI * 2;
  const speed = 180;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: 19,
    spikeCount: 14,
    spin: 0,
    firePhase: 0,
    sparkBudget: 0,
    smokeBudget: 0,
  };
}

export function createSpark(x, y, baseAngle, speedScale) {
  const angleJitter = (Math.random() - 0.5) * 0.7;
  const speed = (90 + Math.random() * 160) * speedScale;
  const angle = baseAngle + angleJitter;
  return {
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 35,
    life: 0,
    maxLife: 0.55 + Math.random() * 0.65,
    size: 0.9 + Math.random() * 1.8,
    glow: 0.78 + Math.random() * 0.42,
    drag: 0.962 + Math.random() * 0.024,
    heat: 0.68 + Math.random() * 0.32,
    flicker: Math.random() * Math.PI * 2,
    bounceLoss: 0.48 + Math.random() * 0.2,
  };
}

export function createSmoke(x, y, baseAngle, speedScale = 1, hotness = 1) {
  const angle = baseAngle + (Math.random() - 0.5) * 0.9;
  const speed = (14 + Math.random() * 52) * speedScale;
  return {
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 12,
    life: 0,
    maxLife: 0.9 + Math.random() * 1.3,
    size: 2.8 + Math.random() * 5.2 + hotness * 1.6,
    density: 0.18 + Math.random() * 0.3 + hotness * 0.2,
    hotness,
    turbulence: Math.random() * Math.PI * 2,
    buoyancy: 0.7 + Math.random() * 0.8,
  };
}
