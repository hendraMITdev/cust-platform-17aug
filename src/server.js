// src/server.js
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyCompress from '@fastify/compress';
import fastifyStatic from '@fastify/static';

import { closePools } from './db.js';
import { startQualityRefreshLoop } from './lib/quality-cache.js';
import healthRoutes from './routes/health.js';
import searchRoutes from './routes/search.js';
import metricsRoutes from './routes/metrics.js';
import qualityRoutes from './routes/quality.js';
import duplicatesRoutes from './routes/duplicates.js';
import userProfileRoutes from './routes/user-profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const fastify = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  trustProxy: true,
});

await fastify.register(fastifyCompress, { global: true });
await fastify.register(fastifyStatic, { root: publicDir, prefix: '/' });

await fastify.register(healthRoutes);
await fastify.register(searchRoutes);
await fastify.register(metricsRoutes);
await fastify.register(qualityRoutes);
await fastify.register(duplicatesRoutes);
await fastify.register(userProfileRoutes);

// Live API docs: Swagger UI at /docs/ (public/docs/index.html) reads /openapi.json.
// This exact route just adds the no-trailing-slash convenience redirect.
fastify.get('/docs', (request, reply) => reply.redirect('/docs/'));

// Generic error handler: never leak stack traces, connection strings, or raw
// pg error internals to the client. Full detail still goes to the structured
// server-side logger for debugging.
fastify.setErrorHandler((err, request, reply) => {
  request.log.error({ err }, 'unhandled route error');
  const statusCode = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
  reply.code(statusCode).send({ error: statusCode < 500 ? err.message : 'internal server error' });
});

fastify.setNotFoundHandler((request, reply) => {
  reply.code(404).send({ error: 'not found' });
});

async function shutdown(signal) {
  fastify.log.info({ signal }, 'shutting down');
  try {
    await fastify.close();
    await closePools();
    process.exit(0);
  } catch (err) {
    fastify.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const port = Number(process.env.PORT) || 3000;

try {
  await fastify.listen({ host: '0.0.0.0', port });
  // Warm + keep the exact quality/metrics snapshot fresh in the background so the
  // heavy analytics endpoints serve instantly. Non-blocking: the server is already
  // listening; endpoints fall back to a live compute until the first refresh lands.
  startQualityRefreshLoop(fastify.log);
} catch (err) {
  fastify.log.error({ err }, 'failed to start server');
  process.exit(1);
}
