// build.mjs
import { build } from 'esbuild';

const external = [
  // mark all runtime libs external; Node will require/import them
  'express', 'cors', 'http', 'socket.io',
  'bullmq', 'pg', 'pg-native', 'redis', 'axios', 'geojson'
];

await build({
  entryPoints: ['src/server.ts', 'src/worker.ts'],
  bundle: true,
  external,
  platform: 'node',
  target: 'node22',
  outdir: 'dist',
  format: 'esm',
  splitting: true,
  sourcemap: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});
