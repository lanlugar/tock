import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGameServer } from './server.js';
const workspaceRoot = resolve(import.meta.dirname, '../../..');
const envFile = resolve(workspaceRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
)
  throw new Error('Set SESSION_SECRET to at least 32 random characters.');
const server = createGameServer({
  secret: process.env.SESSION_SECRET || undefined,
  origins: (
    process.env.CLIENT_ORIGIN ??
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001'
  )
    .split(',')
    .map((s) => s.trim()),
  webRoot: resolve(workspaceRoot, process.env.WEB_ROOT ?? 'apps/web/dist'),
});
const port = Number(process.env.PORT ?? 3001);
server.http.listen(port, '0.0.0.0', () => console.log(`Tock Online listening on port ${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
