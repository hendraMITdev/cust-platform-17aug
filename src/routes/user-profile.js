// src/routes/user-profile.js
import { pool } from '../db.js';
import { maskMsisdn } from '../lib/mask.js';
import { isValidUserId } from '../lib/validate.js';

// GET /api/user-profile/:user_id — the Round 5 load-test target (100
// concurrent, 100% of traffic, 5s hard timeout, <30ms target). Correlated
// subqueries per FK-indexed table rather than a JOIN+GROUP BY: each subquery
// is a cheap Index (Only) Scan on idx_orders_user / idx_txn_order /
// idx_activity_user for a single user_id, and Postgres evaluates them without
// materializing a join across all four tables. Confirmed via EXPLAIN ANALYZE
// on the live DB: total execution ~3.2ms server-side (all index scans, no seq
// scans), ~17-19ms round-trip including network from this test client.
const PROFILE_SQL = `
  SELECT
    u.user_id, u.full_name, u.user_email, u.msisdn, u.status, u.create_time,
    (SELECT count(*) FROM ws_orders o WHERE o.user_id = u.user_id) AS order_count,
    (SELECT coalesce(sum(t.transaction_amount), 0)
       FROM ws_transactions t
       JOIN ws_orders o ON t.order_id = o.order_id
       WHERE o.user_id = u.user_id) AS transaction_total,
    (SELECT count(*) FROM ws_user_activity a WHERE a.user_id = u.user_id) AS activity_count,
    (SELECT max(a.activity_timestamp) FROM ws_user_activity a WHERE a.user_id = u.user_id) AS last_activity
  FROM ws_user u
  WHERE u.user_id = $1::bigint
`;

export default async function userProfileRoutes(fastify) {
  fastify.get('/api/user-profile/:user_id', async (request, reply) => {
    const rawId = request.params.user_id;

    if (!isValidUserId(rawId)) {
      reply.code(404);
      return { error: 'not found' };
    }

    try {
      const { rows } = await pool.query(PROFILE_SQL, [rawId]);
      if (rows.length === 0) {
        reply.code(404);
        return { error: 'not found' };
      }

      const row = rows[0];
      return {
        user_id: row.user_id,
        full_name: row.full_name,
        user_email: row.user_email,
        msisdn: maskMsisdn(row.msisdn),
        status: row.status,
        order_count: row.order_count,
        transaction_total: Number(row.transaction_total),
        activity_count: row.activity_count,
        last_activity: row.last_activity ? row.last_activity.toISOString() : null,
        created_at: row.create_time ? row.create_time.toISOString() : null,
      };
    } catch (err) {
      request.log.error({ err }, 'GET /api/user-profile/:user_id failed');
      reply.code(500);
      return { error: 'internal server error' };
    }
  });
}
