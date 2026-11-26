import { describe, expect, test } from 'vitest';
import {
  G0, PLANETS, absorbIntoSun, createSolarSystem, escapeSpeed, semiMajorAxis,
  step, totalEnergy, totalMomentum,
} from './nbody';
import { OrbitTracker } from './kepler';

const DT = 0.0005;
const earthOnly = PLANETS.filter((p) => p.name === '지구');

function run(years: number, sim = createSolarSystem(), integrator: 'verlet' | 'euler' = 'verlet') {
  const n = Math.round(years / DT);
  for (let i = 0; i < n; i++) step(sim, DT, integrator);
  return sim;
}

function relEnergyDrift(years: number, integrator: 'verlet' | 'euler') {
  const sim = createSolarSystem();
  const E0 = totalEnergy(sim);
  run(years, sim, integrator);
  return Math.abs((totalEnergy(sim) - E0) / E0);
}

describe('보존 법칙', () => {
  test('Velocity Verlet: 태양계 10년 후 총 에너지 오차 < 0.01%', () => {
    expect(relEnergyDrift(10, 'verlet')).toBeLessThan(1e-4);
  });

  test('총 운동량은 0으로 유지된다', () => {
    const sim = run(5);
    const { px, py } = totalMomentum(sim);
    expect(Math.hypot(px, py)).toBeLessThan(1e-12);
  });

  test('오일러는 Verlet보다 에너지가 훨씬 많이 샌다 (적분법 비교 기능의 전제)', () => {
    expect(relEnergyDrift(2, 'euler')).toBeGreaterThan(100 * relEnergyDrift(2, 'verlet'));
  });
});

describe('케플러 법칙', () => {
  test('지구 공전 주기 ≈ 1년', () => {
    const sim = createSolarSystem({ planets: earthOnly, phases: [0] });
    const tracker = new OrbitTracker(sim);
    for (let i = 0; i < 2.5 / DT; i++) {
      step(sim, DT);
      tracker.update(sim, DT);
    }
    expect(tracker.period('지구')).toBeCloseTo(1, 3);
  });

  test('제3법칙: 모든 행성에서 T²/a³ ≈ 4π²/(GM) = 1', () => {
    const sim = createSolarSystem();
    const tracker = new OrbitTracker(sim);
    for (let i = 0; i < 12.5 / DT; i++) {
      step(sim, DT);
      tracker.update(sim, DT);
    }
    for (const p of PLANETS) {
      const T = tracker.period(p.name);
      expect(T, p.name).not.toBeNull();
      expect(T! ** 2 / p.a ** 3, p.name).toBeCloseTo(1, 1);
    }
  });

  test('G를 2배로 하면 같은 원궤도의 주기는 1/√2배', () => {
    const sim = createSolarSystem({ planets: earthOnly, phases: [0], G: 2 * G0 });
    const tracker = new OrbitTracker(sim);
    for (let i = 0; i < 2 / DT; i++) {
      step(sim, DT);
      tracker.update(sim, DT);
    }
    expect(tracker.period('지구')).toBeCloseTo(1 / Math.SQRT2, 3);
  });
});

describe('궤도 진단', () => {
  test('원궤도의 긴반지름은 궤도 반지름과 같다', () => {
    const sim = createSolarSystem();
    const [sun, ...planets] = sim.bodies;
    // 목성 때문에 태양이 반동으로 움직여 상대속도가 조금 어긋난다 → 상대오차 0.5% 이내
    planets.forEach((b, i) => {
      const relErr = Math.abs(semiMajorAxis(sun, b, sim.G) / PLANETS[i].a - 1);
      expect(relErr, b.name).toBeLessThan(5e-3);
    });
  });

  test('원궤도 속도 × √2 = 탈출 속도 → 묶이지 않음', () => {
    const sim = createSolarSystem({ planets: earthOnly, phases: [0] });
    const [sun, earth] = sim.bodies;
    const v = Math.hypot(earth.vx, earth.vy);
    expect(escapeSpeed(sun, earth, sim.G) / v).toBeCloseTo(Math.SQRT2, 3);
    earth.vy *= Math.SQRT2 * 1.01;
    expect(semiMajorAxis(sun, earth, sim.G)).toBe(Infinity);
  });

  test('태양에 충돌하면 흡수되고 운동량은 보존된다', () => {
    const sim = createSolarSystem({ planets: earthOnly, phases: [0] });
    const before = totalMomentum(sim);
    sim.bodies[1].x = 0.001;
    expect(absorbIntoSun(sim, 0.02)).toEqual(['지구']);
    const after = totalMomentum(sim);
    expect(after.px).toBeCloseTo(before.px, 12);
    expect(after.py).toBeCloseTo(before.py, 12);
  });
});
