// ============================================
// CURSOR TRAIL
// ============================================
const canvas = document.getElementById('cursor-trail');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const particles = [];
const maxParticles = 50;

class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 3 + 1;
        this.speedX = Math.random() * 2 - 1;
        this.speedY = Math.random() * 2 - 1;
        this.color = Math.random() > 0.5 ? '#00FFFF' : '#FF00FF';
        this.life = 1;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= 0.02;
        if (this.size > 0.2) this.size -= 0.05;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

document.addEventListener('mousemove', (e) => {
    if (particles.length < maxParticles) {
        particles.push(new Particle(e.clientX, e.clientY));
    }
});

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();

        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }

    requestAnimationFrame(animateParticles);
}

animateParticles();

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
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
        // For other links (like math-game.html), let them work normally
    });
});

// ============================================
// PROJECT CARDS REVEAL ON SCROLL
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
// HERO TITLE FIREWORKS EFFECT
// ============================================
const heroTitle = document.getElementById('hero-title');
let fireworksActive = false;

heroTitle.addEventListener('click', () => {
    if (fireworksActive) return;

    fireworksActive = true;
    const fireworksCount = 50;
    const colors = ['#00FFFF', '#FF00FF', '#00FF00', '#FFFF00'];

    // Get the center of the hero title
    const rect = heroTitle.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < fireworksCount; i++) {
        const firework = document.createElement('div');
        firework.style.position = 'fixed';
        firework.style.left = centerX + 'px';
        firework.style.top = centerY + 'px';
        firework.style.width = '10px';
        firework.style.height = '10px';
        firework.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        firework.style.pointerEvents = 'none';
        firework.style.zIndex = '9999';
        firework.style.borderRadius = '50%';
        firework.style.boxShadow = `0 0 10px ${colors[Math.floor(Math.random() * colors.length)]}`;

        document.body.appendChild(firework);

        const angle = (Math.PI * 2 * i) / fireworksCount;
        const velocity = 5 + Math.random() * 10;
        const vx = Math.cos(angle) * velocity;
        const vy = Math.sin(angle) * velocity;

        let x = 0;
        let y = 0;
        let opacity = 1;

        const animate = () => {
            x += vx;
            y += vy + 2;
            opacity -= 0.015;

            firework.style.transform = `translate(${x}px, ${y}px)`;
            firework.style.opacity = opacity;

            if (opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                firework.remove();
            }
        };

        animate();
    }

    setTimeout(() => {
        fireworksActive = false;
    }, 1000);
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

// ============================================
// PARALLAX EFFECT FOR FLOATING PIXELS
// ============================================
window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const pixels = document.querySelectorAll('.pixel-float');

    pixels.forEach((pixel, index) => {
        const speed = 0.5 + (index * 0.1);
        pixel.style.transform = `translateY(${scrolled * speed}px)`;
    });
});

// ============================================
// GRADIENT TEXT ANIMATION
// ============================================
const gradientTexts = document.querySelectorAll('.gradient-text');

gradientTexts.forEach(text => {
    text.style.backgroundSize = '200% 200%';
});

// ============================================
// EASTER EGG: KONAMI CODE
// ============================================
let konamiCode = [];
const konamiPattern = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

document.addEventListener('keydown', (e) => {
    konamiCode.push(e.key);
    konamiCode = konamiCode.slice(-10);

    if (konamiCode.join(',') === konamiPattern.join(',')) {
        document.body.style.animation = 'rainbow 2s linear infinite';

        const style = document.createElement('style');
        style.textContent = `
            @keyframes rainbow {
                0% { filter: hue-rotate(0deg); }
                100% { filter: hue-rotate(360deg); }
            }
        `;
        document.head.appendChild(style);

        setTimeout(() => {
            document.body.style.animation = '';
            style.remove();
        }, 5000);
    }
});

// ============================================
// TYPING EFFECT FOR HERO SUBTITLE (Optional)
// ============================================
function typeWriter(element, text, speed = 100) {
    let i = 0;
    element.textContent = '';

    function type() {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }

    type();
}

// Uncomment to enable typing effect on page load
// window.addEventListener('load', () => {
//     const subtitle = document.querySelector('.hero-subtitle');
//     const originalText = subtitle.textContent;
//     typeWriter(subtitle, originalText, 80);
// });

console.log('%c🚀 Welcome to my portfolio!', 'color: #00FFFF; font-size: 20px; font-weight: bold;');
console.log('%cBuilt with passion and code', 'color: #FF00FF; font-size: 14px;');
