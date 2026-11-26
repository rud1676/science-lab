import { describe, expect, test } from 'vitest';
import { DEFAULT_PARAMS as P, energy, rk4Step, separation, type PendulumState } from './pendulum';

const DT = 0.001;

function run(s: PendulumState, seconds: number, onStep?: (s: PendulumState, t: number) => void) {
  for (let i = 1; i <= Math.round(seconds / DT); i++) {
    s = rk4Step(s, P, DT);
    onStep?.(s, i * DT);
  }
  return s;
}

const deg = (d: number) => (d * Math.PI) / 180;

describe('보존 법칙', () => {
  test('RK4: 카오스 영역(120°)에서도 20초 후 에너지 오차 < 0.01%', () => {
    const s0 = { t1: deg(120), t2: deg(-20), w1: 0, w2: 0 };
    const E0 = energy(s0, P);
    const s = run(s0, 20);
    expect(Math.abs((energy(s, P) - E0) / E0)).toBeLessThan(1e-4);
  });
});

describe('작은 각도 극한 (선형 진동)', () => {
  // m₁=m₂, L₁=L₂ 일 때 정규 모드: θ₂ = ±√2 θ₁, ω² = (2 ∓ √2) g/L
  test.each([
    ['느린 모드', Math.SQRT2, 2 - Math.SQRT2],
    ['빠른 모드', -Math.SQRT2, 2 + Math.SQRT2],
  ])('%s의 주기가 이론값과 일치', (_, ratio, k) => {
    const amp = 0.002;
    let prev = amp;
    const crossings: number[] = [];
    run({ t1: amp, t2: ratio * amp, w1: 0, w2: 0 }, 12, (s, t) => {
      if (prev > 0 && s.t1 <= 0) crossings.push(t);
      prev = s.t1;
    });
    // 같은 방향 영점 통과 사이 간격 = 한 주기
    const periods = crossings.slice(1).map((t, i) => t - crossings[i]);
    const T = periods.reduce((a, b) => a + b) / periods.length;
    const theory = (2 * Math.PI) / Math.sqrt((k * P.g) / P.L1);
    expect(Math.abs(T / theory - 1)).toBeLessThan(2e-3);
  });
});

describe('카오스', () => {
  test('큰 각도: 10⁻⁹ rad 차이가 20초 안에 0.1 rad 이상으로 벌어진다', () => {
    let a = { t1: deg(120), t2: deg(-20), w1: 0, w2: 0 };
    let b = { ...a, t1: a.t1 + 1e-9 };
    let maxSep = 0;
    for (let i = 0; i < 20 / DT; i++) {
      a = rk4Step(a, P, DT);
      b = rk4Step(b, P, DT);
      maxSep = Math.max(maxSep, separation(a, b));
    }
    expect(maxSep).toBeGreaterThan(0.1);
  });

  test('작은 각도: 같은 차이가 20초 동안 거의 자라지 않는다', () => {
    let a = { t1: deg(5), t2: deg(5), w1: 0, w2: 0 };
    let b = { ...a, t1: a.t1 + 1e-9 };
    let maxSep = 0;
    for (let i = 0; i < 20 / DT; i++) {
      a = rk4Step(a, P, DT);
      b = rk4Step(b, P, DT);
      maxSep = Math.max(maxSep, separation(a, b));
    }
    expect(maxSep).toBeLessThan(1e-7);
  });
});
