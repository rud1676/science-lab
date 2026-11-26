// 이중 진자. 단위: m, kg, s. 각도는 연직 아래 방향에서 잰 값(rad).
// 운동방정식은 라그랑지안 L = T − V 에 오일러–라그랑주 방정식을 적용해 얻는다.

export interface PendulumParams {
  m1: number;
  m2: number;
  L1: number;
  L2: number;
  g: number;
}

export interface PendulumState {
  t1: number;
  t2: number;
  w1: number;
  w2: number;
}

export const DEFAULT_PARAMS: PendulumParams = { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81 };

/** 상태 → 상태의 시간 변화율 (θ₁', θ₂', ω₁', ω₂') */
export function derivatives(s: PendulumState, p: PendulumParams): PendulumState {
  const { m1, m2, L1, L2, g } = p;
  const d = s.t1 - s.t2;
  const den = 2 * m1 + m2 - m2 * Math.cos(2 * d);

  const a1 =
    (-g * (2 * m1 + m2) * Math.sin(s.t1) -
      m2 * g * Math.sin(s.t1 - 2 * s.t2) -
      2 * Math.sin(d) * m2 * (s.w2 * s.w2 * L2 + s.w1 * s.w1 * L1 * Math.cos(d))) /
    (L1 * den);

  const a2 =
    (2 * Math.sin(d) *
      (s.w1 * s.w1 * L1 * (m1 + m2) + g * (m1 + m2) * Math.cos(s.t1) + s.w2 * s.w2 * L2 * m2 * Math.cos(d))) /
    (L2 * den);

  return { t1: s.w1, t2: s.w2, w1: a1, w2: a2 };
}

const add = (s: PendulumState, k: PendulumState, h: number): PendulumState => ({
  t1: s.t1 + k.t1 * h,
  t2: s.t2 + k.t2 * h,
  w1: s.w1 + k.w1 * h,
  w2: s.w2 + k.w2 * h,
});

/** 4차 룽게–쿠타: 한 스텝 안에서 기울기를 네 번 재서 가중 평균한다. 오차 ∝ dt⁴ */
export function rk4Step(s: PendulumState, p: PendulumParams, dt: number): PendulumState {
  const k1 = derivatives(s, p);
  const k2 = derivatives(add(s, k1, dt / 2), p);
  const k3 = derivatives(add(s, k2, dt / 2), p);
  const k4 = derivatives(add(s, k3, dt), p);
  const avg = (key: keyof PendulumState) => (k1[key] + 2 * k2[key] + 2 * k3[key] + k4[key]) / 6;
  return {
    t1: s.t1 + avg('t1') * dt,
    t2: s.t2 + avg('t2') * dt,
    w1: s.w1 + avg('w1') * dt,
    w2: s.w2 + avg('w2') * dt,
  };
}

export function energy(s: PendulumState, p: PendulumParams): number {
  const { m1, m2, L1, L2, g } = p;
  const kinetic =
    0.5 * (m1 + m2) * L1 * L1 * s.w1 * s.w1 +
    0.5 * m2 * L2 * L2 * s.w2 * s.w2 +
    m2 * L1 * L2 * s.w1 * s.w2 * Math.cos(s.t1 - s.t2);
  const potential = -(m1 + m2) * g * L1 * Math.cos(s.t1) - m2 * g * L2 * Math.cos(s.t2);
  return kinetic + potential;
}

/** 추의 위치. 받침점이 원점, y는 아래가 + */
export function positions(s: PendulumState, p: PendulumParams) {
  const x1 = p.L1 * Math.sin(s.t1);
  const y1 = p.L1 * Math.cos(s.t1);
  return { x1, y1, x2: x1 + p.L2 * Math.sin(s.t2), y2: y1 + p.L2 * Math.cos(s.t2) };
}

/** 두 진자 상태의 각도 차이 크기 √(Δθ₁² + Δθ₂²) */
export function separation(a: PendulumState, b: PendulumState): number {
  return Math.hypot(a.t1 - b.t1, a.t2 - b.t2);
}
