(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());

  // ---------- Utilities ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const choose = arr => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function shadeColor(hex, percent) {
    const num = parseInt(hex.slice(1), 16);
    let r = (num >> 16) + Math.round(2.55 * percent);
    let g = ((num >> 8) & 0xff) + Math.round(2.55 * percent);
    let b = (num & 0xff) + Math.round(2.55 * percent);
    r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  const COLORS = [
    '#ff4d6d', '#ff9f1c', '#ffd60a', '#80ed99',
    '#4cc9f0', '#4895ef', '#b5179e', '#f72585',
    '#72efdd', '#ffb703'
  ];

  // ---------- Games registry ----------
  const ALL_GAME_IDS = ['balloons', 'dot', 'fireworks', 'matchDots', 'dragDot', 'bubbles', 'peekaboo', 'fingerTrails', 'nightSky', 'animals', 'musicalKeys'];
  const GAME_LABELS = {
    balloons: 'Balloons',
    dot: 'Touch the Dot',
    fireworks: 'Fireworks',
    matchDots: 'Match the Dots',
    dragDot: 'Drag the Dot',
    bubbles: 'Bubbles',
    peekaboo: 'Peekaboo',
    fingerTrails: 'Finger Trails',
    nightSky: 'Night Sky Stars',
    animals: 'Animal Sounds',
    musicalKeys: 'Musical Keys'
  };

  // ---------- Age-based difficulty presets ----------
  const AGE_BANDS = [
    { id: '0-9m', balloonCount: 1, speedMul: 0.32, particleMul: 0.22, sizeMul: 1.55, modeDuration: 60 },
    { id: '9-12m', balloonCount: 1, speedMul: 0.45, particleMul: 0.35, sizeMul: 1.35, modeDuration: 45 },
    { id: '1-2y', balloonCount: 2, speedMul: 0.65, particleMul: 0.55, sizeMul: 1.15, modeDuration: 32 },
    { id: '2-3y', balloonCount: 3, speedMul: 0.85, particleMul: 0.75, sizeMul: 1.0, modeDuration: 25 },
    { id: '3y+', balloonCount: 5, speedMul: 1.0, particleMul: 1.0, sizeMul: 0.9, modeDuration: 20 }
  ];

  // ---------- Settings (per-game, plus one global cycle duration) ----------
  const Settings = {
    modeDuration: AGE_BANDS[0].modeDuration,
    lastBandId: AGE_BANDS[0].id,
    games: {},

    ensureGame(id) {
      if (!this.games[id]) {
        this.games[id] = {
          speedMul: AGE_BANDS[0].speedMul,
          particleMul: AGE_BANDS[0].particleMul,
          balloonCount: AGE_BANDS[0].balloonCount,
          sizeMul: AGE_BANDS[0].sizeMul
        };
      }
      return this.games[id];
    },
    for(id) { return this.ensureGame(id); },

    load() {
      try {
        const saved = JSON.parse(localStorage.getItem('babyGameSettingsV2'));
        if (saved && typeof saved === 'object') {
          if (typeof saved.modeDuration === 'number') this.modeDuration = saved.modeDuration;
          if (saved.lastBandId !== undefined) this.lastBandId = saved.lastBandId;
          if (saved.games && typeof saved.games === 'object') {
            for (const id of Object.keys(saved.games)) {
              const g = saved.games[id];
              if (g && typeof g === 'object') this.games[id] = g;
            }
          }
          return true;
        }
      } catch (e) {}
      return false;
    },
    save() {
      localStorage.setItem('babyGameSettingsV2', JSON.stringify({
        modeDuration: this.modeDuration,
        lastBandId: this.lastBandId,
        games: this.games
      }));
    },
    applyBand(id) {
      const band = AGE_BANDS.find(b => b.id === id);
      if (!band) return;
      this.modeDuration = band.modeDuration;
      this.lastBandId = id;
      ALL_GAME_IDS.forEach(gid => {
        this.games[gid] = {
          speedMul: band.speedMul,
          particleMul: band.particleMul,
          balloonCount: band.balloonCount,
          sizeMul: band.sizeMul
        };
      });
      this.save();
    },
    setGameField(gameId, field, value) {
      this.ensureGame(gameId)[field] = value;
      this.save();
    }
  };
  const hadSavedSettings = Settings.load();
  ALL_GAME_IDS.forEach(id => Settings.ensureGame(id));

  // ---------- Audio ----------
  let actx = null;
  function ensureAudio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume();
  }

  function playTone(freq, dur, type, vol, when = 0) {
    if (!actx) return;
    const t0 = actx.currentTime + when;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function playPop() {
    ensureAudio();
    const f = rand(260, 420);
    playTone(f, 0.18, 'triangle', 0.35);
    playTone(f * 2, 0.08, 'sine', 0.12, 0.01);
  }

  const PENTATONIC = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
  function playChime() {
    ensureAudio();
    const f = choose(PENTATONIC);
    playTone(f, 0.5, 'sine', 0.3);
    playTone(f * 2, 0.4, 'sine', 0.12, 0.03);
  }

  function playTick() {
    ensureAudio();
    const f = rand(700, 900);
    playTone(f, 0.09, 'sine', 0.18);
  }

  function playBlip() {
    ensureAudio();
    const f = rand(500, 700);
    playTone(f, 0.12, 'sine', 0.22);
    playTone(f * 1.5, 0.08, 'sine', 0.08, 0.02);
  }

  function playGiggle() {
    ensureAudio();
    [500, 650, 800].forEach((f, i) => playTone(f, 0.12, 'sine', 0.25, i * 0.09));
  }

  function playSparkle() {
    ensureAudio();
    [800, 1000, 1300].forEach((f, i) => playTone(f, 0.1, 'triangle', 0.2, i * 0.06));
  }

  function playCrackle() {
    ensureAudio();
    const t0 = actx.currentTime;
    const bufferSize = actx.sampleRate * 0.4;
    const buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const decay = 1 - i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * decay * decay;
    }
    const noise = actx.createBufferSource();
    noise.buffer = buffer;
    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.4, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
    const filter = actx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = rand(1200, 2600);
    noise.connect(filter).connect(gain).connect(actx.destination);
    noise.start(t0);

    const f = rand(500, 900);
    playTone(f, 0.3, 'sawtooth', 0.15);
  }

  function playMoo() {
    ensureAudio();
    const t0 = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, t0);
    osc.frequency.linearRampToValueAtTime(90, t0 + 0.3);
    osc.frequency.linearRampToValueAtTime(130, t0 + 0.6);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
    osc.connect(gain).connect(actx.destination);
    osc.start(t0); osc.stop(t0 + 0.75);
  }

  function playWoof() {
    ensureAudio();
    const t0 = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t0);
    osc.frequency.exponentialRampToValueAtTime(140, t0 + 0.12);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    osc.connect(gain).connect(actx.destination);
    osc.start(t0); osc.stop(t0 + 0.2);
  }

  function playMeow() {
    ensureAudio();
    const t0 = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, t0);
    osc.frequency.linearRampToValueAtTime(700, t0 + 0.15);
    osc.frequency.linearRampToValueAtTime(350, t0 + 0.4);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.28, t0 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
    osc.connect(gain).connect(actx.destination);
    osc.start(t0); osc.stop(t0 + 0.5);
  }

  function playQuack() {
    ensureAudio();
    const t0 = actx.currentTime;
    for (let i = 0; i < 2; i++) {
      const start = t0 + i * 0.18;
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, start);
      osc.frequency.exponentialRampToValueAtTime(180, start + 0.1);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      osc.connect(gain).connect(actx.destination);
      osc.start(start); osc.stop(start + 0.16);
    }
  }

  // ---------- Particles ----------
  let particles = [];
  const MAX_PARTICLES = 400;

  function burst(x, y, color, count, speedMin, speedMax, life, gs) {
    const n = Math.max(4, Math.round(count * gs.particleMul));
    for (let i = 0; i < n; i++) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      const a = rand(0, Math.PI * 2);
      const s = rand(speedMin, speedMax) * gs.speedMul;
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life / gs.speedMul,
        maxLife: life / gs.speedMul,
        color,
        size: rand(3, 7),
        gravity: 0.06 * gs.speedMul
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Background ----------
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#141432');
    g.addColorStop(1, '#0a0a18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawGlowDot(x, y, r, color) {
    ctx.save();
    ctx.translate(x, y);
    const grd = ctx.createRadialGradient(0, 0, Math.max(0.001, r * 0.1), 0, 0, r);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.25, color);
    grd.addColorStop(1, color);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---------- Balloon mode ----------
  const Balloons = (() => {
    const gid = 'balloons';
    const gs = () => Settings.for(gid);
    let balloons = [];

    function spawnOne(fromBottom) {
      const s = gs();
      const r = rand(70, 110) * s.sizeMul;
      return {
        x: rand(r, W - r),
        y: fromBottom ? H + r + rand(0, 200) : rand(-H, H),
        r,
        color: choose(COLORS),
        vy: -rand(0.6, 1.3) * s.speedMul,
        sway: rand(0, Math.PI * 2),
        swaySpeed: rand(0.01, 0.02) * s.speedMul,
        swayAmp: rand(0.4, 1.2)
      };
    }

    function init() {
      balloons = [];
      const count = gs().balloonCount;
      for (let i = 0; i < count; i++) balloons.push(spawnOne(false));
    }

    function update() {
      for (const b of balloons) {
        b.sway += b.swaySpeed;
        b.y += b.vy;
        b.x += Math.sin(b.sway) * b.swayAmp;
        if (b.y < -b.r * 2) {
          Object.assign(b, spawnOne(true));
        }
      }
    }

    function drawOne(b) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.r * 0.85, b.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-b.r * 0.12, b.r * 0.95);
      ctx.lineTo(b.r * 0.12, b.r * 0.95);
      ctx.lineTo(0, b.r * 1.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(-b.r * 0.3, -b.r * 0.4, b.r * 0.22, b.r * 0.3, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function draw() {
      for (const b of balloons) drawOne(b);
    }

    function hit(x, y) {
      for (let i = 0; i < balloons.length; i++) {
        const b = balloons[i];
        const dx = x - b.x, dy = y - b.y;
        const rr = b.r * 1.1;
        if ((dx * dx) / (rr * rr) + (dy * dy) / (rr * rr) <= 1) {
          burst(b.x, b.y, b.color, 26, 2, 6, 0.7, gs());
          playPop();
          Object.assign(b, spawnOne(true));
          return true;
        }
      }
      return false;
    }

    return { init, update, draw, hit };
  })();

  // ---------- Touch the Dot mode ----------
  const Dot = (() => {
    const gid = 'dot';
    const gs = () => Settings.for(gid);
    let dot = null;
    let t = 0;

    function place() {
      const r = Math.min(W, H) * 0.14 * gs().sizeMul;
      dot = {
        x: rand(r * 1.3, W - r * 1.3),
        y: rand(r * 1.3, H - r * 1.3),
        r,
        color: choose(COLORS)
      };
    }

    function init() {
      t = 0;
      place();
    }

    function update(dt) {
      t += dt * gs().speedMul;
    }

    function draw() {
      const pulse = 1 + Math.sin(t * 3) * 0.08;
      drawGlowDot(dot.x, dot.y, dot.r * pulse, dot.color);
    }

    function hit(x, y) {
      const dx = x - dot.x, dy = y - dot.y;
      if (Math.sqrt(dx * dx + dy * dy) <= dot.r * 1.15) {
        burst(dot.x, dot.y, dot.color, 30, 1.5, 5, 0.8, gs());
        playChime();
        place();
        return true;
      }
      return false;
    }

    return { init, update, draw, hit };
  })();

  // ---------- Fireworks mode ----------
  const Fireworks = (() => {
    const gid = 'fireworks';
    const gs = () => Settings.for(gid);
    let targets = [];

    function spawnOne() {
      const s = gs();
      const r = rand(50, 80) * s.sizeMul;
      return {
        x: rand(r, W - r),
        y: rand(r, H - r),
        r,
        color: choose(COLORS),
        twinkle: rand(0, Math.PI * 2),
        twinkleSpeed: rand(0.03, 0.06) * s.speedMul,
        appear: 0,
        appearDuration: rand(1.1, 1.6) / s.speedMul
      };
    }

    function init() {
      targets = [];
      const count = gs().balloonCount;
      for (let i = 0; i < count; i++) targets.push(spawnOne());
    }

    function update(dt) {
      for (const t of targets) {
        t.twinkle += t.twinkleSpeed;
        if (t.appear < 1) t.appear = Math.min(1, t.appear + dt / t.appearDuration);
      }
    }

    function drawOne(t) {
      const eased = t.appear * t.appear * (3 - 2 * t.appear);
      const pulse = (1 + Math.sin(t.twinkle) * 0.25) * eased;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.globalAlpha = eased;
      ctx.scale(pulse, pulse);
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, t.r);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.4, t.color);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(0, 0, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = Math.max(2, t.r * 0.06);
      ctx.beginPath();
      ctx.moveTo(-t.r * 0.9, 0); ctx.lineTo(t.r * 0.9, 0);
      ctx.moveTo(0, -t.r * 0.9); ctx.lineTo(0, t.r * 0.9);
      ctx.stroke();
      ctx.restore();
    }

    function draw() {
      for (const t of targets) drawOne(t);
    }

    function hit(x, y) {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (t.appear < 0.5) continue;
        const dx = x - t.x, dy = y - t.y;
        const rr = t.r * 1.2 * t.appear;
        if (dx * dx + dy * dy <= rr * rr) {
          burst(t.x, t.y, t.color, 50, 2, 8, 1.1, gs());
          playCrackle();
          Object.assign(t, spawnOne());
          return true;
        }
      }
      return false;
    }

    return { init, update, draw, hit, trailFade: true };
  })();

  // ---------- Match the Dots mode (drag one dot onto its matching color) ----------
  const MatchDots = (() => {
    const gid = 'matchDots';
    const gs = () => Settings.for(gid);
    let dots = [];
    let nextId = 0;

    function shuffledColors(n) {
      const arr = [...COLORS];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr.slice(0, n);
    }

    function randomPosAwayFromOthers(r, existing) {
      const minDist = r * 2.3;
      for (let attempt = 0; attempt < 40; attempt++) {
        const x = rand(r, W - r), y = rand(r, H - r);
        let ok = true;
        for (const o of existing) {
          const dx = x - o.x, dy = y - o.y;
          if (dx * dx + dy * dy < minDist * minDist) { ok = false; break; }
        }
        if (ok) return { x, y };
      }
      return { x: rand(r, W - r), y: rand(r, H - r) };
    }

    function spawnPair(color, existingDots) {
      const s = gs();
      const r = rand(55, 75) * s.sizeMul;
      const placed = [];
      const makeDot = () => {
        const pos = randomPosAwayFromOthers(r, existingDots.concat(placed));
        const d = {
          id: nextId++,
          x: pos.x, y: pos.y, homeX: pos.x, homeY: pos.y, r, color,
          appear: 0,
          appearDuration: rand(0.8, 1.3) / s.speedMul,
          pulseT: rand(0, Math.PI * 2),
          dragging: false,
          dragPointerId: null,
          returning: false
        };
        placed.push(d);
        return d;
      };
      return [makeDot(), makeDot()];
    }

    function init() {
      dots = [];
      const pairCount = Math.max(1, Math.round(gs().balloonCount / 2));
      shuffledColors(pairCount).forEach(c => dots.push(...spawnPair(c, dots)));
    }

    function update(dt) {
      const s = gs();
      for (const d of dots) {
        d.pulseT += dt * 2 * s.speedMul;
        if (d.appear < 1) d.appear = Math.min(1, d.appear + dt / d.appearDuration);
        if (d.returning) {
          d.x += (d.homeX - d.x) * Math.min(1, dt * 8);
          d.y += (d.homeY - d.y) * Math.min(1, dt * 8);
          if (Math.abs(d.x - d.homeX) < 1 && Math.abs(d.y - d.homeY) < 1) {
            d.x = d.homeX; d.y = d.homeY; d.returning = false;
          }
        }
      }
    }

    function drawOne(d) {
      const eased = d.appear * d.appear * (3 - 2 * d.appear);
      const liftScale = d.dragging ? 1.15 : 1;
      const pulse = (1 + Math.sin(d.pulseT) * 0.06) * eased * liftScale;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.globalAlpha = eased;
      ctx.scale(pulse, pulse);
      const grd = ctx.createRadialGradient(0, 0, d.r * 0.1, 0, 0, d.r);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.25, d.color);
      grd.addColorStop(1, d.color);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(0, 0, d.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function draw() {
      for (const d of dots) drawOne(d);
    }

    function findDotAt(x, y, excludeDragging, excludeDot) {
      for (let i = dots.length - 1; i >= 0; i--) {
        const d = dots[i];
        if (d.appear < 0.5) continue;
        if (excludeDragging && d.dragging) continue;
        if (excludeDot && d === excludeDot) continue;
        const dx = x - d.x, dy = y - d.y;
        const rr = d.r * 1.1;
        if (dx * dx + dy * dy <= rr * rr) return d;
      }
      return null;
    }

    function onPointerDown(pointerId, x, y) {
      const d = findDotAt(x, y, true);
      if (!d) return;
      d.dragging = true;
      d.dragPointerId = pointerId;
      d.returning = false;
      dots = dots.filter(o => o !== d);
      dots.push(d);
      playTick();
    }

    function onPointerMove(pointerId, x, y) {
      const d = dots.find(o => o.dragging && o.dragPointerId === pointerId);
      if (!d) return;
      d.x = clamp(x, 0, W);
      d.y = clamp(y, 0, H);
    }

    function onPointerUp(pointerId) {
      const d = dots.find(o => o.dragging && o.dragPointerId === pointerId);
      if (!d) return;
      d.dragging = false;
      d.dragPointerId = null;

      const target = findDotAt(d.x, d.y, false, d);
      if (target && target !== d && target.color === d.color) {
        const s = gs();
        burst(d.x, d.y, d.color, 36, 2, 6, 0.8, s);
        burst(target.x, target.y, target.color, 36, 2, 6, 0.8, s);
        playChime();
        dots = dots.filter(o => o !== d && o !== target);
        dots.push(...spawnPair(choose(COLORS), dots));
      } else {
        d.returning = true;
      }
    }

    return { init, update, draw, onPointerDown, onPointerMove, onPointerUp };
  })();

  // ---------- Drag the Dot mode ----------
  const DragDot = (() => {
    const gid = 'dragDot';
    const gs = () => Settings.for(gid);
    let dot;
    let vx = 0, vy = 0;
    let dragging = false;
    let dragPointerId = null;

    function randomVelocity() {
      const speed = rand(0.6, 1.4) * gs().speedMul;
      const a = rand(0, Math.PI * 2);
      return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
    }

    function init() {
      const r = Math.min(W, H) * 0.13 * gs().sizeMul;
      dot = { x: rand(r, W - r), y: rand(r, H - r), r, color: choose(COLORS) };
      const v = randomVelocity();
      vx = v.vx; vy = v.vy;
      dragging = false;
      dragPointerId = null;
    }

    function update() {
      if (dragging) return;
      dot.x += vx;
      dot.y += vy;
      if (dot.x - dot.r < 0) { dot.x = dot.r; vx = Math.abs(vx); }
      if (dot.x + dot.r > W) { dot.x = W - dot.r; vx = -Math.abs(vx); }
      if (dot.y - dot.r < 0) { dot.y = dot.r; vy = Math.abs(vy); }
      if (dot.y + dot.r > H) { dot.y = H - dot.r; vy = -Math.abs(vy); }
    }

    function draw() {
      const scale = dragging ? 1.12 : 1;
      drawGlowDot(dot.x, dot.y, dot.r * scale, dot.color);
    }

    function onPointerDown(pointerId, x, y) {
      const dx = x - dot.x, dy = y - dot.y;
      const rr = dot.r * 1.2;
      if (dx * dx + dy * dy <= rr * rr) {
        dragging = true;
        dragPointerId = pointerId;
        dot.x = x; dot.y = y;
        playTick();
      }
    }

    function onPointerMove(pointerId, x, y) {
      if (!dragging || pointerId !== dragPointerId) return;
      dot.x = clamp(x, dot.r, W - dot.r);
      dot.y = clamp(y, dot.r, H - dot.r);
      if (Math.random() < 0.35) burst(dot.x, dot.y, dot.color, 1, 0.2, 0.8, 0.3, gs());
    }

    function onPointerUp(pointerId) {
      if (!dragging || pointerId !== dragPointerId) return;
      dragging = false;
      dragPointerId = null;
      dot.color = choose(COLORS);
      const v = randomVelocity();
      vx = v.vx; vy = v.vy;
      playChime();
    }

    return { init, update, draw, onPointerDown, onPointerMove, onPointerUp };
  })();

  // ---------- Bubbles mode ----------
  const Bubbles = (() => {
    const gid = 'bubbles';
    const gs = () => Settings.for(gid);
    let bubbles = [];

    function spawnOne(fromBottom) {
      const s = gs();
      const r = rand(60, 100) * s.sizeMul;
      return {
        x: rand(r, W - r),
        y: fromBottom ? H + r + rand(0, 200) : rand(-H, H),
        r,
        color: choose(COLORS),
        vy: -rand(0.35, 0.8) * s.speedMul,
        sway: rand(0, Math.PI * 2),
        swaySpeed: rand(0.008, 0.016) * s.speedMul,
        swayAmp: rand(0.3, 0.9)
      };
    }

    function init() {
      bubbles = [];
      const count = gs().balloonCount;
      for (let i = 0; i < count; i++) bubbles.push(spawnOne(false));
    }

    function update() {
      for (const b of bubbles) {
        b.sway += b.swaySpeed;
        b.y += b.vy;
        b.x += Math.sin(b.sway) * b.swayAmp;
        if (b.y < -b.r * 2) Object.assign(b, spawnOne(true));
      }
    }

    function drawOne(b) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = Math.max(2, b.r * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, b.r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(-b.r * 0.32, -b.r * 0.38, b.r * 0.2, b.r * 0.28, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function draw() {
      for (const b of bubbles) drawOne(b);
    }

    function hit(x, y) {
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        const dx = x - b.x, dy = y - b.y;
        const rr = b.r * 1.1;
        if (dx * dx + dy * dy <= rr * rr) {
          burst(b.x, b.y, b.color, 16, 1, 3, 0.6, gs());
          playBlip();
          Object.assign(b, spawnOne(true));
          return true;
        }
      }
      return false;
    }

    return { init, update, draw, hit };
  })();

  // ---------- Peekaboo mode (tap anywhere) ----------
  const Peekaboo = (() => {
    const gid = 'peekaboo';
    const gs = () => Settings.for(gid);
    let pops = [];

    function init() { pops = []; }

    function update(dt) {
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        p.t += dt;
        if (p.t >= p.duration) pops.splice(i, 1);
      }
    }

    function drawFace(p, s) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(s, s);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#20202a';
      ctx.beginPath(); ctx.arc(-p.r * 0.3, -p.r * 0.15, p.r * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.r * 0.3, -p.r * 0.15, p.r * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#20202a';
      ctx.lineWidth = Math.max(2, p.r * 0.06);
      ctx.beginPath();
      ctx.arc(0, p.r * 0.1, p.r * 0.35, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      ctx.restore();
    }

    function draw() {
      for (const p of pops) {
        const q = p.duration * 0.3;
        let s;
        if (p.t < q) s = p.t / q;
        else if (p.t > p.duration - q) s = (p.duration - p.t) / q;
        else s = 1;
        drawFace(p, clamp(s, 0, 1));
      }
    }

    function hit(x, y) {
      const s = gs();
      const color = choose(COLORS);
      pops.push({ x, y, r: rand(60, 90) * s.sizeMul, color, t: 0, duration: rand(0.9, 1.3) / s.speedMul });
      burst(x, y, color, 10, 1, 3, 0.4, s);
      playGiggle();
      return true;
    }

    return { init, update, draw, hit };
  })();

  // ---------- Finger Trails mode (freeform drag drawing) ----------
  const FingerTrails = (() => {
    const gid = 'fingerTrails';
    const gs = () => Settings.for(gid);
    let trailDots = [];
    let activePointers = {};

    function init() {
      trailDots = [];
      activePointers = {};
    }

    function update(dt) {
      const s = gs();
      for (let i = trailDots.length - 1; i >= 0; i--) {
        const t = trailDots[i];
        t.life -= dt / (1.2 / s.speedMul);
        if (t.life <= 0) trailDots.splice(i, 1);
      }
    }

    function draw() {
      for (const t of trailDots) {
        ctx.globalAlpha = clamp(t.life, 0, 1);
        ctx.fillStyle = t.color;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function addPoint(pointerId, x, y) {
      const p = activePointers[pointerId];
      if (!p) return;
      const dx = x - p.lastX, dy = y - p.lastY;
      if (dx * dx + dy * dy < 16) return;
      p.lastX = x; p.lastY = y;
      p.hue = (p.hue + 1) % COLORS.length;
      const s = gs();
      if (trailDots.length >= 500) trailDots.shift();
      trailDots.push({ x, y, life: 1, size: rand(12, 20) * s.sizeMul, color: COLORS[p.hue | 0] });
    }

    function onPointerDown(pointerId, x, y) {
      activePointers[pointerId] = { lastX: x - 100, lastY: y - 100, hue: Math.random() * COLORS.length };
      addPoint(pointerId, x, y);
    }

    function onPointerMove(pointerId, x, y) {
      addPoint(pointerId, x, y);
    }

    function onPointerUp(pointerId) {
      delete activePointers[pointerId];
    }

    return { init, update, draw, onPointerDown, onPointerMove, onPointerUp };
  })();

  // ---------- Night Sky Stars mode ----------
  const NightSkyStars = (() => {
    const gid = 'nightSky';
    const gs = () => Settings.for(gid);
    let stars = [];
    let streaks = [];

    function spawnStar() {
      const s = gs();
      const r = rand(26, 40) * s.sizeMul;
      return {
        x: rand(r, W - r),
        y: rand(r, H * 0.75),
        r,
        twinkle: rand(0, Math.PI * 2),
        twinkleSpeed: rand(0.03, 0.07) * s.speedMul,
        appear: 0,
        appearDuration: rand(0.8, 1.3) / s.speedMul
      };
    }

    function init() {
      stars = []; streaks = [];
      const count = gs().balloonCount;
      for (let i = 0; i < count; i++) stars.push(spawnStar());
    }

    function update(dt) {
      for (const st of stars) {
        st.twinkle += st.twinkleSpeed;
        if (st.appear < 1) st.appear = Math.min(1, st.appear + dt / st.appearDuration);
      }
      for (let i = streaks.length - 1; i >= 0; i--) {
        const sk = streaks[i];
        sk.x += sk.vx; sk.y += sk.vy;
        sk.life -= dt / 0.8;
        if (sk.life <= 0) streaks.splice(i, 1);
      }
    }

    function drawStar(st) {
      const eased = st.appear * st.appear * (3 - 2 * st.appear);
      const tw = 0.6 + Math.sin(st.twinkle) * 0.4;
      ctx.save();
      ctx.translate(st.x, st.y);
      ctx.globalAlpha = eased * tw;
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath();
      const spikes = 5, outerR = st.r, innerR = st.r * 0.45;
      for (let i = 0; i < spikes * 2; i++) {
        const rad = i % 2 === 0 ? outerR : innerR;
        const ang = (Math.PI / spikes) * i - Math.PI / 2;
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawStreak(sk) {
      ctx.save();
      ctx.globalAlpha = clamp(sk.life, 0, 1);
      ctx.strokeStyle = '#fff6d8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sk.x, sk.y);
      ctx.lineTo(sk.x - sk.vx * 5, sk.y - sk.vy * 5);
      ctx.stroke();
      ctx.restore();
    }

    function draw() {
      for (const st of stars) drawStar(st);
      for (const sk of streaks) drawStreak(sk);
    }

    function hit(x, y) {
      const s = gs();
      for (let i = 0; i < stars.length; i++) {
        const st = stars[i];
        if (st.appear < 0.5) continue;
        const dx = x - st.x, dy = y - st.y;
        const rr = st.r * 1.3 * st.appear;
        if (dx * dx + dy * dy <= rr * rr) {
          const ang = rand(-0.3, 0.3) + (Math.random() < 0.5 ? 0 : Math.PI);
          const speed = rand(6, 10) * s.speedMul;
          streaks.push({ x: st.x, y: st.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed * 0.4, life: 1 });
          playSparkle();
          Object.assign(st, spawnStar());
          return true;
        }
      }
      return false;
    }

    return { init, update, draw, hit, trailFade: true };
  })();

  // ---------- Animal Sounds mode ----------
  const AnimalSounds = (() => {
    const gid = 'animals';
    const gs = () => Settings.for(gid);
    let critters = [];
    const TYPES = [
      { type: 'cow', color: '#f7f3ea', sound: playMoo },
      { type: 'dog', color: '#c08a52', sound: playWoof },
      { type: 'cat', color: '#9a9aa5', sound: playMeow },
      { type: 'duck', color: '#ffd93d', sound: playQuack }
    ];

    function layout() {
      const s = gs();
      const count = clamp(Math.round(s.balloonCount), 2, TYPES.length);
      const chosen = TYPES.slice(0, count);
      const r = Math.min(W / (count * 2.4), H * 0.16) * s.sizeMul;
      critters = chosen.map((t, i) => ({
        ...t,
        x: (i + 0.5) * W / count,
        y: H * 0.55,
        r,
        bounce: 0,
        spots: t.type === 'cow' ? [{ dx: rand(-0.4, 0.1), dy: rand(-0.3, 0.1) }, { dx: rand(0, 0.4), dy: rand(0, 0.3) }] : null
      }));
    }

    function init() { layout(); }
    function update(dt) { const s = gs(); for (const c of critters) c.bounce = Math.max(0, c.bounce - dt * 2.2 * s.speedMul); }

    function drawCritter(c) {
      const scale = 1 + c.bounce * 0.22;
      ctx.save();
      ctx.translate(c.x, c.y - c.bounce * c.r * 0.15);
      ctx.scale(scale, scale);

      ctx.fillStyle = shadeColor(c.color, -20);
      if (c.type === 'dog') {
        ctx.beginPath(); ctx.ellipse(-c.r * 0.85, -c.r * 0.1, c.r * 0.32, c.r * 0.55, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(c.r * 0.85, -c.r * 0.1, c.r * 0.32, c.r * 0.55, 0.3, 0, Math.PI * 2); ctx.fill();
      } else if (c.type === 'cat') {
        ctx.beginPath(); ctx.moveTo(-c.r * 0.7, -c.r * 0.6); ctx.lineTo(-c.r * 0.2, -c.r * 1.15); ctx.lineTo(-c.r * 0.05, -c.r * 0.55); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(c.r * 0.7, -c.r * 0.6); ctx.lineTo(c.r * 0.2, -c.r * 1.15); ctx.lineTo(c.r * 0.05, -c.r * 0.55); ctx.closePath(); ctx.fill();
      } else if (c.type === 'cow') {
        ctx.beginPath(); ctx.ellipse(-c.r * 0.55, -c.r * 0.8, c.r * 0.16, c.r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(c.r * 0.55, -c.r * 0.8, c.r * 0.16, c.r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      }

      ctx.fillStyle = c.color;
      ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI * 2); ctx.fill();

      if (c.type === 'cow' && c.spots) {
        ctx.fillStyle = '#3a3a3a';
        for (const sp of c.spots) {
          ctx.beginPath();
          ctx.ellipse(sp.dx * c.r, sp.dy * c.r, c.r * 0.22, c.r * 0.16, 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (c.type === 'duck') {
        ctx.fillStyle = '#ff8c1a';
        ctx.beginPath();
        ctx.moveTo(0, c.r * 0.05);
        ctx.lineTo(c.r * 0.55, c.r * 0.05);
        ctx.lineTo(c.r * 0.2, c.r * 0.3);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath(); ctx.arc(-c.r * 0.3, -c.r * 0.1, c.r * 0.09, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(c.r * 0.3, -c.r * 0.1, c.r * 0.09, 0, Math.PI * 2); ctx.fill();

      if (c.type === 'cat') {
        ctx.strokeStyle = 'rgba(40,40,40,0.6)';
        ctx.lineWidth = Math.max(1, c.r * 0.03);
        for (const side of [-1, 1]) {
          for (const dy of [-0.02, 0.05, 0.12]) {
            ctx.beginPath();
            ctx.moveTo(side * c.r * 0.25, c.r * 0.2 + dy * c.r);
            ctx.lineTo(side * c.r * 0.75, c.r * 0.12 + dy * c.r);
            ctx.stroke();
          }
        }
      }

      ctx.restore();
    }

    function draw() { for (const c of critters) drawCritter(c); }

    function hit(x, y) {
      const s = gs();
      for (const c of critters) {
        const dx = x - c.x, dy = y - c.y;
        if (dx * dx + dy * dy <= (c.r * 1.15) * (c.r * 1.15)) {
          c.bounce = 1;
          c.sound();
          burst(c.x, c.y - c.r * 0.6, c.color, 10, 1, 3, 0.5, s);
          return true;
        }
      }
      return false;
    }

    return { init, update, draw, hit };
  })();

  // ---------- Musical Keys mode ----------
  const MusicalKeys = (() => {
    const gid = 'musicalKeys';
    const gs = () => Settings.for(gid);
    let keys = [];
    const SCALE = [261.6, 293.7, 329.6, 349.2, 392.0, 440.0, 493.9, 523.3];

    function layout() {
      const s = gs();
      const count = clamp(Math.round(s.balloonCount) + 2, 3, 7);
      const gap = 10;
      const kw = (W - gap * (count + 1)) / count;
      const kh = H * 0.4 * clamp(s.sizeMul, 0.8, 1.3);
      keys = [];
      for (let i = 0; i < count; i++) {
        keys.push({
          x: gap + i * (kw + gap),
          y: H - kh - 24,
          w: kw, h: kh,
          color: COLORS[i % COLORS.length],
          freq: SCALE[i % SCALE.length],
          press: 0
        });
      }
    }

    function init() { layout(); }
    function update(dt) { const s = gs(); for (const k of keys) k.press = Math.max(0, k.press - dt * 3 * s.speedMul); }

    function draw() {
      for (const k of keys) {
        const lift = k.press * 8;
        ctx.fillStyle = k.color;
        ctx.fillRect(k.x, k.y - lift, k.w, k.h);
        ctx.fillStyle = `rgba(255,255,255,${0.25 + k.press * 0.35})`;
        ctx.fillRect(k.x, k.y - lift, k.w, k.h * 0.18);
      }
    }

    function hit(x, y) {
      const s = gs();
      for (const k of keys) {
        if (x >= k.x && x <= k.x + k.w && y >= k.y - 20 && y <= k.y + k.h) {
          k.press = 1;
          playTone(k.freq, 0.45, 'triangle', 0.32);
          playTone(k.freq * 2, 0.3, 'sine', 0.1, 0.02);
          burst(x, k.y, k.color, 10, 1, 3, 0.5, s);
          return true;
        }
      }
      return false;
    }

    return { init, update, draw, hit };
  })();

  // ---------- Mode selection & cycling ----------
  const MODES = {
    balloons: Balloons,
    dot: Dot,
    fireworks: Fireworks,
    matchDots: MatchDots,
    dragDot: DragDot,
    bubbles: Bubbles,
    peekaboo: Peekaboo,
    fingerTrails: FingerTrails,
    nightSky: NightSkyStars,
    animals: AnimalSounds,
    musicalKeys: MusicalKeys
  };

  function loadEnabledGames() {
    try {
      const saved = JSON.parse(localStorage.getItem('babyGameModes'));
      if (Array.isArray(saved)) {
        const filtered = ALL_GAME_IDS.filter(id => saved.includes(id));
        if (filtered.length) return filtered;
      }
    } catch (e) {}
    return [...ALL_GAME_IDS];
  }

  let enabledGames = loadEnabledGames();
  function saveEnabledGames() {
    localStorage.setItem('babyGameModes', JSON.stringify(enabledGames));
  }

  let modeIndex = 0;
  let modeTimer = 0;

  function activeIds() {
    return ALL_GAME_IDS.filter(id => enabledGames.includes(id));
  }

  function currentGameId() {
    const ids = activeIds();
    return ids[modeIndex % ids.length];
  }

  function currentMode() {
    return MODES[currentGameId()];
  }

  function switchMode() {
    const ids = activeIds();
    if (ids.length <= 1) { modeTimer = 0; return; }
    modeIndex = (modeIndex + 1) % ids.length;
    modeTimer = 0;
    particles = [];
    currentMode().init();
  }

  function toggleGame(id) {
    if (enabledGames.includes(id)) {
      if (enabledGames.length === 1) return; // always keep at least one game active
      enabledGames = enabledGames.filter(g => g !== id);
    } else {
      enabledGames.push(id);
    }
    saveEnabledGames();
    modeIndex = 0;
    modeTimer = 0;
    particles = [];
    currentMode().init();
  }

  currentMode().init();

  // ---------- Input ----------
  function handlePoint(clientX, clientY) {
    currentMode().hit(clientX, clientY);
  }

  function pointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function isSettingsTarget(e) {
    return !!(e.target.closest && e.target.closest('#settingsOverlay, #exitConfirmOverlay, #customizeOverlay, #helpOverlay, #exitIconBtn, #menuRevealIconBtn'));
  }

  // ---------- Hold-to-reveal menu gesture (top-right corner) ----------
  // A baby's rapid-fire tapping/slapping during play is spread across the
  // whole screen and never sustains a continuous hold, and merely gripping
  // this corner only reveals the menu icon - it takes a further precise
  // triple-tap on that small icon (see the menuRevealIconBtn listener below)
  // to actually open the menu, which an incidental grip essentially never
  // reproduces. This menu icon is deliberately a different glyph/color from
  // the exit icon shown once inside the menu, so the two are never confused.
  const TOPRIGHT_HOLD_MS = 1500;
  const ICON_IDLE_HIDE_MS = 6000;

  let cornerHoldPointerId = null;
  let cornerHoldStartTime = 0;
  let iconIdleHideTimer = null;

  function inTopRightZone(x, y) {
    const zoneSize = Math.min(W, H) * 0.2;
    return x >= W - zoneSize && y <= zoneSize;
  }

  function cancelCornerHold() {
    cornerHoldPointerId = null;
    cornerHoldStartTime = 0;
  }

  function revealMenuIcon() {
    menuRevealIconBtn.classList.remove('hidden');
    iconTapTimestamps = [];
    clearTimeout(iconIdleHideTimer);
    iconIdleHideTimer = setTimeout(() => {
      menuRevealIconBtn.classList.add('hidden');
    }, ICON_IDLE_HIDE_MS);
  }

  // Pointer Events alone already cover mouse, touch and pen, including multi-touch
  // (each simultaneous finger fires its own pointerdown) - adding a parallel
  // touchstart listener would double-fire a burst/pop per tap. Modes that need
  // dragging (Match the Dots, Drag the Dot, Finger Trails) implement
  // onPointerDown/Move/Up; everything else falls back to a one-shot hit().
  window.addEventListener('pointerdown', e => {
    ensureAudio();
    if (isSettingsTarget(e) || settingsOpen) return;
    const p = pointFromEvent(e);

    if (menuRevealIconBtn.classList.contains('hidden') && inTopRightZone(p.x, p.y)) {
      cornerHoldPointerId = e.pointerId;
      cornerHoldStartTime = performance.now();
    }

    const mode = currentMode();
    if (mode.onPointerDown) mode.onPointerDown(e.pointerId, p.x, p.y);
    else handlePoint(p.x, p.y);
  });

  window.addEventListener('pointermove', e => {
    if (cornerHoldPointerId === e.pointerId) {
      const p = pointFromEvent(e);
      if (!inTopRightZone(p.x, p.y)) cancelCornerHold();
    }
    if (isSettingsTarget(e) || settingsOpen) return;
    const mode = currentMode();
    if (mode.onPointerMove) {
      const p = pointFromEvent(e);
      mode.onPointerMove(e.pointerId, p.x, p.y);
    }
  });

  function endPointer(e) {
    if (cornerHoldPointerId === e.pointerId) cancelCornerHold();
    if (isSettingsTarget(e) || settingsOpen) return;
    const mode = currentMode();
    if (mode.onPointerUp) {
      const p = pointFromEvent(e);
      mode.onPointerUp(e.pointerId, p.x, p.y);
    }
  }
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  // ---------- Settings panel (parent-only, opened via triple-tap) ----------
  const overlay = document.getElementById('settingsOverlay');
  let settingsOpen = false;

  function refreshSelectedButton() {
    const bandId = Settings.lastBandId;
    overlay.querySelectorAll('.bandBtn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.band === bandId);
    });
  }

  function openSettings() {
    settingsOpen = true;
    refreshSelectedButton();
    overlay.classList.remove('hidden');
    exitIconBtn.classList.remove('hidden');
  }

  function closeSettings() {
    settingsOpen = false;
    overlay.classList.add('hidden');
    exitIconBtn.classList.add('hidden');
  }

  overlay.querySelectorAll('.bandBtn').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.stopPropagation();
      Settings.applyBand(btn.dataset.band);
      refreshSelectedButton();
      refreshCustomizeSliders();
      particles = [];
      currentMode().init();
    });
  });

  document.getElementById('closeSettings').addEventListener('pointerdown', e => {
    e.stopPropagation();
    closeSettings();
  });

  function refreshGameButtons() {
    overlay.querySelectorAll('.gameBtn').forEach(btn => {
      btn.classList.toggle('selected', enabledGames.includes(btn.dataset.game));
    });
  }
  refreshGameButtons();

  overlay.querySelectorAll('.gameBtn').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.stopPropagation();
      toggleGame(btn.dataset.game);
      refreshGameButtons();
    });
  });

  // ---------- Customize panel (per-game sliders) ----------
  const customizeOverlay = document.getElementById('customizeOverlay');
  const gameSelect = document.getElementById('customizeGameSelect');
  ALL_GAME_IDS.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = GAME_LABELS[id];
    gameSelect.appendChild(opt);
  });

  const SLIDER_FIELDS = [
    { id: 'speedSlider', field: 'speedMul', valueId: 'speedValue', format: v => `${v.toFixed(2)}x` },
    { id: 'animationSlider', field: 'particleMul', valueId: 'animationValue', format: v => `${v.toFixed(2)}x` },
    { id: 'countSlider', field: 'balloonCount', valueId: 'countValue', format: v => `${v}` },
    { id: 'sizeSlider', field: 'sizeMul', valueId: 'sizeValue', format: v => `${v.toFixed(2)}x` }
  ];

  function refreshCustomizeSliders() {
    const s = Settings.for(gameSelect.value);
    SLIDER_FIELDS.forEach(({ id, field, valueId, format }) => {
      const input = document.getElementById(id);
      input.value = s[field];
      document.getElementById(valueId).textContent = format(s[field]);
    });
  }

  gameSelect.addEventListener('change', e => {
    e.stopPropagation();
    refreshCustomizeSliders();
  });
  gameSelect.addEventListener('pointerdown', e => e.stopPropagation());

  SLIDER_FIELDS.forEach(({ id, field, valueId, format }) => {
    const input = document.getElementById(id);
    input.addEventListener('input', e => {
      e.stopPropagation();
      document.getElementById(valueId).textContent = format(parseFloat(input.value));
    });
    input.addEventListener('change', e => {
      e.stopPropagation();
      const raw = parseFloat(input.value);
      Settings.setGameField(gameSelect.value, field, field === 'balloonCount' ? Math.round(raw) : raw);
      if (gameSelect.value === currentGameId()) {
        particles = [];
        currentMode().init();
      }
    });
    input.addEventListener('pointerdown', e => e.stopPropagation());
  });

  document.getElementById('openCustomize').addEventListener('pointerdown', e => {
    e.stopPropagation();
    gameSelect.value = currentGameId();
    refreshCustomizeSliders();
    customizeOverlay.classList.remove('hidden');
    exitIconBtn.classList.add('hidden');
  });

  document.getElementById('closeCustomize').addEventListener('pointerdown', e => {
    e.stopPropagation();
    customizeOverlay.classList.add('hidden');
    exitIconBtn.classList.remove('hidden');
  });

  customizeOverlay.addEventListener('pointerdown', e => {
    if (e.target === customizeOverlay) {
      customizeOverlay.classList.add('hidden');
      exitIconBtn.classList.remove('hidden');
    }
  });

  // ---------- Exit (corner icon opens a confirm popup) ----------
  function exitApp() {
    const plugins = window.Capacitor && window.Capacitor.Plugins;
    if (plugins && plugins.App) {
      plugins.App.exitApp();
    } else {
      window.close();
    }
  }

  const menuRevealIconBtn = document.getElementById('menuRevealIconBtn');
  const exitIconBtn = document.getElementById('exitIconBtn');
  const exitConfirmOverlay = document.getElementById('exitConfirmOverlay');

  const ICON_TAP_WINDOW_MS = 600;
  let iconTapTimestamps = [];

  // Revealed via the corner-hold; requires a precise triple-tap on this small
  // icon before actually opening the menu.
  menuRevealIconBtn.addEventListener('pointerdown', e => {
    e.stopPropagation();
    const now = performance.now();
    iconTapTimestamps.push(now);
    iconTapTimestamps = iconTapTimestamps.filter(t => now - t < ICON_TAP_WINDOW_MS);
    if (iconTapTimestamps.length >= 3) {
      iconTapTimestamps = [];
      clearTimeout(iconIdleHideTimer);
      menuRevealIconBtn.classList.add('hidden');
      openSettings();
    }
  });

  exitIconBtn.addEventListener('pointerdown', e => {
    e.stopPropagation();
    exitConfirmOverlay.classList.remove('hidden');
    exitIconBtn.classList.add('hidden');
  });

  document.getElementById('confirmExitYes').addEventListener('pointerdown', e => {
    e.stopPropagation();
    exitApp();
  });

  document.getElementById('confirmExitNo').addEventListener('pointerdown', e => {
    e.stopPropagation();
    exitConfirmOverlay.classList.add('hidden');
    exitIconBtn.classList.remove('hidden');
  });

  exitConfirmOverlay.addEventListener('pointerdown', e => {
    if (e.target === exitConfirmOverlay) {
      exitConfirmOverlay.classList.add('hidden');
      exitIconBtn.classList.remove('hidden');
    }
  });

  // ---------- Help guide (shown automatically on first run) ----------
  const helpOverlay = document.getElementById('helpOverlay');
  let firstRunPendingSettings = false;

  function openHelp(isFirstRun) {
    settingsOpen = true;
    firstRunPendingSettings = !!isFirstRun;
    helpOverlay.classList.remove('hidden');
    exitIconBtn.classList.add('hidden');
  }

  function closeHelp() {
    helpOverlay.classList.add('hidden');
    if (firstRunPendingSettings) {
      firstRunPendingSettings = false;
      openSettings();
    } else {
      exitIconBtn.classList.remove('hidden');
    }
  }

  document.getElementById('openHelp').addEventListener('pointerdown', e => {
    e.stopPropagation();
    openHelp(false);
  });

  document.getElementById('closeHelp').addEventListener('pointerdown', e => {
    e.stopPropagation();
    closeHelp();
  });

  helpOverlay.addEventListener('pointerdown', e => {
    if (e.target === helpOverlay) closeHelp();
  });

  if (!hadSavedSettings) openHelp(true);

  // ---------- Main loop ----------
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    if (cornerHoldPointerId !== null && now - cornerHoldStartTime >= TOPRIGHT_HOLD_MS) {
      revealMenuIcon();
      cancelCornerHold();
    }

    modeTimer += dt;
    if (modeTimer >= Settings.modeDuration) switchMode();

    if (currentMode().trailFade) {
      ctx.fillStyle = 'rgba(8,8,20,0.18)';
      ctx.fillRect(0, 0, W, H);
    } else {
      drawBackground();
    }

    currentMode().update(dt);
    currentMode().draw();

    updateParticles(dt);
    drawParticles();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
