// src/routes/search.js
import { pool } from '../db.js';
import { maskMsisdn } from '../lib/mask.js';
import { phoneVariants } from '../lib/phone.js';
import { isValidSearchType, isValidUserId, parseLimit, parseOffset } from '../lib/validate.js';

// Name search is bounded via a capped subquery for the total count rather than
// a full COUNT(*) over the ILIKE predicate — a popular substring can match
// hundreds of thousands of rows, and counting all of them on every request
// would blow past the 300ms/p99 500ms budget for no user-facing benefit.
const NAME_COUNT_CAP = 1000;

function mapRow(row) {
  return {
    user_id: row.user_id,
    full_name: row.full_name,
    user_email: row.user_email,
    msisdn: maskMsisdn(row.msisdn),
    status: row.status,
    created_at: row.create_time ? row.create_time.toISOString() : null,
  };
}

async function searchEmail(q, limit, offset) {
  const { rows } = await pool.query(
    `SELECT user_id, full_name, user_email, msisdn, status, create_time,
            count(*) OVER() AS total_count
     FROM ws_user
     WHERE lower(user_email) = lower($1)
     ORDER BY user_id
     LIMIT $2 OFFSET $3`,
    [q, limit, offset],
  );
  const total = rows.length > 0 ? rows[0].total_count : 0;
  return { results: rows.map(mapRow), total };
}

async function searchPhone(q, limit, offset) {
  const variants = phoneVariants(q);
  if (variants.length === 0) return { results: [], total: 0 };

  const { rows } = await pool.query(
    `SELECT user_id, full_name, user_email, msisdn, status, create_time,
            count(*) OVER() AS total_count
     FROM ws_user
     WHERE msisdn IN ($1, $2)
     ORDER BY user_id
     LIMIT $3 OFFSET $4`,
    [variants[0], variants[1], limit, offset],
  );
  const total = rows.length > 0 ? rows[0].total_count : 0;
  return { results: rows.map(mapRow), total };
}

async function searchUserId(q, limit, offset) {
  if (!isValidUserId(q)) return { results: [], total: 0 };

  const { rows } = await pool.query(
    `SELECT user_id, full_name, user_email, msisdn, status, create_time
     FROM ws_user
     WHERE user_id = $1::bigint
     LIMIT $2 OFFSET $3`,
    [q, limit, offset],
  );
  return { results: rows.map(mapRow), total: rows.length };
}

async function searchName(q, limit, offset) {
  const nameExpr = `(coalesce(user_name,'') || ' ' || coalesce(full_name,''))`;
  // Measured on live data: `ORDER BY similarity(...) DESC LIMIT n` with no
  // inner cap forces Postgres to score+sort EVERY ILIKE match before it can
  // apply the limit. Common Indonesian name substrings (e.g. "andi", "sari")
  // match tens of thousands of rows, pushing this well past the 300ms/p99
  // 500ms budget (observed 200ms-2000ms). Bounding the ILIKE candidate set to
  // NAME_COUNT_CAP rows first (still an indexed GIN bitmap scan) and only
  // similarity-sorting that bounded set brought every tested term under
  // ~300ms. Trade-off: ranking is "best of the first N matches", not a
  // globally-optimal top-K by similarity — acceptable for a fuzzy/partial
  // search feature, and pagination stays coherent up to NAME_COUNT_CAP rows.
  const [mainResult, countResult] = await Promise.all([
    pool.query(
      `SELECT user_id, full_name, user_email, msisdn, status, create_time
       FROM (
         SELECT * FROM ws_user
         WHERE ${nameExpr} ILIKE '%' || $1 || '%'
         LIMIT ${NAME_COUNT_CAP}
       ) bounded
       ORDER BY similarity(${nameExpr}, $1) DESC
       LIMIT $2 OFFSET $3`,
      [q, limit, offset],
    ),
    pool.query(
      `SELECT count(*)::int AS total FROM (
         SELECT 1 FROM ws_user
         WHERE ${nameExpr} ILIKE '%' || $1 || '%'
         LIMIT ${NAME_COUNT_CAP}
       ) t`,
      [q],
    ),
  ]);
  return { results: mainResult.rows.map(mapRow), total: countResult.rows[0].total };
}

const HANDLERS = {
  email: searchEmail,
  phone: searchPhone,
  user_id: searchUserId,
  name: searchName,
};

export default async function searchRoutes(fastify) {
  fastify.get('/api/search', async (request, reply) => {
    const q = typeof request.query.q === 'string' ? request.query.q : '';
    const type = typeof request.query.type === 'string' ? request.query.type : '';
    const limit = parseLimit(request.query.limit);
    const offset = parseOffset(request.query.offset);

    if (!isValidSearchType(type)) {
      reply.code(400);
      return { error: `invalid type: must be one of email, phone, user_id, name` };
    }

    if (q.length === 0) {
      return { query: q, type, limit, offset, results: [], total: 0, took_ms: 0 };
    }

    // Compliance: no caching anywhere in this API. Every request recomputes
    // live against the database — see db.js / route comments for how the
    // indexes make that fast enough not to need one.
    const t0 = Date.now();

    try {
      const { results, total } = await HANDLERS[type](q, limit, offset);

      return { query: q, type, limit, offset, results, total, took_ms: Date.now() - t0 };
    } catch (err) {
      request.log.error({ err }, 'search query failed');
      reply.code(500);
      return { error: 'internal server error' };
    }
  });
}
