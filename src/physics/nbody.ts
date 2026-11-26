// N체 중력 시뮬레이션.
// 단위: 거리 AU, 시간 년(yr), 질량 태양질량(M☉). 이 단위계에서 G = 4π².
// (지구: r = 1 AU, T = 1 yr, M = 1 M☉ → T² = 4π² r³ / (G M) 이 성립하도록 고른 값)

export const G0 = 4 * Math.PI ** 2;

export interface Body {
  name: string;
  mass: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  color: string;
  /** 화면에 그릴 반지름(px). 실제 크기 비율이 아님 */
  drawRadius: number;
  alive: boolean;
}

export interface Sim {
  bodies: Body[];
  G: number;
  t: number;
  /** r → 0 에서 힘이 발산하지 않도록 더하는 완화 길이(AU) */
  softening: number;
}

export type Integrator = 'verlet' | 'euler';

export function computeAccelerations(sim: Sim): void {
  const { bodies, G } = sim;
  const eps2 = sim.softening ** 2;
  for (const b of bodies) {
    b.ax = 0;
    b.ay = 0;
  }
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const r2 = dx * dx + dy * dy + eps2;
      const invR3 = 1 / (r2 * Math.sqrt(r2));
      // F = G m₁ m₂ / r² 를 방향 벡터(dx, dy)/r 에 곱한 것 → 가속도는 상대 질량만 남는다
      a.ax += G * b.mass * dx * invR3;
      a.ay += G * b.mass * dy * invR3;
      b.ax -= G * a.mass * dx * invR3;
      b.ay -= G * a.mass * dy * invR3;
    }
  }
}

/** Velocity Verlet: 위치를 먼저 옮기고, 새 위치의 가속도와 옛 가속도의 평균으로 속도를 갱신. 장기적으로 에너지가 보존된다. */
function stepVerlet(sim: Sim, dt: number): void {
  const half = 0.5 * dt;
  const prev = sim.bodies.map((b) => [b.ax, b.ay] as const);
  for (const b of sim.bodies) {
    if (!b.alive) continue;
    b.x += b.vx * dt + b.ax * half * dt;
    b.y += b.vy * dt + b.ay * half * dt;
  }
  computeAccelerations(sim);
  sim.bodies.forEach((b, i) => {
    if (!b.alive) return;
    b.vx += (prev[i][0] + b.ax) * half;
    b.vy += (prev[i][1] + b.ay) * half;
  });
}

/** 명시적 오일러: 지금의 속도·가속도로 한 번에 전진. 단순하지만 궤도가 점점 바깥으로 풀린다(에너지가 샌다). */
function stepEuler(sim: Sim, dt: number): void {
  for (const b of sim.bodies) {
    if (!b.alive) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vx += b.ax * dt;
    b.vy += b.ay * dt;
  }
  computeAccelerations(sim);
}

export function step(sim: Sim, dt: number, integrator: Integrator = 'verlet'): void {
  if (integrator === 'verlet') stepVerlet(sim, dt);
  else stepEuler(sim, dt);
  sim.t += dt;
}

export function setGravity(sim: Sim, G: number): void {
  sim.G = G;
  computeAccelerations(sim);
}

export function totalEnergy(sim: Sim): number {
  const alive = sim.bodies.filter((b) => b.alive);
  const eps2 = sim.softening ** 2;
  let kinetic = 0;
  let potential = 0;
  for (let i = 0; i < alive.length; i++) {
    const a = alive[i];
    kinetic += 0.5 * a.mass * (a.vx * a.vx + a.vy * a.vy);
    for (let j = i + 1; j < alive.length; j++) {
      const b = alive[j];
      const r = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + eps2);
      potential -= (sim.G * a.mass * b.mass) / r;
    }
  }
  return kinetic + potential;
}

export function totalMomentum(sim: Sim): { px: number; py: number } {
  let px = 0;
  let py = 0;
  for (const b of sim.bodies) {
    if (!b.alive) continue;
    px += b.mass * b.vx;
    py += b.mass * b.vy;
  }
  return { px, py };
}

/** 태양(bodies[0])에 너무 가까워진 천체를 흡수한다. 운동량은 태양이 이어받는다. 흡수된 천체 이름을 돌려준다. */
export function absorbIntoSun(sim: Sim, captureRadius: number): string[] {
  const sun = sim.bodies[0];
  const absorbed: string[] = [];
  for (const b of sim.bodies.slice(1)) {
    if (!b.alive) continue;
    if (Math.hypot(b.x - sun.x, b.y - sun.y) > captureRadius) continue;
    const m = sun.mass + b.mass;
    sun.vx = (sun.mass * sun.vx + b.mass * b.vx) / m;
    sun.vy = (sun.mass * sun.vy + b.mass * b.vy) / m;
    sun.mass = m;
    b.alive = false;
    absorbed.push(b.name);
  }
  if (absorbed.length) computeAccelerations(sim);
  return absorbed;
}

/** 활력 방정식(vis-viva) 1/a = 2/r − v²/μ 로 구한 궤도 긴반지름. 묶여 있지 않으면(탈출) Infinity. */
export function semiMajorAxis(central: Body, body: Body, G: number): number {
  const r = Math.hypot(body.x - central.x, body.y - central.y);
  const v2 = (body.vx - central.vx) ** 2 + (body.vy - central.vy) ** 2;
  const mu = G * (central.mass + body.mass);
  const inv = 2 / r - v2 / mu;
  return inv > 0 ? 1 / inv : Infinity;
}

/** 중심 천체로부터 거리 r 에서의 탈출 속도 √(2μ/r) */
export function escapeSpeed(central: Body, body: Body, G: number): number {
  const r = Math.hypot(body.x - central.x, body.y - central.y);
  return Math.sqrt((2 * G * (central.mass + body.mass)) / r);
}

export interface PlanetSpec {
  name: string;
  /** 궤도 반지름(AU) */
  a: number;
  /** 질량(M☉) */
  mass: number;
  color: string;
  drawRadius: number;
}

export const PLANETS: PlanetSpec[] = [
  { name: '수성', a: 0.387, mass: 1.66e-7, color: '#b8b2a7', drawRadius: 3 },
  { name: '금성', a: 0.723, mass: 2.45e-6, color: '#e8c27a', drawRadius: 4.5 },
  { name: '지구', a: 1.0, mass: 3.0e-6, color: '#5aa9ff', drawRadius: 5 },
  { name: '화성', a: 1.524, mass: 3.23e-7, color: '#e0674a', drawRadius: 4 },
  { name: '목성', a: 5.203, mass: 9.55e-4, color: '#d9a066', drawRadius: 9 },
];

export interface SolarSystemOptions {
  planets?: PlanetSpec[];
  G?: number;
  /** 각 행성의 시작 각도(rad). 생략하면 보기 좋게 흩어 놓는다 */
  phases?: number[];
}

/** 원궤도(v = √(GM/r))로 행성을 배치하고, 전체 운동량이 0이 되도록 태양 속도를 맞춘다. */
export function createSolarSystem(opts: SolarSystemOptions = {}): Sim {
  const G = opts.G ?? G0;
  const specs = opts.planets ?? PLANETS;
  const sun: Body = {
    name: '태양', mass: 1, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0,
    color: '#ffd35c', drawRadius: 12, alive: true,
  };
  const planets = specs.map((p, i): Body => {
    const phase = opts.phases?.[i] ?? i * 2.4;
    const v = Math.sqrt((G * (1 + p.mass)) / p.a);
    return {
      name: p.name, mass: p.mass,
      x: p.a * Math.cos(phase), y: p.a * Math.sin(phase),
      vx: -v * Math.sin(phase), vy: v * Math.cos(phase),
      ax: 0, ay: 0, color: p.color, drawRadius: p.drawRadius, alive: true,
    };
  });
  const sim: Sim = { bodies: [sun, ...planets], G, t: 0, softening: 1e-3 };
  const { px, py } = totalMomentum(sim);
  sun.vx -= px / sun.mass;
  sun.vy -= py / sun.mass;
  computeAccelerations(sim);
  return sim;
}
