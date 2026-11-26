import type { Body, Sim } from './nbody';

interface Track {
  prevAngle: number;
  /** 시작 이후 누적 회전각(rad, 부호 없음) */
  swept: number;
  lastCrossT: number;
  laps: number;
  period: number | null;
}

/** 중심 천체(bodies[0]) 기준으로 각 천체가 한 바퀴(2π) 도는 데 걸린 시간을 잰다. */
export class OrbitTracker {
  private tracks = new Map<string, Track>();

  constructor(sim: Sim) {
    for (const b of sim.bodies.slice(1)) this.reset(sim, b);
  }

  reset(sim: Sim, body: Body): void {
    this.tracks.set(body.name, {
      prevAngle: angleOf(sim.bodies[0], body),
      swept: 0,
      lastCrossT: sim.t,
      laps: 0,
      period: null,
    });
  }

  resetAll(sim: Sim): void {
    for (const b of sim.bodies.slice(1)) this.reset(sim, b);
  }

  /** 매 적분 스텝마다 호출한다(한 스텝의 회전각이 π보다 작아야 감김을 올바로 푼다). */
  update(sim: Sim, dt: number): void {
    const center = sim.bodies[0];
    for (const b of sim.bodies.slice(1)) {
      const tr = this.tracks.get(b.name);
      if (!tr || !b.alive) continue;
      const angle = angleOf(center, b);
      let d = angle - tr.prevAngle;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      tr.prevAngle = angle;
      const before = tr.swept;
      tr.swept += Math.abs(d);
      const target = (tr.laps + 1) * 2 * Math.PI;
      if (tr.swept >= target) {
        // 스텝 안에서 2π를 넘은 순간을 선형 보간
        const frac = (target - before) / (tr.swept - before);
        const crossT = sim.t - dt + frac * dt;
        tr.period = crossT - tr.lastCrossT;
        tr.lastCrossT = crossT;
        tr.laps++;
      }
    }
  }

  period(name: string): number | null {
    return this.tracks.get(name)?.period ?? null;
  }

  /** 아직 첫 바퀴를 못 돈 경우 진행률(0–1) */
  progress(name: string): number {
    const tr = this.tracks.get(name);
    if (!tr) return 0;
    return (tr.swept % (2 * Math.PI)) / (2 * Math.PI);
  }
}

function angleOf(center: Body, b: Body): number {
  return Math.atan2(b.y - center.y, b.x - center.x);
}
