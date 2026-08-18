// src/routes/metrics.js
import { getCachedMetrics } from '../lib/quality-cache.js';
import { computeQualityAndMetrics } from '../lib/quality-compute.js';

// WAJIB endpoint: { duplicates, missing_fields, quality_score }. Served from the
// warm background snapshot (<50ms). Cold fallback computes live before the first
// refresh completes. Same values the /api/quality snapshot carries — one scan.
export default async function metricsRoutes(fastify) {
  fastify.get('/api/metrics', async (request, reply) => {
    try {
      const cached = getCachedMetrics();
      if (cached) return cached;
      const { metrics } = await computeQualityAndMetrics({ includeDups: true });
      return metrics;
    } catch (err) {
      request.log.error({ err }, 'metrics query failed');
      reply.code(500);
      return { error: 'internal server error' };
    }
  });
}
