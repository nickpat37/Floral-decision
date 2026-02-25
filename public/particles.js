/**
 * Particles background - vanilla JS implementation
 * Matches the React Particles component config:
 * particleCount=200, particleSpread=10, speed=1.1,
 * particleColors=["#ffffff","#94e3fe"], moveParticlesOnHover=false,
 * particleBaseSize=100, sizeRandomness=0.2, disableRotation
 */
(function () {
  const CONFIG = {
    particleCount: 200,
    particleSpread: 10,
    speed: 1.1,
    particleColors: ['#ffffff', '#94e3fe'],
    particleBaseSize: 100,
    sizeRandomness: 0.2,
  };

  function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const int = parseInt(hex, 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  }

  function initParticles(container) {
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'particles-canvas';
    // Append so flower container (first child) gets priority in layout; canvas has z-index: 0, flower has z-index: 1
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const palette = CONFIG.particleColors.map(hexToRgb);

    const particles = [];
    for (let i = 0; i < CONFIG.particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.cbrt(Math.random()) * CONFIG.particleSpread;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      const col = palette[Math.floor(Math.random() * palette.length)];
      const sizeMult = 1 + CONFIG.sizeRandomness * (Math.random() - 0.5);
      particles.push({
        x, y, z,
        color: col,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        phaseZ: Math.random() * Math.PI * 2,
        ampX: 0.1 + Math.random() * 1.4,
        ampY: 0.1 + Math.random() * 1.4,
        ampZ: 0.1 + Math.random() * 1.4,
        sizeMult,
      });
    }

    let animationId;
    let startTime = performance.now();

    function resize() {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.scale(dpr, dpr);
    }

    function draw() {
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const elapsed = (performance.now() - startTime) * 0.001 * CONFIG.speed;

      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const scale = Math.min(w, h) / 20;

      particles.forEach((p) => {
        const t = elapsed;
        const sx = Math.sin(t * 0.5 + p.phaseX) * p.ampX;
        const sy = Math.sin(t * 0.5 + p.phaseY) * p.ampY;
        const sz = Math.sin(t * 0.5 + p.phaseZ) * p.ampZ;

        const px = p.x + sx;
        const py = p.y + sy;
        const pz = p.z + sz;

        const proj = 1 + pz * 0.05;
        const screenX = cx + px * scale * proj;
        const screenY = cy + py * scale * proj;

        const baseSize = (CONFIG.particleBaseSize / 100) * scale * p.sizeMult * proj;
        const radius = Math.max(2, baseSize * 0.15);

        const alpha = 0.4 + 0.3 * (1 + pz / CONFIG.particleSpread);
        ctx.beginPath();
        ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
        const [r, g, b] = p.color;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fill();
      });

      animationId = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    draw();

    return function destroy() {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }

  function init() {
    const questionBg = document.querySelector('.question-page-background');
    const flowerContainer = document.querySelector('.flower-page-container');

    if (questionBg) {
      initParticles(questionBg);
    }
    if (flowerContainer) {
      initParticles(flowerContainer);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
