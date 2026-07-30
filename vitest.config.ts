import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'node:crypto': path.resolve(__dirname, 'src/test-shims/node-crypto.ts'),
      crypto: path.resolve(__dirname, 'src/test-shims/node-crypto.ts'),
      'tus-js-client': path.resolve(__dirname, 'src/test-shims/tus-js-client.ts'),
    },
  },
});
