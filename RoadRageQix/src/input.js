export class InputController {
  constructor(target = window) {
    this.keys = new Set();
    this.virtualKeys = new Set();
    this.justPressed = new Set();
    this.virtualAxis = { x: 0, y: 0 };
    this.target = target;

    this.onKeyDown = (event) => {
      if (!this.keys.has(event.code)) {
        this.justPressed.add(event.code);
      }
      this.keys.add(event.code);
    };

    this.onKeyUp = (event) => {
      this.keys.delete(event.code);
    };

    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
  }

  axis() {
    const left = this.isDown("ArrowLeft") || this.isDown("KeyA");
    const right = this.isDown("ArrowRight") || this.isDown("KeyD");
    const up = this.isDown("ArrowUp") || this.isDown("KeyW");
    const down = this.isDown("ArrowDown") || this.isDown("KeyS");

    let x = 0;
    let y = 0;
    if (left) x -= 1;
    if (right) x += 1;
    if (up) y -= 1;
    if (down) y += 1;

    x += this.virtualAxis.x;
    y += this.virtualAxis.y;

    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));

    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.sqrt(2);
      x *= inv;
      y *= inv;
    }

    return { x, y };
  }

  isDown(code) {
    return this.keys.has(code) || this.virtualKeys.has(code);
  }

  setVirtualAxis(x, y) {
    this.virtualAxis.x = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    this.virtualAxis.y = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
  }

  pressVirtual(code) {
    if (!this.isDown(code)) {
      this.justPressed.add(code);
    }
    this.virtualKeys.add(code);
  }

  releaseVirtual(code) {
    this.virtualKeys.delete(code);
  }

  consume(code) {
    const had = this.justPressed.has(code);
    this.justPressed.delete(code);
    return had;
  }

  flush() {
    this.justPressed.clear();
  }

  dispose() {
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
    this.virtualKeys.clear();
    this.setVirtualAxis(0, 0);
  }
}
