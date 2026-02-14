export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function cellToIndex(col, row, cols) {
  return row * cols + col;
}

export function toCell(value, cellSize, maxCell) {
  return clamp(Math.floor(value / cellSize), 0, maxCell);
}

export function circleIntersectsSolid(grid, cols, rows, cellSize, x, y, radius) {
  const minCol = toCell(x - radius, cellSize, cols - 1);
  const maxCol = toCell(x + radius, cellSize, cols - 1);
  const minRow = toCell(y - radius, cellSize, rows - 1);
  const maxRow = toCell(y + radius, cellSize, rows - 1);

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const idx = cellToIndex(col, row, cols);
      if (!grid[idx]) {
        continue;
      }
      const left = col * cellSize;
      const top = row * cellSize;
      const nearestX = clamp(x, left, left + cellSize);
      const nearestY = clamp(y, top, top + cellSize);
      const dx = x - nearestX;
      const dy = y - nearestY;
      if (dx * dx + dy * dy <= radius * radius) {
        return true;
      }
    }
  }

  return false;
}

export function circleIntersectsMask(mask, cols, rows, cellSize, x, y, radius) {
  const minCol = toCell(x - radius, cellSize, cols - 1);
  const maxCol = toCell(x + radius, cellSize, cols - 1);
  const minRow = toCell(y - radius, cellSize, rows - 1);
  const maxRow = toCell(y + radius, cellSize, rows - 1);

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const idx = cellToIndex(col, row, cols);
      if (!mask[idx]) {
        continue;
      }
      const left = col * cellSize;
      const top = row * cellSize;
      const nearestX = clamp(x, left, left + cellSize);
      const nearestY = clamp(y, top, top + cellSize);
      const dx = x - nearestX;
      const dy = y - nearestY;
      if (dx * dx + dy * dy <= radius * radius) {
        return true;
      }
    }
  }

  return false;
}
