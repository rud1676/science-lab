import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// 실험 하나 = experiments/<slug>/index.html. 실험은 이 3개로 고정한다(CLAUDE.md 참고).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: root('./index.html'),
        'solar-system': root('./experiments/solar-system/index.html'),
        'double-pendulum': root('./experiments/double-pendulum/index.html'),
        fourier: root('./experiments/fourier/index.html'),
      },
    },
  },
});
