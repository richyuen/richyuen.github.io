import { Game } from "./game.js";
import { InputController } from "./input.js";
import { ensureAudioResumed } from "./audio.js";

const canvas = document.getElementById("game-canvas");
const menuOverlay = document.getElementById("menu-overlay");
const startButton = document.getElementById("start-btn");
const enemyMinusButton = document.getElementById("enemy-minus-btn");
const enemyPlusButton = document.getElementById("enemy-plus-btn");
const touchPad = document.getElementById("touch-pad");
const touchPadKnob = document.getElementById("touch-pad-knob");
const touchRestartButton = document.getElementById("touch-restart");
const touchFullscreenButton = document.getElementById("touch-fullscreen");

const input = new InputController(window);
const game = new Game(canvas, menuOverlay);

let running = true;
let lastTs = performance.now();
let accumulator = 0;
const fixedStep = 1 / 60;
let manualStepping = false;
let activeTouchPointerId = null;

const queryParams = new URLSearchParams(window.location.search);
const forceTouchControls = queryParams.get("touch") === "1";
const portraitParam = queryParams.get("portrait");
const forcePortraitRotation = portraitParam === "1";
const disablePortraitRotation = portraitParam === "0";
const coarsePointer = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0 || "ontouchstart" in window;
const touchEnabled = forceTouchControls || coarsePointer;
let portraitRotationEnabled = null;
let fullscreenAvailable = Boolean(document.fullscreenEnabled && typeof document.documentElement?.requestFullscreen === "function");

if (touchEnabled) {
  document.body.classList.add("touch-enabled");
}
game.setTouchMode(touchEnabled);

function syncFullscreenButtonState() {
  if (!touchFullscreenButton) {
    return;
  }
  touchFullscreenButton.disabled = !fullscreenAvailable;
  touchFullscreenButton.setAttribute("aria-disabled", String(!fullscreenAvailable));
  touchFullscreenButton.textContent = fullscreenAvailable ? "Fullscreen" : "Fullscreen N/A";
}

function shouldRotatePortrait() {
  if (forcePortraitRotation) {
    return true;
  }
  if (disablePortraitRotation) {
    return false;
  }
  return window.matchMedia("(orientation: portrait)").matches || window.innerHeight > window.innerWidth;
}

function applyOrientationMode() {
  const rotatePortrait = shouldRotatePortrait();
  if (rotatePortrait === portraitRotationEnabled) {
    return;
  }
  portraitRotationEnabled = rotatePortrait;
  game.setPortraitRotation(rotatePortrait);
  input.setScreenRotation(rotatePortrait);
  document.body.classList.toggle("portrait-rotated", rotatePortrait);
}

function toggleFullscreen() {
  if (!fullscreenAvailable) {
    return;
  }
  if (!document.fullscreenElement) {
    const shell = document.querySelector(".app-shell");
    if (shell && shell.requestFullscreen) {
      shell.requestFullscreen().catch(() => {
        fullscreenAvailable = false;
        syncFullscreenButtonState();
      });
      window.setTimeout(() => {
        if (!document.fullscreenElement) {
          fullscreenAvailable = false;
          syncFullscreenButtonState();
        }
      }, 260);
    }
    return;
  }
  document.exitFullscreen?.().catch(() => {
    fullscreenAvailable = false;
    syncFullscreenButtonState();
  });
}

function inSetupScreen() {
  return game.state.mode === "menu" || game.state.mode === "lost";
}

function triggerPrimaryAction() {
  ensureAudioResumed();
  if (game.state.mode === "menu") {
    game.startGame();
    input.flush();
    return;
  }
  if (game.state.mode === "lost") {
    game.restartGame();
    input.flush();
  }
}

window.addEventListener("resize", () => {
  applyOrientationMode();
  game.resize();
});

document.addEventListener("fullscreenchange", () => {
  syncFullscreenButtonState();
  applyOrientationMode();
  game.resize();
});

window.addEventListener("orientationchange", () => {
  applyOrientationMode();
  game.resize();
});

window.addEventListener("keydown", (event) => {
  ensureAudioResumed();
  if (event.code === "KeyF") {
    event.preventDefault();
    toggleFullscreen();
  }
  if (event.code === "Escape" && document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
    // Consume the Escape so it doesn't also trigger pause
    input.consume("Escape");
  }

  if (game.state.mode === "playing" && event.code === "Space") {
    event.preventDefault();
  }

  if (event.code === "KeyH") {
    game.toggleHighContrast();
  }

  if (inSetupScreen() && (event.code === "ArrowLeft" || event.code === "KeyA")) {
    event.preventDefault();
    game.adjustStartingEnemyCount(-1);
  }

  if (inSetupScreen() && (event.code === "ArrowRight" || event.code === "KeyD")) {
    event.preventDefault();
    game.adjustStartingEnemyCount(1);
  }

  if (inSetupScreen() && (event.code === "Enter" || event.code === "Space")) {
    event.preventDefault();
    triggerPrimaryAction();
  }
});

function triggerTouchAction() {
  triggerPrimaryAction();
}

function setupTouchControls() {
  if (!touchEnabled || !touchPad || !touchPadKnob) {
    return;
  }

  const resetPad = () => {
    activeTouchPointerId = null;
    input.setVirtualAxis(0, 0);
    touchPadKnob.style.transform = "translate(0px, 0px)";
  };

  const updatePadFromClient = (clientX, clientY) => {
    const rect = touchPad.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const radius = Math.max(18, rect.width * 0.5 - touchPadKnob.offsetWidth * 0.5 - 8);
    const dist = Math.hypot(dx, dy);
    const scale = dist > radius ? radius / dist : 1;
    const clampedX = dx * scale;
    const clampedY = dy * scale;
    const axisX = radius > 0 ? clampedX / radius : 0;
    const axisY = radius > 0 ? clampedY / radius : 0;

    input.setVirtualAxis(axisX, axisY);
    touchPadKnob.style.transform = `translate(${clampedX.toFixed(2)}px, ${clampedY.toFixed(2)}px)`;
  };

  touchPad.addEventListener("pointerdown", (event) => {
    ensureAudioResumed();
    if (activeTouchPointerId !== null) {
      return;
    }
    activeTouchPointerId = event.pointerId;
    touchPad.setPointerCapture(event.pointerId);
    updatePadFromClient(event.clientX, event.clientY);
    event.preventDefault();
  });

  touchPad.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activeTouchPointerId) {
      return;
    }
    updatePadFromClient(event.clientX, event.clientY);
    event.preventDefault();
  });

  const stopPointer = (event) => {
    if (event.pointerId !== activeTouchPointerId) {
      return;
    }
    if (touchPad.hasPointerCapture(event.pointerId)) {
      touchPad.releasePointerCapture(event.pointerId);
    }
    resetPad();
    event.preventDefault();
  };

  touchPad.addEventListener("pointerup", stopPointer);
  touchPad.addEventListener("pointercancel", stopPointer);
  touchPad.addEventListener("lostpointercapture", () => {
    resetPad();
  });

  const releaseTouchSpace = () => {
    input.releaseVirtual("Space");
  };

  touchRestartButton?.addEventListener("pointerdown", (event) => {
    ensureAudioResumed();
    if (game.state.mode === "playing") {
      input.pressVirtual("Space");
    }
    event.preventDefault();
  });
  touchRestartButton?.addEventListener("pointerup", releaseTouchSpace);
  touchRestartButton?.addEventListener("pointercancel", releaseTouchSpace);
  touchRestartButton?.addEventListener("click", (event) => {
    if (game.state.mode !== "playing") {
      triggerTouchAction();
    }
    event.preventDefault();
  });

  touchFullscreenButton?.addEventListener("click", (event) => {
    toggleFullscreen();
    event.preventDefault();
  });

  // Mobile swipe-to-start on canvas
  let swipeStartX = null;
  let swipeStartY = null;
  canvas?.addEventListener("pointerdown", (event) => {
    if (inSetupScreen()) {
      swipeStartX = event.clientX;
      swipeStartY = event.clientY;
    }
    event.preventDefault();
  });
  canvas?.addEventListener("pointermove", (event) => {
    if (swipeStartX === null) return;
    const dx = event.clientX - swipeStartX;
    const dy = event.clientY - swipeStartY;
    const dist = Math.hypot(dx, dy);
    if (dist > 40 && inSetupScreen()) {
      // Swipe detected - start game
      swipeStartX = null;
      swipeStartY = null;
      triggerPrimaryAction();
    }
  });
  canvas?.addEventListener("pointerup", (event) => {
    if (swipeStartX !== null && inSetupScreen()) {
      // Tap (no swipe) - also start
      triggerPrimaryAction();
    }
    swipeStartX = null;
    swipeStartY = null;
  });

  window.addEventListener("blur", () => {
    resetPad();
    releaseTouchSpace();
  });
}

setupTouchControls();
syncFullscreenButtonState();
applyOrientationMode();

startButton?.addEventListener("click", () => {
  triggerPrimaryAction();
});

enemyMinusButton?.addEventListener("click", () => {
  if (inSetupScreen()) {
    game.adjustStartingEnemyCount(-1);
  }
});

enemyPlusButton?.addEventListener("click", () => {
  if (inSetupScreen()) {
    game.adjustStartingEnemyCount(1);
  }
});

function runFixedUpdate(stepCount) {
  for (let i = 0; i < stepCount; i += 1) {
    game.update(fixedStep, input);
  }
}

function frame(ts) {
  if (!running) {
    return;
  }
  applyOrientationMode();
  const dt = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;
  if (!manualStepping) {
    accumulator += dt;
    while (accumulator >= fixedStep) {
      runFixedUpdate(1);
      accumulator -= fixedStep;
    }
  }
  game.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

window.render_game_to_text = () => game.renderToText();
window.advanceTime = async (ms) => {
  manualStepping = true;
  applyOrientationMode();
  game.resize();
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  runFixedUpdate(steps);
  game.render();
};

window.addEventListener("beforeunload", () => {
  running = false;
  input.dispose();
});
