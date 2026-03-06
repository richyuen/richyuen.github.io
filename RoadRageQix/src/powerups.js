/** Power-up types and factory */

export const POWERUP_TYPES = {
  shield: { label: "SHIELD", color: "#44bbff", duration: 4, icon: "S" },
  speed: { label: "SPEED", color: "#44ff88", duration: 3.5, icon: ">" },
  slow: { label: "SLOW", color: "#cc88ff", duration: 4, icon: "~" },
  extraLife: { label: "+1 LIFE", color: "#ff4488", duration: 0, icon: "+" },
  scoreMulti: { label: "2x SCORE", color: "#ffdd44", duration: 6, icon: "x" },
};

const typeKeys = Object.keys(POWERUP_TYPES);

export function createPowerup(worldWidth, worldHeight, cell, claimed, cols) {
  // Find a random unclaimed cell for placement
  const maxAttempts = 80;
  for (let i = 0; i < maxAttempts; i++) {
    const x = cell * 3 + Math.random() * (worldWidth - cell * 6);
    const y = cell * 3 + Math.random() * (worldHeight - cell * 6);
    const col = Math.floor(x / cell);
    const row = Math.floor(y / cell);
    const idx = row * cols + col;
    if (!claimed[idx]) {
      const type = typeKeys[Math.floor(Math.random() * typeKeys.length)];
      return {
        type,
        x,
        y,
        radius: 12,
        life: 0,
        maxLife: 12 + Math.random() * 5,
        pulse: Math.random() * Math.PI * 2,
      };
    }
  }
  return null;
}

export function createActivePowerupEffect(type) {
  const def = POWERUP_TYPES[type];
  if (!def || def.duration === 0) return null;
  return {
    type,
    remaining: def.duration,
  };
}
