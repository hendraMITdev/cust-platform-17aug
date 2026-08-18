// src/lib/quality-stats.js
//
// Live full-table quality aggregates for /api/quality and /api/metrics. Computed
// per request, never cached. All run on reportPool (256MB work_mem + forced
// parallel-cost GUCs — see db.js). Design:
//   - ONE parallel scan yields every scalar signal + the status distribution.
//   - dup/unique counts are two GROUP BYs; phone keeps its parallel index-only
//     scan, email is forced off the (serial, 80s) index scan onto a parallel
//     seq scan via a transaction-scoped SET LOCAL.
//   - examples are a separate cheap LIMIT-5-per-issue query.

import { reportPool } from '../db.js';

const HOBBIES_EMOJI = `('[' || (U&'\\+01F300') || '-' || (U&'\\+01FAFF') || (U&'\\2600') || '-' || (U&'\\27BF') || ']')`;

const MAIN_STATS_SQL = `
  SELECT
    count(*)::bigint AS total,
    count(*) FILTER (WHERE user_email IS NULL OR user_email = '')::bigint AS email_missing,
    count(*) FILTER (WHERE user_email IS NOT NULL AND user_email <> '' AND user_email !~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')::bigint AS email_invalid,
    count(*) FILTER (WHERE msisdn IS NULL OR msisdn = '')::bigint AS phone_missing,
    count(*) FILTER (WHERE msisdn IS NOT NULL AND msisdn <> '' AND (msisdn ~ '[^0-9]' OR length(msisdn) < 8 OR length(msisdn) > 15))::bigint AS phone_malformed,
    count(*) FILTER (WHERE birth_date IS NULL)::bigint AS birth_missing,
    count(*) FILTER (WHERE birth_date IS NOT NULL AND extract(year FROM birth_date) < 1900)::bigint AS birth_impossible,
    count(*) FILTER (WHERE birth_date IS NOT NULL AND birth_date > CURRENT_DATE)::bigint AS birth_future,
    count(*) FILTER (WHERE hobbies IS NULL)::bigint AS hobbies_null,
    count(*) FILTER (WHERE hobbies IS NOT NULL AND hobbies ~ '[^a-zA-Z0-9\\s,.\\-]')::bigint AS hobbies_special,
    count(*) FILTER (WHERE hobbies IS NOT NULL AND hobbies ~ ${HOBBIES_EMOJI})::bigint AS hobbies_emoji,
    count(*) FILTER (WHERE status = -2)::bigint AS s_n2,
    count(*) FILTER (WHERE status = -1)::bigint AS s_n1,
    count(*) FILTER (WHERE status = 0)::bigint AS s_0,
    count(*) FILTER (WHERE status = 1)::bigint AS s_1,
    count(*) FILTER (WHERE status = 2)::bigint AS s_2,
    count(*) FILTER (WHERE status = 3)::bigint AS s_3,
    count(*) FILTER (WHERE status IS NULL)::bigint AS s_null,
    count(*) FILTER (WHERE status IS NOT NULL AND status NOT IN (-2,-1,0,1,2,3))::bigint AS s_other
  FROM ws_user
`;

export async function getMainStats() {
  const { rows } = await reportPool.query(MAIN_STATS_SQL);
  const r = rows[0];
  const distribution = {};
  for (const [k, v] of [['-2', r.s_n2], ['-1', r.s_n1], ['0', r.s_0], ['1', r.s_1], ['2', r.s_2], ['3', r.s_3], ['null', r.s_null], ['other', r.s_other]]) {
    if (Number(v) > 0) distribution[k] = Number(v);
  }
  r.status_distribution = distribution;
  return r;
}

// Up to 5 example values per issue type in one query; each subquery stops at
// LIMIT 5 (index-backed where an index exists, cheap seq stop-early otherwise).
const EXAMPLES_SQL = `
  (SELECT 'email_invalid'::text AS k, user_email::text AS v FROM ws_user WHERE user_email IS NOT NULL AND user_email <> '' AND user_email !~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' LIMIT 5)
  UNION ALL (SELECT 'phone_malformed', msisdn::text FROM ws_user WHERE msisdn IS NOT NULL AND msisdn <> '' AND (msisdn ~ '[^0-9]' OR length(msisdn) < 8 OR length(msisdn) > 15) LIMIT 5)
  UNION ALL (SELECT 'birth_impossible', to_char(birth_date, 'YYYY-MM-DD') FROM ws_user WHERE birth_date IS NOT NULL AND extract(year FROM birth_date) < 1900 LIMIT 5)
  UNION ALL (SELECT 'birth_future', to_char(birth_date, 'YYYY-MM-DD') FROM ws_user WHERE birth_date IS NOT NULL AND birth_date > CURRENT_DATE LIMIT 5)
  UNION ALL (SELECT 'hobbies_special', left(hobbies, 80) FROM ws_user WHERE hobbies IS NOT NULL AND hobbies ~ '[^a-zA-Z0-9\\s,.\\-]' LIMIT 5)
`;

export async function getExamples() {
  const { rows } = await reportPool.query(EXAMPLES_SQL);
  const out = {};
  for (const row of rows) (out[row.k] ||= []).push(row.v);
  return out;
}

const DUP_SQL = (expr, col) => `
  SELECT
    count(*)::bigint AS distinct_count,
    count(*) FILTER (WHERE c > 1)::bigint AS dup_groups,
    (coalesce(sum(c) FILTER (WHERE c > 1), 0) - coalesce(count(*) FILTER (WHERE c > 1), 0))::bigint AS extra_rows
  FROM (
    SELECT count(*) AS c
    FROM ws_user
    WHERE ${col} IS NOT NULL AND ${expr} <> ''
    GROUP BY ${expr}
  ) g
`;
const EMAIL_DUP_SQL = DUP_SQL('lower(user_email)', 'user_email');
const PHONE_DUP_SQL = DUP_SQL('msisdn', 'msisdn');

// Email is nearly all-unique (~14.7M groups); Postgres picks a serial index
// scan (~80s). Force it onto a parallel seq scan for this query only, scoped by
// SET LOCAL inside a transaction so the setting never leaks back to the pool.
export async function getEmailDupStats() {
  const client = await reportPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL enable_indexscan = off');
    await client.query('SET LOCAL enable_indexonlyscan = off');
    const { rows } = await client.query(EMAIL_DUP_SQL);
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Phone has many duplicates → fewer groups → Postgres parallelizes an index-only
// scan on its own (~20s). Plain pooled query.
export async function getPhoneDupStats() {
  const { rows } = await reportPool.query(PHONE_DUP_SQL);
  return rows[0];
}
