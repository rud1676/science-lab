// 복소 푸리에 급수 / 이산 푸리에 변환(DFT).
// 닫힌 곡선의 점 z_n (n = 0..N−1) 을 회전하는 화살표 c_k·e^(2πikt) 들의 합으로 나타낸다.

export interface Point {
  x: number;
  y: number;
}

export interface Term {
  /** 회전 속도(한 주기 동안 도는 바퀴 수). 음수면 시계 방향 */
  k: number;
  re: number;
  im: number;
  /** 화살표 길이 |c_k| */
  amp: number;
  /** 시작 각도 arg(c_k) */
  phase: number;
}

/** c_k = (1/N) Σ z_n · e^(−2πikn/N). k는 −N/2 ≤ k < N/2 로 둔다(가장 느린 회전으로 표현). */
export function dft(points: Point[]): Term[] {
  const N = points.length;
  const terms: Term[] = [];
  for (let j = 0; j < N; j++) {
    const k = j < N / 2 ? j : j - N;
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n++) {
      const angle = (-2 * Math.PI * k * n) / N;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      // (x + iy)(c + is) = (xc − ys) + i(xs + yc)
      re += points[n].x * c - points[n].y * s;
      im += points[n].x * s + points[n].y * c;
    }
    re /= N;
    im /= N;
    terms.push({ k, re, im, amp: Math.hypot(re, im), phase: Math.atan2(im, re) });
  }
  return terms;
}

/** z(t) = Σ c_k · e^(2πikt), t ∈ [0, 1) */
export function evaluate(terms: Term[], t: number): Point {
  let x = 0;
  let y = 0;
  for (const term of terms) {
    const angle = 2 * Math.PI * term.k * t + term.phase;
    x += term.amp * Math.cos(angle);
    y += term.amp * Math.sin(angle);
  }
  return { x, y };
}

/** 큰 화살표부터 (그리기 좋고, 앞쪽 K개만 써도 최선의 근사에 가깝다) */
export function byAmplitude(terms: Term[]): Term[] {
  return [...terms].sort((a, b) => b.amp - a.amp);
}

/** 손으로 그린 점들을 둘레 길이 기준으로 같은 간격의 n개 점으로 다시 뽑는다(닫힌 곡선으로 취급). */
export function resampleClosed(points: Point[], n: number): Point[] {
  const pts = [...points, points[0]];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = cum[cum.length - 1];
  const out: Point[] = [];
  let seg = 1;
  for (let i = 0; i < n; i++) {
    const target = (i / n) * total;
    while (cum[seg] < target) seg++;
    const span = cum[seg] - cum[seg - 1] || 1;
    const f = (target - cum[seg - 1]) / span;
    out.push({
      x: pts[seg - 1].x + (pts[seg].x - pts[seg - 1].x) * f,
      y: pts[seg - 1].y + (pts[seg].y - pts[seg - 1].y) * f,
    });
  }
  return out;
}

/** 중심을 원점으로, 가장 먼 점이 반지름 1 안에 들어오도록 */
export function normalize(points: Point[]): Point[] {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const r = Math.max(...points.map((p) => Math.hypot(p.x - cx, p.y - cy))) || 1;
  return points.map((p) => ({ x: (p.x - cx) / r, y: (p.y - cy) / r }));
}

/** 근사 곡선과 원래 점들 사이의 RMS 거리 */
export function rmsError(original: Point[], terms: Term[]): number {
  const N = original.length;
  let sum = 0;
  original.forEach((p, n) => {
    const q = evaluate(terms, n / N);
    sum += (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
  });
  return Math.sqrt(sum / N);
}

// ── 예시 도형 (y는 위가 +) ──────────────────────────────

export function heart(n: number): Point[] {
  const raw = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * 2 * Math.PI;
    return {
      x: 16 * Math.sin(t) ** 3,
      y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
    };
  });
  return normalize(resampleClosed(raw, n));
}

export function star(n: number, spikes = 5): Point[] {
  const corners = Array.from({ length: spikes * 2 }, (_, i) => {
    const r = i % 2 === 0 ? 1 : 0.42;
    const a = Math.PI / 2 + (i * Math.PI) / spikes;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
  return normalize(resampleClosed(corners, n));
}

export function square(n: number): Point[] {
  const corners = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ];
  return normalize(resampleClosed(corners, n));
}
