import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^(.*\/)?scripts\/app\.js$/,
        replacement: fileURLToPath(new URL('./tests/mocks/app.js', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
