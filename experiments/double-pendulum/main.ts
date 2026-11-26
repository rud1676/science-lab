import '../../src/styles/base.css';
import '../../src/styles/lab.css';
import {
  DEFAULT_PARAMS, energy, positions, rk4Step, separation,
  type PendulumParams, type PendulumState,
} from '../../src/physics/pendulum';

const DT = 0.001; // s
const COUNTS = [1, 2, 10, 50, 200];
const HORIZON_EPS = 0.1; // rad. 이만큼 벌어지면 "예측 불가"로 본다
const TRAIL_MAX = 240;
const TRAIL_MAX_COUNT = 10; // 진자가 이보다 많으면 궤적은 생략
const HISTORY_EVERY = 0.03; // s

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('sim');
const ctx = canvas.getContext('2d')!;
const chart = $<HTMLCanvasElement>('chart');
const cctx = chart.getContext('2d')!;

const deg = (d: number) => (d * Math.PI) / 180;

// ── 상태 ────────────────────────────────────────────────
const params: PendulumParams = { ...DEFAULT_PARAMS };
let base = { t1: deg(120), t2: deg(-20) };
let count = 10;
let deltaDeg = 1e-3;
let speed = 1;
let paused = false;
let showTrails = true;

let pendulums: PendulumState[] = [];
let trails: { x: number; y: number }[][] = [];
let t = 0;
let E0 = 0;
let horizon: number | null = null;
let history: { t: number; sep: number }[] = [];
let accumulator = 0;

let viewW = 0;
let viewH = 0;
let scale = 1;
let drag: 'bob1' | 'bob2' | null = null;

function restart(): void {
  pendulums = Array.from({ length: count }, (_, i) => ({
    t1: base.t1 + i * deg(deltaDeg),
    t2: base.t2,
    w1: 0,
    w2: 0,
  }));
  trails = pendulums.map(() => []);
  t = 0;
  E0 = energy(pendulums[0], params);
  horizon = null;
  history = count > 1 ? [{ t: 0, sep: separation(pendulums[0], pendulums[count - 1]) }] : [];
  accumulator = 0;
}

function advance(realDt: number): void {
  accumulator += realDt * speed;
  while (accumulator >= DT) {
    for (let i = 0; i < pendulums.length; i++) pendulums[i] = rk4Step(pendulums[i], params, DT);
    t += DT;
    accumulator -= DT;

    if (count > 1) {
      const sep = separation(pendulums[0], pendulums[count - 1]);
      if (horizon === null && sep > HORIZON_EPS) horizon = t;
      if (t - history[history.length - 1].t >= HISTORY_EVERY) history.push({ t, sep });
    }
  }
  if (showTrails && count <= TRAIL_MAX_COUNT) {
    pendulums.forEach((s, i) => {
      const { x2, y2 } = positions(s, params);
      trails[i].push({ x: x2, y: y2 });
      if (trails[i].length > TRAIL_MAX) trails[i].shift();
    });
  }
}

// ── 그리기 ───────────────────────────────────────────────
const pivot = () => ({ px: viewW / 2, py: viewH / 2 });
const color = (i: number) => `hsl(${count === 1 ? 210 : 200 + (i / (count - 1)) * 150}, 85%, 65%)`;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  for (const [c, cx] of [[canvas, ctx], [chart, cctx]] as const) {
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const r = canvas.getBoundingClientRect();
  viewW = r.width;
  viewH = r.height;
  scale = (Math.min(viewW, viewH) / 2 - 20) / (params.L1 + params.L2);
}

function draw(): void {
  ctx.clearRect(0, 0, viewW, viewH);
  const { px, py } = pivot();
  const many = count > TRAIL_MAX_COUNT;

  if (showTrails && !many) {
    trails.forEach((tr, i) => {
      if (tr.length < 2) return;
      ctx.strokeStyle = color(i);
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      tr.forEach((p, j) => (j ? ctx.lineTo(px + p.x * scale, py + p.y * scale) : ctx.moveTo(px + p.x * scale, py + p.y * scale)));
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  // 뒤에서부터 그려서 첫 번째 진자가 맨 위에 보이게
  for (let i = pendulums.length - 1; i >= 0; i--) {
    const { x1, y1, x2, y2 } = positions(pendulums[i], params);
    const c = color(i);
    ctx.globalAlpha = many ? 0.45 : 0.9;
    ctx.strokeStyle = c;
    ctx.lineWidth = many ? 1 : 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + x1 * scale, py + y1 * scale);
    ctx.lineTo(px + x2 * scale, py + y2 * scale);
    ctx.stroke();
    ctx.fillStyle = c;
    for (const [bx, by] of [[x1, y1], [x2, y2]]) {
      ctx.beginPath();
      ctx.arc(px + bx * scale, py + by * scale, many ? 3 : 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#e7e9f3';
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();
}

const LOG_MIN = -10;
const LOG_MAX = 1;

function drawChart(): void {
  const r = chart.getBoundingClientRect();
  const w = r.width;
  const h = r.height;
  const pad = { l: 40, r: 10, t: 10, b: 24 };
  cctx.clearRect(0, 0, w, h);
  cctx.font = '10px sans-serif';

  if (count === 1) {
    cctx.fillStyle = '#9097b3';
    cctx.textAlign = 'center';
    cctx.fillText('진자를 2개 이상으로 놓으면 차이를 볼 수 있어요', w / 2, h / 2);
    cctx.textAlign = 'start';
    return;
  }

  const tMax = Math.max(20, Math.ceil(t / 10) * 10);
  const X = (tt: number) => pad.l + (tt / tMax) * (w - pad.l - pad.r);
  const Y = (sep: number) => {
    const l = Math.min(LOG_MAX, Math.max(LOG_MIN, Math.log10(Math.max(sep, 1e-12))));
    return h - pad.b - ((l - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (h - pad.t - pad.b);
  };

  cctx.strokeStyle = '#242a45';
  cctx.fillStyle = '#9097b3';
  for (let e = LOG_MIN; e <= LOG_MAX; e += 2) {
    cctx.beginPath();
    cctx.moveTo(pad.l, Y(10 ** e));
    cctx.lineTo(w - pad.r, Y(10 ** e));
    cctx.stroke();
    cctx.fillText(`1e${e}`, 4, Y(10 ** e) + 3);
  }
  for (let s = 0; s <= tMax; s += tMax / 4) cctx.fillText(`${s}s`, X(s) - 6, h - 8);

  // 허용치 ε
  cctx.strokeStyle = 'rgba(255, 176, 87, 0.6)';
  cctx.setLineDash([4, 4]);
  cctx.beginPath();
  cctx.moveTo(pad.l, Y(HORIZON_EPS));
  cctx.lineTo(w - pad.r, Y(HORIZON_EPS));
  cctx.stroke();
  cctx.setLineDash([]);
  cctx.fillStyle = '#ffb057';
  cctx.fillText('ε = 0.1 rad', w - pad.r - 54, Y(HORIZON_EPS) - 4);

  cctx.strokeStyle = '#7aa2ff';
  cctx.lineWidth = 1.5;
  cctx.beginPath();
  history.forEach((p, i) => (i ? cctx.lineTo(X(p.t), Y(p.sep)) : cctx.moveTo(X(p.t), Y(p.sep))));
  cctx.stroke();
  cctx.lineWidth = 1;
}

let lastPanel = -Infinity;
function updatePanel(now: number): void {
  $('hud').textContent = `t = ${t.toFixed(2)}s · dt = 1ms · RK4 · 진자 ${count}개`;
  if (now - lastPanel < 100) return;
  lastPanel = now;

  const drift = Math.abs((energy(pendulums[0], params) - E0) / E0) * 100;
  const el = $('energy');
  el.textContent = `${drift < 1e-4 ? drift.toExponential(1) : drift.toFixed(4)}%`;
  el.style.color = drift < 0.01 ? 'var(--good)' : drift < 1 ? 'var(--warn)' : 'var(--bad)';

  const hz = $('horizon');
  if (count === 1) hz.textContent = '—';
  else if (horizon === null) hz.textContent = `아직 예측 가능 (${t.toFixed(1)}s)`;
  else hz.textContent = `${horizon.toFixed(2)}초`;
  hz.style.color = horizon === null ? 'var(--good)' : 'var(--accent-2)';

  drawChart();
}

// ── 입력 ────────────────────────────────────────────────
function localPoint(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', (e) => {
  const { x, y } = localPoint(e);
  const { px, py } = pivot();
  const { x1, y1, x2, y2 } = positions(pendulums[0], params);
  const d1 = Math.hypot(px + x1 * scale - x, py + y1 * scale - y);
  const d2 = Math.hypot(px + x2 * scale - x, py + y2 * scale - y);
  if (Math.min(d1, d2) > 24) return;
  drag = d2 <= d1 ? 'bob2' : 'bob1';
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
  $('hint').classList.add('hidden');
  document.querySelectorAll('#presets button').forEach((b) => b.classList.remove('active'));
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const { x, y } = localPoint(e);
  const { px, py } = pivot();
  if (drag === 'bob1') {
    base.t1 = Math.atan2(x - px, y - py);
  } else {
    const { x1, y1 } = positions(pendulums[0], params);
    base.t2 = Math.atan2(x - (px + x1 * scale), y - (py + y1 * scale));
  }
  restart();
});

const endDrag = () => {
  drag = null;
  canvas.classList.remove('dragging');
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

$('play').addEventListener('click', () => {
  paused = !paused;
  $('play').textContent = paused ? '재생' : '일시정지';
});
$('reset').addEventListener('click', restart);

document.querySelectorAll<HTMLButtonElement>('#presets button').forEach((btn) =>
  btn.addEventListener('click', () => {
    base = { t1: deg(+btn.dataset.t1!), t2: deg(+btn.dataset.t2!) };
    document.querySelectorAll('#presets button').forEach((b) => b.classList.toggle('active', b === btn));
    restart();
  }),
);

$<HTMLInputElement>('count').addEventListener('input', (e) => {
  count = COUNTS[+(e.target as HTMLInputElement).value];
  $('count-label').textContent = `${count}개`;
  restart();
});

$<HTMLInputElement>('delta').addEventListener('input', (e) => {
  const exp = +(e.target as HTMLInputElement).value;
  deltaDeg = 10 ** exp;
  $('delta-label').textContent = exp >= -3 ? `${deltaDeg}°` : `10${'⁻' + String(-exp).replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c])}°`;
  restart();
});

$<HTMLInputElement>('g').addEventListener('input', (e) => {
  params.g = +(e.target as HTMLInputElement).value;
  $('g-label').textContent = `${params.g.toFixed(2)} m/s²`;
  restart();
});

$<HTMLInputElement>('speed').addEventListener('input', (e) => {
  speed = +(e.target as HTMLInputElement).value;
  $('speed-label').textContent = `× ${speed.toFixed(2)}`;
});

$<HTMLInputElement>('trails').addEventListener('change', (e) => {
  showTrails = (e.target as HTMLInputElement).checked;
  trails = pendulums.map(() => []);
});

// ── 시작 ────────────────────────────────────────────────
restart();
const ro = new ResizeObserver(resize);
ro.observe(canvas);
ro.observe(chart);
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
