import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// 실험 하나 = experiments/<slug>/index.html. 새 실험을 추가하면 여기에도 등록한다.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: root('./index.html'),
        'solar-system': root('./experiments/solar-system/index.html'),
      },
    },
  },
});
