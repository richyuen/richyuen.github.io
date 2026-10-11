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
// HOLOGRAPHIC TILT (hero card + project cards)
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

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        activeHolo.forEach(s => {
            cancelAnimationFrame(s.raf);
            s.raf = 0;
        });
        activeHolo.clear();
    }
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
