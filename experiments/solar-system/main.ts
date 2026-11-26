import '../../src/styles/base.css';
import '../../src/styles/lab.css';
import {
  G0, absorbIntoSun, createSolarSystem, escapeSpeed, semiMajorAxis, setGravity, step, totalEnergy,
  type Body, type Integrator, type Sim,
} from '../../src/physics/nbody';
import { OrbitTracker } from '../../src/physics/kepler';

const DT = 0.0005; // 년 ≈ 4.4시간
const CAPTURE_RADIUS = 0.03; // AU. 이보다 가까우면 태양에 흡수
const VEL_PER_PX = 0.1; // 드래그 1px = 0.1 AU/년 (지구 공전 속도 2π ≈ 63px)
const TRAIL_EVERY = 0.005; // 년마다 궤적 점 하나
const TRAIL_MAX = 2600;
const MAX_STEPS_PER_FRAME = 4000;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('sim');
const ctx = canvas.getContext('2d')!;
const keplerCanvas = $<HTMLCanvasElement>('kepler');
const kctx = keplerCanvas.getContext('2d')!;

// ── 상태 ────────────────────────────────────────────────
let sim: Sim;
let tracker: OrbitTracker;
let E0 = 0;
let integrator: Integrator = 'verlet';
let gMult = 1;
let yearsPerSecond = 0.2;
let paused = false;
let showTrails = true;
let accumulator = 0;
let trails = new Map<string, { pts: { x: number; y: number }[]; lastT: number }>();

let scale = 1; // px / AU
let viewW = 0;
let viewH = 0;

let drag: { body: Body; px: number; py: number } | null = null;

function reset(): void {
  sim = createSolarSystem({ G: G0 * gMult });
  tracker = new OrbitTracker(sim);
  E0 = totalEnergy(sim);
  accumulator = 0;
  trails = new Map(sim.bodies.slice(1).map((b) => [b.name, { pts: [], lastT: -Infinity }]));
}

// ── 좌표 변환 (카메라는 태양을 따라간다, 화면 위쪽이 +y) ─────────
const sun = () => sim.bodies[0];
const toScreen = (x: number, y: number) => ({
  sx: viewW / 2 + (x - sun().x) * scale,
  sy: viewH / 2 - (y - sun().y) * scale,
});

function fitView(): void {
  const farthest = Math.max(
    1.6,
    ...sim.bodies.slice(1).filter((b) => b.alive).map((b) => Math.hypot(b.x - sun().x, b.y - sun().y)),
  );
  scale = (Math.min(viewW, viewH) / 2 - 24) / Math.min(farthest * 1.08, 12);
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  const first = viewW === 0;
  viewW = r.width;
  viewH = r.height;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const kr = keplerCanvas.getBoundingClientRect();
  keplerCanvas.width = Math.round(kr.width * dpr);
  keplerCanvas.height = Math.round(kr.height * dpr);
  kctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (first) fitView();
}

// ── 시뮬레이션 진행 ───────────────────────────────────────
function advance(realDt: number): void {
  accumulator += realDt * yearsPerSecond;
  let n = 0;
  while (accumulator >= DT && n < MAX_STEPS_PER_FRAME) {
    step(sim, DT, integrator);
    tracker.update(sim, DT);
    accumulator -= DT;
    n++;
    recordTrails();
  }
  if (n === MAX_STEPS_PER_FRAME) accumulator = 0;

  const absorbed = absorbIntoSun(sim, CAPTURE_RADIUS);
  if (absorbed.length) {
    toast(`💥 ${absorbed.join(', ')} — 태양과 충돌!`);
    E0 = totalEnergy(sim);
  }
}

function recordTrails(): void {
  for (const b of sim.bodies.slice(1)) {
    const tr = trails.get(b.name)!;
    if (!b.alive || sim.t - tr.lastT < TRAIL_EVERY) continue;
    tr.lastT = sim.t;
    // 태양 기준 상대 좌표로 저장 → 태양이 움직여도 궤도 모양이 유지된다
    tr.pts.push({ x: b.x - sun().x, y: b.y - sun().y });
    if (tr.pts.length > TRAIL_MAX) tr.pts.shift();
  }
}

// ── 그리기 ───────────────────────────────────────────────
function draw(): void {
  ctx.clearRect(0, 0, viewW, viewH);

  if (showTrails) {
    for (const b of sim.bodies.slice(1)) {
      const pts = trails.get(b.name)!.pts;
      if (pts.length < 2) continue;
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = b.alive ? 0.35 : 0.12;
      ctx.lineWidth = 1;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const sx = viewW / 2 + p.x * scale;
        const sy = viewH / 2 - p.y * scale;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  for (const b of sim.bodies) {
    if (!b.alive) continue;
    const { sx, sy } = toScreen(b.x, b.y);
    if (b === sun()) {
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, b.drawRadius * 3);
      glow.addColorStop(0, 'rgba(255, 211, 92, 0.55)');
      glow.addColorStop(1, 'rgba(255, 211, 92, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, b.drawRadius * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(sx, sy, b.drawRadius, 0, Math.PI * 2);
    ctx.fill();
    if (b !== sun()) {
      ctx.fillStyle = 'rgba(231, 233, 243, 0.7)';
      ctx.font = '12px sans-serif';
      ctx.fillText(b.name, sx + b.drawRadius + 4, sy - b.drawRadius - 2);
    }
  }

  if (drag) drawDragArrow(drag);
}

function dragVelocity(d: { body: Body; px: number; py: number }) {
  const { sx, sy } = toScreen(d.body.x, d.body.y);
  return {
    sx, sy,
    vx: sun().vx + (d.px - sx) * VEL_PER_PX,
    vy: sun().vy - (d.py - sy) * VEL_PER_PX,
  };
}

function drawDragArrow(d: { body: Body; px: number; py: number }): void {
  const { sx, sy, vx, vy } = dragVelocity(d);
  const speed = Math.hypot(vx - sun().vx, vy - sun().vy);
  const vEsc = escapeSpeed(sun(), d.body, sim.G);
  const escaping = speed >= vEsc;
  const color = escaping ? '#ff6b6b' : '#7aa2ff';

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(d.px, d.py);
  ctx.stroke();
  const ang = Math.atan2(d.py - sy, d.px - sx);
  ctx.beginPath();
  ctx.moveTo(d.px, d.py);
  ctx.lineTo(d.px - 10 * Math.cos(ang - 0.4), d.py - 10 * Math.sin(ang - 0.4));
  ctx.lineTo(d.px - 10 * Math.cos(ang + 0.4), d.py - 10 * Math.sin(ang + 0.4));
  ctx.fill();

  const label = escaping ? '탈출 궤도 (돌아오지 않음)' : '타원 궤도';
  ctx.font = '13px sans-serif';
  ctx.fillText(`${speed.toFixed(2)} AU/년 · 탈출속도의 ${Math.round((speed / vEsc) * 100)}%`, d.px + 12, d.py + 4);
  ctx.fillText(label, d.px + 12, d.py + 20);
}

// ── 케플러 그래프 (log T² vs log a³) ──────────────────────
const LOG_MIN = -2;
const LOG_MAX = 3;

function drawKepler(): void {
  const r = keplerCanvas.getBoundingClientRect();
  const w = r.width;
  const h = r.height;
  const pad = { l: 38, r: 10, t: 10, b: 30 };
  const px = (v: number) => pad.l + ((Math.log10(v) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (w - pad.l - pad.r);
  const py = (v: number) => h - pad.b - ((Math.log10(v) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (h - pad.t - pad.b);

  kctx.clearRect(0, 0, w, h);
  kctx.font = '10px sans-serif';
  kctx.lineWidth = 1;
  for (let e = LOG_MIN; e <= LOG_MAX; e++) {
    const v = 10 ** e;
    kctx.strokeStyle = '#242a45';
    kctx.beginPath();
    kctx.moveTo(px(v), pad.t);
    kctx.lineTo(px(v), h - pad.b);
    kctx.moveTo(pad.l, py(v));
    kctx.lineTo(w - pad.r, py(v));
    kctx.stroke();
    kctx.fillStyle = '#9097b3';
    kctx.fillText(`10${sup(e)}`, px(v) - 8, h - pad.b + 13);
    kctx.fillText(`10${sup(e)}`, 6, py(v) + 3);
  }
  kctx.fillText('a³ (AU³)', w - pad.r - 44, h - 4);
  kctx.fillText('T² (년²)', pad.l + 4, pad.t + 10);

  // 이론 직선 T² = (4π²/GM) a³
  const k = theoryRatio();
  kctx.save();
  kctx.beginPath();
  kctx.rect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b);
  kctx.clip();
  kctx.strokeStyle = 'rgba(255, 211, 92, 0.6)';
  kctx.setLineDash([4, 4]);
  kctx.beginPath();
  kctx.moveTo(px(10 ** LOG_MIN), py(k * 10 ** LOG_MIN));
  kctx.lineTo(px(10 ** LOG_MAX), py(k * 10 ** LOG_MAX));
  kctx.stroke();
  kctx.setLineDash([]);

  for (const b of sim.bodies.slice(1)) {
    const T = tracker.period(b.name);
    const a = semiMajorAxis(sun(), b, sim.G);
    if (!b.alive || T === null || !isFinite(a)) continue;
    kctx.fillStyle = b.color;
    kctx.beginPath();
    kctx.arc(px(a ** 3), py(T * T), 4, 0, Math.PI * 2);
    kctx.fill();
  }
  kctx.restore();
}

const theoryRatio = () => G0 / (sim.G * sun().mass);
const sup = (e: number) => String(e).replace(/-/g, '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]);

// ── 패널 ────────────────────────────────────────────────
let lastPanelUpdate = -Infinity;

function updatePanel(now: number): void {
  const drift = Math.abs((totalEnergy(sim) - E0) / E0) * 100;
  const energyEl = $('energy');
  energyEl.textContent = `${drift < 0.0001 ? drift.toExponential(1) : drift.toFixed(4)}%`;
  energyEl.style.color = drift < 0.01 ? 'var(--good)' : drift < 1 ? 'var(--warn)' : 'var(--bad)';

  $('hud').textContent = `t = ${sim.t.toFixed(2)}년 · 1스텝 = ${(DT * 365.25 * 24).toFixed(1)}시간 · ${
    integrator === 'verlet' ? 'Velocity Verlet' : 'Euler'
  }`;

  if (now - lastPanelUpdate < 200) return;
  lastPanelUpdate = now;

  $('kepler-theory').textContent = theoryRatio().toFixed(3);
  $('kepler-body').innerHTML = sim.bodies
    .slice(1)
    .map((b) => {
      const dot = `<span class="dot" style="background:${b.color}"></span>`;
      if (!b.alive) return `<tr class="pending"><td>${dot}${b.name}</td><td colspan="3">태양에 흡수됨</td></tr>`;
      const a = semiMajorAxis(sun(), b, sim.G);
      const T = tracker.period(b.name);
      const aText = isFinite(a) ? a.toFixed(3) : '∞';
      if (!isFinite(a)) return `<tr class="pending"><td>${dot}${b.name}</td><td>∞</td><td colspan="2">탈출 중</td></tr>`;
      if (T === null) {
        const pct = Math.round(tracker.progress(b.name) * 100);
        return `<tr class="pending"><td>${dot}${b.name}</td><td>${aText}</td><td colspan="2">측정 중 ${pct}%</td></tr>`;
      }
      return `<tr><td>${dot}${b.name}</td><td>${aText}</td><td>${T.toFixed(3)}</td><td>${((T * T) / a ** 3).toFixed(3)}</td></tr>`;
    })
    .join('');

  drawKepler();
}

let toastTimer = 0;
function toast(msg: string): void {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2600);
}

// ── 입력 ────────────────────────────────────────────────
function pickBody(px: number, py: number): Body | null {
  let best: Body | null = null;
  let bestD = Infinity;
  for (const b of sim.bodies.slice(1)) {
    if (!b.alive) continue;
    const { sx, sy } = toScreen(b.x, b.y);
    const d = Math.hypot(sx - px, sy - py);
    if (d < Math.max(b.drawRadius + 8, 16) && d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

function localPoint(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { px: e.clientX - r.left, py: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', (e) => {
  const { px, py } = localPoint(e);
  const body = pickBody(px, py);
  if (!body) return;
  drag = { body, px, py };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  Object.assign(drag, localPoint(e));
});

canvas.addEventListener('pointerup', () => {
  if (!drag) return;
  const { vx, vy } = dragVelocity(drag);
  drag.body.vx = vx;
  drag.body.vy = vy;
  tracker.reset(sim, drag.body);
  const tr = trails.get(drag.body.name)!;
  tr.pts = [];
  tr.lastT = -Infinity;
  E0 = totalEnergy(sim);
  drag = null;
  canvas.classList.remove('dragging');
  $('hint').classList.add('hidden');
});

canvas.addEventListener('pointercancel', () => {
  drag = null;
  canvas.classList.remove('dragging');
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    scale *= Math.exp(-e.deltaY * 0.0015);
  },
  { passive: false },
);
$('zoom-in').addEventListener('click', () => (scale *= 1.3));
$('zoom-out').addEventListener('click', () => (scale /= 1.3));
$('zoom-fit').addEventListener('click', fitView);

$('play').addEventListener('click', () => {
  paused = !paused;
  $('play').textContent = paused ? '재생' : '일시정지';
});
$('reset').addEventListener('click', () => {
  reset();
  fitView();
});

$<HTMLInputElement>('g').addEventListener('input', (e) => {
  gMult = +(e.target as HTMLInputElement).value;
  $('g-label').textContent = `G × ${gMult.toFixed(2)}`;
  setGravity(sim, G0 * gMult);
  E0 = totalEnergy(sim);
  tracker.resetAll(sim);
});

$<HTMLInputElement>('speed').addEventListener('input', (e) => {
  yearsPerSecond = 0.2 * 2 ** +(e.target as HTMLInputElement).value;
  $('speed-label').textContent = `1초 = ${yearsPerSecond.toFixed(2)}년`;
});

document.querySelectorAll<HTMLInputElement>('input[name="integrator"]').forEach((el) =>
  el.addEventListener('change', () => {
    integrator = el.value as Integrator;
    E0 = totalEnergy(sim);
  }),
);

$<HTMLInputElement>('trails').addEventListener('change', (e) => {
  showTrails = (e.target as HTMLInputElement).checked;
});

// ── 시작 ────────────────────────────────────────────────
reset();
const ro = new ResizeObserver(resize);
ro.observe(canvas);
ro.observe(keplerCanvas);
resize();

let last = performance.now();
function frame(now: number): void {
  const realDt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!paused && !drag) advance(realDt);
  draw();
  updatePanel(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
