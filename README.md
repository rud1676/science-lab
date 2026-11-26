# Science Lab 🪐

> 읽는 과학 말고, 만져보는 과학.

물리·수학 법칙을 코드로 옮겨 브라우저에서 직접 실험해 보는 사이트.

## 실험
| 실험 | 내용 |
|---|---|
| [만유인력 태양계](experiments/solar-system/) | N체 중력 시뮬레이션. G 조절, 행성 던지기(탈출 속도), 케플러 제3법칙 실시간 측정, 오일러 vs Velocity Verlet 비교 |

## 개발
```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 물리 테스트
npm run build   # dist/ 에 정적 사이트 생성
```

## 물리 테스트가 지키는 것
- Velocity Verlet로 태양계 10년 적분 후 총 에너지 오차 < 0.01%
- 총 운동량 보존, 충돌 흡수 시에도 운동량 보존
- 지구 공전 주기 ≈ 1년, 모든 행성 T²/a³ ≈ 1 (케플러 제3법칙)
- G를 2배로 하면 주기는 1/√2배
- 원궤도 속도 × √2 = 탈출 속도

계획과 로드맵은 [PLAN.md](PLAN.md).
