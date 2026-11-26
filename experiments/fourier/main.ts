import '../../src/styles/base.css';
import '../../src/styles/lab.css';
import {
  byAmplitude, dft, evaluate, heart, normalize, resampleClosed, rmsError, square, star,
  type Point, type Term,
} from '../../src/math/fourier';

const N = 256;
const CURVE_SAMPLES = 600;
const SPECTRUM_K = 40;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('sim');
const ctx = canvas.getContext('2d')!;
const chart = $<HTMLCanvasElement>('chart');
const cctx = chart.getContext('2d')!;

const SHAPES: Record<string, () => Point[]> = {
  heart: () => heart(N),
  star: () => star(N),
  square: () => square(N),
};

// ── 상태 ────────────────────────────────────────────────
let original: Point[] = [];
let sorted: Term[] = []; // 큰 화살표부터
let K = N;
let active: Term[] = [];
let curve: Point[] = [];
let totalEnergy = 1;

let t = 0;
let period = 8;
let paused = false;
let showCircles = true;
let showGhost = true;
let drawMode = false;
let stroke: Point[] | null = null;

let viewW = 0;
let viewH = 0;
let scale = 1;

function load(points: Point[]): void {
  original = points;
  sorted = byAmplitude(dft(points));
  totalEnergy = sorted.reduce((s, c) => s + c.amp ** 2, 0);
  t = 0;
  setK(K);
}

function setK(k: number): void {
  K = Math.max(1, Math.min(N, k));
  active = sorted.slice(0, K);
  curve = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => evaluate(active, i / CURVE_SAMPLES));
  $('k-label').textContent = `${K} / ${N}`;
  const kept = active.reduce((s, c) => s + c.amp ** 2, 0) / totalEnergy;
  // 반올림으로 100%가 되지 않게 내림 (전부 쓴 경우만 100%)
  $('energy').textContent = K === N ? '100%' : `${(Math.floor(kept * 10000) / 100).toFixed(2)}%`;
  // 정규화로 그림이 반지름 1 안에 있으므로 RMS 오차는 곧 반지름 대비 비율
  $('error').textContent = `${(rmsError(original, active) * 100).toFixed(2)}%`;
  drawChart();
}

// ── 좌표 (y는 위가 +) ────────────────────────────────────
const toScreen = (p: Point) => ({ sx: viewW / 2 + p.x * scale, sy: viewH / 2 - p.y * scale });
const toWorld = (sx: number, sy: number): Point => ({ x: (sx - viewW / 2) / scale, y: -(sy - viewH / 2) / scale });

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
  scale = (Math.min(viewW, viewH) / 2) * 0.78;
  drawChart();
}

// ── 그리기 ───────────────────────────────────────────────
function polyline(points: Point[], close = false): void {
  ctx.beginPath();
  points.forEach((p, i) => {
    const { sx, sy } = toScreen(p);
    if (i) ctx.lineTo(sx, sy);
    else ctx.moveTo(sx, sy);
  });
  if (close) ctx.closePath();
  ctx.stroke();
}

function draw(): void {
  ctx.clearRect(0, 0, viewW, viewH);

  if (stroke) {
    ctx.strokeStyle = '#ffd35c';
    ctx.lineWidth = 2;
    polyline(stroke);
    return;
  }

  if (showGhost) {
    ctx.strokeStyle = 'rgba(144, 151, 179, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    polyline(original, true);
    ctx.setLineDash([]);
  }

  // 완성된 근사 곡선(흐리게) + 지금까지 그린 부분(밝게)
  ctx.strokeStyle = 'rgba(255, 211, 92, 0.18)';
  ctx.lineWidth = 2;
  polyline(curve);
  const upto = Math.floor(t * CURVE_SAMPLES);
  ctx.strokeStyle = '#ffd35c';
  ctx.lineWidth = 2.2;
  polyline([...curve.slice(0, upto + 1), evaluate(active, t)]);

  // 회전하는 화살표 사슬
  let p: Point = { x: 0, y: 0 };
  for (const term of active) {
    const a = 2 * Math.PI * term.k * t + term.phase;
    const q = { x: p.x + term.amp * Math.cos(a), y: p.y + term.amp * Math.sin(a) };
    const r = term.amp * scale;
    if (r > 0.6) {
      const s0 = toScreen(p);
      const s1 = toScreen(q);
      if (showCircles) {
        ctx.strokeStyle = 'rgba(122, 162, 255, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s0.sx, s0.sy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(231, 233, 243, 0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(s0.sx, s0.sy);
      ctx.lineTo(s1.sx, s1.sy);
      ctx.stroke();
    }
    p = q;
  }
  const tip = toScreen(p);
  ctx.fillStyle = '#ffd35c';
  ctx.beginPath();
  ctx.arc(tip.sx, tip.sy, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawChart(): void {
  const r = chart.getBoundingClientRect();
  const w = r.width;
  const h = r.height;
  if (!w || !sorted.length) return;
  const pad = { l: 30, r: 8, t: 8, b: 20 };
  cctx.clearRect(0, 0, w, h);
  cctx.font = '10px sans-serif';

  const LOG_MIN = -4;
  const LOG_MAX = 0;
  const used = new Set(active.map((c) => c.k));
  const byK = new Map(sorted.map((c) => [c.k, c]));
  const bw = (w - pad.l - pad.r) / (2 * SPECTRUM_K + 1);
  const Y = (amp: number) => {
    const l = Math.max(LOG_MIN, Math.min(LOG_MAX, Math.log10(Math.max(amp, 1e-12))));
    return h - pad.b - ((l - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (h - pad.t - pad.b);
  };

  cctx.strokeStyle = '#242a45';
  cctx.fillStyle = '#9097b3';
  for (let e = LOG_MIN; e <= LOG_MAX; e++) {
    cctx.beginPath();
    cctx.moveTo(pad.l, Y(10 ** e));
    cctx.lineTo(w - pad.r, Y(10 ** e));
    cctx.stroke();
    cctx.fillText(`1e${e}`, 2, Y(10 ** e) + 3);
  }

  for (let k = -SPECTRUM_K; k <= SPECTRUM_K; k++) {
    const c = byK.get(k);
    if (!c) continue;
    const x = pad.l + (k + SPECTRUM_K) * bw;
    cctx.fillStyle = used.has(k) ? '#7aa2ff' : '#2e3558';
    cctx.fillRect(x + bw * 0.15, Y(c.amp), bw * 0.7, h - pad.b - Y(c.amp));
  }
  cctx.fillStyle = '#9097b3';
  for (const k of [-SPECTRUM_K, -20, 0, 20, SPECTRUM_K]) {
    cctx.fillText(String(k), pad.l + (k + SPECTRUM_K + 0.5) * bw - 6, h - 6);
  }
}

function updateHud(): void {
  $('hud').textContent = `t = ${t.toFixed(3)} · 화살표 ${K}개 · N = ${N}점`;
}

// ── 입력 ────────────────────────────────────────────────
const sliderToK = (v: number) => Math.max(1, Math.round(Math.exp((v / 100) * Math.log(N))));

$<HTMLInputElement>('k').addEventListener('input', (e) => setK(sliderToK(+(e.target as HTMLInputElement).value)));

$<HTMLInputElement>('period').addEventListener('input', (e) => {
  period = +(e.target as HTMLInputElement).value;
  $('period-label').textContent = `${period}초`;
});

$('play').addEventListener('click', () => {
  paused = !paused;
  $('play').textContent = paused ? '재생' : '일시정지';
});

$<HTMLInputElement>('circles').addEventListener('change', (e) => (showCircles = (e.target as HTMLInputElement).checked));
$<HTMLInputElement>('ghost').addEventListener('change', (e) => (showGhost = (e.target as HTMLInputElement).checked));

document.querySelectorAll<HTMLButtonElement>('#presets button').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('#presets button').forEach((b) => b.classList.toggle('active', b === btn));
    const shape = btn.dataset.shape!;
    drawMode = shape === 'draw';
    canvas.style.cursor = drawMode ? 'crosshair' : 'default';
    $('hint').classList.toggle('hidden', !drawMode);
    if (!drawMode) load(SHAPES[shape]());
  }),
);

canvas.addEventListener('pointerdown', (e) => {
  if (!drawMode) return;
  const r = canvas.getBoundingClientRect();
  stroke = [toWorld(e.clientX - r.left, e.clientY - r.top)];
  canvas.setPointerCapture(e.pointerId);
  $('hint').classList.add('hidden');
});

canvas.addEventListener('pointermove', (e) => {
  if (!stroke) return;
  const r = canvas.getBoundingClientRect();
  const p = toWorld(e.clientX - r.left, e.clientY - r.top);
  const last = stroke[stroke.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) * scale > 2) stroke.push(p);
});

canvas.addEventListener('pointerup', () => {
  if (!stroke) return;
  const pts = stroke;
  stroke = null;
  const length = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
  if (pts.length < 10 || length * scale < 60) {
    $('hint').classList.remove('hidden');
    return;
  }
  load(normalize(resampleClosed(pts, N)));
});

canvas.addEventListener('pointercancel', () => (stroke = null));

// ── 시작 ────────────────────────────────────────────────
const ro = new ResizeObserver(resize);
ro.observe(canvas);
ro.observe(chart);
resize();
load(SHAPES.heart());

let last = performance.now();
function frame(now: number): void {
  const realDt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!paused && !stroke) t = (t + realDt / period) % 1;
  draw();
  updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
