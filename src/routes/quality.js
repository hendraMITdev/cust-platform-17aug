// src/routes/quality.js
import { getCachedQuality } from '../lib/quality-cache.js';
import { computeQualityAndMetrics } from '../lib/quality-compute.js';

export default async function qualityRoutes(fastify) {
  fastify.get('/api/quality', async (request, reply) => {
    try {
      // Fast path: the background loop keeps an exact snapshot warm — serve in <50ms.
      const cached = getCachedQuality();
      if (cached) return cached;
      // Cold fallback (before the first refresh completes): compute live.
      // `?dups=0` returns the fast base (~8s); otherwise the full exact result.
      const includeDups = request.query.dups !== '0';
      const { quality } = await computeQualityAndMetrics({ includeDups });
      return quality;
    } catch (err) {
      request.log.error({ err }, 'quality query failed');
      reply.code(500);
      return { error: 'internal server error' };
    }
  });
}
