import { describe, expect, test } from 'vitest';
import { byAmplitude, dft, evaluate, heart, resampleClosed, rmsError, square, type Point } from './fourier';

const N = 128;

describe('DFT', () => {
  test('반지름 2인 원은 k=1 화살표 하나뿐이다', () => {
    const circle = Array.from({ length: N }, (_, n) => ({
      x: 2 * Math.cos((2 * Math.PI * n) / N),
      y: 2 * Math.sin((2 * Math.PI * n) / N),
    }));
    const [first, second] = byAmplitude(dft(circle));
    expect(first.k).toBe(1);
    expect(first.amp).toBeCloseTo(2, 10);
    expect(second.amp).toBeLessThan(1e-10);
  });

  test('모든 항을 쓰면 원래 점들을 정확히 복원한다', () => {
    const pts = heart(N);
    const terms = dft(pts);
    pts.forEach((p, n) => {
      const q = evaluate(terms, n / N);
      expect(q.x).toBeCloseTo(p.x, 9);
      expect(q.y).toBeCloseTo(p.y, 9);
    });
  });

  test('파스발 정리: 평균 |z|² = Σ|c_k|²', () => {
    const pts = heart(N);
    const lhs = pts.reduce((s, p) => s + p.x ** 2 + p.y ** 2, 0) / N;
    const rhs = dft(pts).reduce((s, t) => s + t.amp ** 2, 0);
    expect(rhs).toBeCloseTo(lhs, 10);
  });
});

describe('근사', () => {
  test('화살표를 많이 쓸수록 오차가 줄어든다 (사각형)', () => {
    const pts = square(N);
    const sorted = byAmplitude(dft(pts));
    const errs = [3, 10, 30, 64].map((K) => rmsError(pts, sorted.slice(0, K)));
    for (let i = 1; i < errs.length; i++) expect(errs[i]).toBeLessThan(errs[i - 1]);
    expect(rmsError(pts, sorted)).toBeLessThan(1e-9);
  });

  test('하트는 화살표 10개로도 오차 3% 미만 (에너지가 저주파에 몰려 있다)', () => {
    const pts = heart(N);
    expect(rmsError(pts, byAmplitude(dft(pts)).slice(0, 10))).toBeLessThan(0.03);
  });
});

describe('리샘플링', () => {
  test('불규칙하게 찍힌 점들을 같은 간격으로 다시 뽑는다', () => {
    const raw: Point[] = [
      { x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.15, y: 0 }, { x: 1, y: 0 },
      { x: 1, y: 1 }, { x: 0, y: 1 },
    ];
    const pts = resampleClosed(raw, 40);
    const gaps = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length];
      return Math.hypot(q.x - p.x, q.y - p.y);
    });
    // 모서리를 가로지르는 간격만 약간 짧을 수 있다
    expect(Math.max(...gaps)).toBeCloseTo(0.1, 6);
    expect(Math.min(...gaps)).toBeGreaterThan(0.07);
  });
});
