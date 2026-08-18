// src/routes/metrics.js
import { reportPool } from '../db.js';
import { getEmailDupStats, getPhoneDupStats } from '../lib/quality-stats.js';

// WAJIB endpoint: { duplicates, missing_fields, quality_score }. Live-computed,
// never cached. One cheap full scan for missing_fields, then the two index-backed
// dup queries together — not all three concurrently (contends on 4 workers).
export default async function metricsRoutes(fastify) {
  fastify.get('/api/metrics', async (request, reply) => {
    try {
      const missingResult = await reportPool.query(
        `SELECT
           count(*)::bigint AS total,
           count(*) FILTER (
             WHERE (user_email IS NULL OR user_email = '')
                OR (msisdn IS NULL OR msisdn = '')
                OR birth_date IS NULL
           )::bigint AS missing_fields
         FROM ws_user`,
      );
      const [emailDup, phoneDup] = await Promise.all([getEmailDupStats(), getPhoneDupStats()]);

      const missingFields = missingResult.rows[0].missing_fields;
      const total = missingResult.rows[0].total;
      const duplicates = emailDup.extra_rows + phoneDup.extra_rows;
      const qualityScore = total > 0 ? Math.round((1 - missingFields / total) * 10000) / 100 : 0;

      return {
        duplicates,
        missing_fields: missingFields,
        quality_score: qualityScore,
      };
    } catch (err) {
      request.log.error({ err }, 'metrics query failed');
      reply.code(500);
      return { error: 'internal server error' };
    }
  });
}
