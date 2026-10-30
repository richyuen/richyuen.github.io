// ============================================
// YEARS OF EXPERIENCE (base year: 2022 = 14 years)
// ============================================
const yearsEl = document.getElementById('years-experience');
if (yearsEl) {
    yearsEl.textContent = new Date().getFullYear() - 2002;
}

// ============================================
// MOBILE HAMBURGER MENU
// ============================================
const navToggle = document.getElementById('navToggle');
const nav = document.querySelector('.nav');

navToggle.addEventListener('click', () => {
    nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', nav.classList.contains('open'));
});

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        nav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
    });
});

// ============================================
// SMOOTH SCROLL FOR NAVIGATION
// ============================================
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        const targetId = link.getAttribute('href');

        // Only prevent default for anchor links (starting with #)
        if (targetId.startsWith('#')) {
            e.preventDefault();
            const targetSection = document.querySelector(targetId);

            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
        // External links navigate normally
    });
});

// ============================================
// REVEAL ON SCROLL
// ============================================
const revealElements = document.querySelectorAll('[data-reveal]');

const revealOnScroll = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
            setTimeout(() => {
                entry.target.classList.add('reveal');
            }, index * 100);
            revealOnScroll.unobserve(entry.target);
        }
    });
}, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
});

revealElements.forEach(element => {
    revealOnScroll.observe(element);
});

// ============================================
// HOLOGRAPHIC TILT (project cards)
// Writes transform only on .holo-card; perspective comes from
// .holo-scene in CSS, and data-reveal lives on the scene so the
// reveal animation never fights the tilt transform.
// ============================================
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const activeHolo = new Set();

function initHolo(el, { maxTilt = 14, lerp = 0.1 } = {}) {
    if (REDUCED_MOTION) return; // CSS pins the foil at half opacity instead

    const s = { el, tx: 0, ty: 0, cx: 0, cy: 0, raf: 0 };

    const tick = () => {
        s.cx += (s.tx - s.cx) * lerp;
        s.cy += (s.ty - s.cy) * lerp;
        el.style.transform = `rotateX(${s.cx}deg) rotateY(${s.cy}deg)`;

        if (Math.abs(s.tx - s.cx) + Math.abs(s.ty - s.cy) < 0.01) {
            s.cx = s.tx;
            s.cy = s.ty;
            s.raf = 0;
            activeHolo.delete(s);
            return;
        }
        s.raf = requestAnimationFrame(tick);
    };

    const start = () => {
        if (!s.raf && !document.hidden) {
            activeHolo.add(s);
            s.raf = requestAnimationFrame(tick);
        }
    };

    const setFromPointer = (e) => {
        if (e.pointerType === 'touch') return; // avoid wobble while scrolling
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;   // 0..1
        const py = (e.clientY - r.top) / r.height;
        s.ty = (px - 0.5) * 2 * maxTilt;              // rotateY from X
        s.tx = (0.5 - py) * 2 * maxTilt;              // rotateX from Y (inverted)
        el.style.setProperty('--pos-x', `${px * 100}%`);
        el.style.setProperty('--pos-y', `${py * 100}%`);
        start();
    };

    const reset = () => {
        s.tx = 0;
        s.ty = 0;
        el.style.setProperty('--pos-x', '50%');
        el.style.setProperty('--pos-y', '50%');
        start();
    };

    el.addEventListener('pointermove', setFromPointer);
    el.addEventListener('pointerdown', setFromPointer);
    el.addEventListener('pointerleave', reset);
    el.addEventListener('blur', reset);
}

document.querySelectorAll('.holo-card').forEach(card => {
    initHolo(card, { maxTilt: Number(card.dataset.tilt) || 14 });
});

// ============================================
// CURSOR TRAIL
// Glowing particles follow the pointer with additive blending.
// When the pointer has been idle for a while, a slow wandering
// path keeps a faint trail alive. Pauses while the tab is hidden.
// ============================================
const aurora = document.querySelector('.aurora');

const trail = (() => {
    const canvas = document.getElementById('cursorTrail');
    if (!canvas || REDUCED_MOTION) return null;
    const ctx = canvas.getContext('2d');

    const COLORS = ['#b8c9a3', '#d8c3a0', '#c9c2b8', '#f4a7b9']; // sage, tan, stone, blush
    const MAX = 120;
    const IDLE_MS = 2500;
    const particles = [];
    const auto = { t: 0 };
    let dpr = 1, w = 0, h = 0;
    let lastX = null, lastY = null, lastMove = -Infinity;
    let raf = 0;

    const resize = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawn = (x, y, spread = 1) => {
        if (particles.length >= MAX) particles.shift();
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 0.8 * spread,
            vy: (Math.random() - 0.5) * 0.8 * spread - 0.2,
            r: 1.5 + Math.random() * 3.5,
            life: 1,
            decay: 0.012 + Math.random() * 0.02,
            color: COLORS[(Math.random() * COLORS.length) | 0],
        });
    };

    const onMove = (e) => {
        const x = e.clientX, y = e.clientY;
        if (lastX !== null) {
            // Fill gaps on fast moves so the trail stays continuous
            const dist = Math.hypot(x - lastX, y - lastY);
            const steps = Math.min(Math.ceil(dist / 8), 6);
            for (let i = 1; i <= steps; i++) {
                spawn(lastX + (x - lastX) * (i / steps), lastY + (y - lastY) * (i / steps));
            }
        } else {
            spawn(x, y);
        }
        lastX = x;
        lastY = y;
        lastMove = performance.now();
        start();
    };

    const frame = (now) => {
        // Idle drift: a slow Lissajous path across the viewport
        if (now - lastMove > IDLE_MS) {
            auto.t += 0.018;
            const ax = w / 2 + Math.cos(auto.t * 0.7) * w * 0.35;
            const ay = h / 2 + Math.sin(auto.t * 1.1) * h * 0.3;
            if (Math.random() < 0.5) spawn(ax, ay, 0.6);
        }

        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.98;
            p.vy *= 0.98;
            p.life -= p.decay;
            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }
            const glow = p.r * 4;
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
            g.addColorStop(0, p.color);
            g.addColorStop(1, 'transparent');
            ctx.globalAlpha = p.life * 0.55;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        raf = requestAnimationFrame(frame);
    };

    const start = () => {
        if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const stop = () => {
        cancelAnimationFrame(raf);
        raf = 0;
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { lastX = lastY = null; });
    start();
    return { start, stop };
})();

document.addEventListener('visibilitychange', () => {
    aurora?.classList.toggle('paused', document.hidden);
    if (trail) document.hidden ? trail.stop() : trail.start();
    if (document.hidden) {
        activeHolo.forEach(s => {
            cancelAnimationFrame(s.raf);
            s.raf = 0;
        });
        activeHolo.clear();
    }
});

// ============================================
// SPLIT-FLAP BOARD (hero)
// Each tile walks forward through CHARSET until it reaches its
// target letter, one flip per step. Plays the word list once and
// stops on the last word.
// ============================================
(() => {
    const board = document.getElementById('flapBoard');
    const heroName = document.getElementById('heroName');
    if (!board) return;

    const WORDS = ['INVESTOR', 'DEVELOPER', 'BUILDER', 'RICHARD YUEN'];
    const N = Math.max(...WORDS.map(w => w.length));
    const CHARSET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const FLIP_MS = 60;     // one full flip (two halves)
    const STAGGER_MS = 30;  // left-to-right start offset per tile
    const HOLD_MS = 1000;   // pause on each word before the next

    const pad = (w) => {
        const left = Math.floor((N - w.length) / 2);
        return (' '.repeat(left) + w).padEnd(N, ' ');
    };

    const half = (cls) => {
        const el = document.createElement('span');
        el.className = `flap-half ${cls}`;
        el.appendChild(document.createElement('span'));
        return el;
    };

    const tiles = Array.from({ length: N }, () => {
        const el = document.createElement('div');
        el.className = 'flap';
        const parts = {
            top: half('top'),          // new letter, upper half
            bottom: half('bottom'),    // old letter, lower half (until fold lands)
            foldTop: half('top fold'), // old letter falling away
            foldBottom: half('bottom fold'), // new letter swinging down
        };
        Object.values(parts).forEach(p => el.appendChild(p));
        parts.foldTop.style.visibility = 'hidden';
        parts.foldBottom.style.visibility = 'hidden';
        board.appendChild(el);
        return { el, parts, ch: ' ' };
    });

    heroName.classList.add('visually-hidden');

    const setText = (part, ch) => { part.firstChild.textContent = ch; };
    const show = (tile, ch) => {
        tile.ch = ch;
        setText(tile.parts.top, ch);
        setText(tile.parts.bottom, ch);
    };

    if (REDUCED_MOTION) {
        pad(WORDS[WORDS.length - 1]).split('').forEach((ch, i) => show(tiles[i], ch));
        return;
    }

    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    const flipOnce = async (tile, next) => {
        const { top, bottom, foldTop, foldBottom } = tile.parts;
        setText(foldTop, tile.ch);
        setText(foldBottom, next);
        setText(top, next);
        foldTop.style.visibility = 'visible';
        const d = FLIP_MS / 2;
        // Timing is driven by timers, not animation.finished, so a stalled
        // animation clock can never freeze the board mid-word.
        const a1 = foldTop.animate(
            [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }],
            { duration: d, easing: 'ease-in', fill: 'forwards' }
        );
        await wait(d);
        foldTop.style.visibility = 'hidden';
        a1.cancel();
        foldBottom.style.visibility = 'visible';
        const a2 = foldBottom.animate(
            [{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }],
            { duration: d, easing: 'ease-out', fill: 'forwards' }
        );
        await wait(d);
        setText(bottom, next);
        foldBottom.style.visibility = 'hidden';
        a2.cancel();
        tile.ch = next;
    };

    const flipTo = async (tile, target) => {
        while (tile.ch !== target) {
            const next = CHARSET[(CHARSET.indexOf(tile.ch) + 1) % CHARSET.length];
            await flipOnce(tile, next);
        }
    };

    const whenVisible = () => document.hidden
        ? new Promise(r => document.addEventListener('visibilitychange', function h() {
            if (!document.hidden) { document.removeEventListener('visibilitychange', h); r(); }
        }))
        : Promise.resolve();

    tiles.forEach(t => show(t, ' '));

    (async () => {
        await wait(400);
        for (let w = 0; w < WORDS.length; w++) {
            await whenVisible();
            const target = pad(WORDS[w]);
            await Promise.all(tiles.map((t, i) =>
                wait(i * STAGGER_MS).then(() => flipTo(t, target[i]))
            ));
            if (w < WORDS.length - 1) await wait(HOLD_MS);
        }
    })();
})();

// ============================================
// PROJECT SPEED DIAL
// ============================================
const speedDial = document.getElementById('speedDial');
const speedDialFab = document.getElementById('speedDialFab');

const setDialOpen = (open) => {
    speedDial.classList.toggle('open', open);
    speedDialFab.setAttribute('aria-expanded', String(open));
};

speedDialFab.addEventListener('click', () => {
    setDialOpen(!speedDial.classList.contains('open'));
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && speedDial.classList.contains('open')) {
        setDialOpen(false);
        speedDialFab.focus();
    }
});

document.addEventListener('pointerdown', (e) => {
    if (!speedDial.contains(e.target)) setDialOpen(false);
});

// ============================================
// BACK TO TOP BUTTON
// ============================================
const backToTopButton = document.getElementById('backToTop');

window.addEventListener('scroll', () => {
    if (window.pageYOffset > 500) {
        backToTopButton.classList.add('visible');
    } else {
        backToTopButton.classList.remove('visible');
    }
});

backToTopButton.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// ============================================
// NAVIGATION ACTIVE STATE
// ============================================
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');

window.addEventListener('scroll', () => {
    let current = '';

    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;

        if (window.pageYOffset >= sectionTop - 200) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
});

console.log('%cRichard Yuen', 'font-weight: bold;');
