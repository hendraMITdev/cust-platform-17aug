// src/lib/quality-stats.js
//
// Live full-table quality aggregates for /api/quality and /api/metrics.
// Computed per request, never cached. Design for speed on a 4-worker box:
//   - ONE sequential scan of ws_user yields every scalar signal AND the status
//     distribution AND issue examples (FILTER + array-slice), instead of the
//     one-scan-per-signal fan-out that caused worker oversubscription.
//   - duplicate/unique counts are two index-backed GROUP BYs (idx_user_email_lower
//     GroupAggregate, idx_user_msisdn parallel index scan) — verified via EXPLAIN.
// Callers run the main scan first, then the two dup queries together; never all
// at once (concurrency > core count contends rather than parallelizes here).

import { reportPool } from '../db.js';

const EMAIL_RE = String.raw`^[^@\s]+@[^@\s]+\.[^@\s]+$`;
const PHONE_BAD = String.raw`[^0-9]`;
const HOBBIES_SPECIAL = String.raw`[^a-zA-Z0-9\s,.\-]`;
const HOBBIES_EMOJI = `('[' || (U&'\\+01F300') || '-' || (U&'\\+01FAFF') || (U&'\\2600') || '-' || (U&'\\27BF') || ']')`;

// Single pass: scalar counts + per-status counts + capped example arrays.
// array_agg(...)[:5] collects then slices; example fields are small/truncated so
// the aggregate state stays bounded well under work_mem.
const MAIN_STATS_SQL = `
  SELECT
    count(*)::bigint AS total,

    count(*) FILTER (WHERE user_email IS NULL OR user_email = '')::bigint AS email_missing,
    count(*) FILTER (WHERE user_email IS NOT NULL AND user_email <> '' AND user_email !~ '${EMAIL_RE}')::bigint AS email_invalid,
    (array_agg(user_email) FILTER (WHERE user_email IS NOT NULL AND user_email <> '' AND user_email !~ '${EMAIL_RE}'))[1:5] AS email_invalid_ex,

    count(*) FILTER (WHERE msisdn IS NULL OR msisdn = '')::bigint AS phone_missing,
    count(*) FILTER (WHERE msisdn IS NOT NULL AND msisdn <> '' AND (msisdn ~ '${PHONE_BAD}' OR length(msisdn) < 8 OR length(msisdn) > 15))::bigint AS phone_malformed,
    (array_agg(msisdn) FILTER (WHERE msisdn IS NOT NULL AND msisdn <> '' AND (msisdn ~ '${PHONE_BAD}' OR length(msisdn) < 8 OR length(msisdn) > 15)))[1:5] AS phone_malformed_ex,

    count(*) FILTER (WHERE birth_date IS NULL)::bigint AS birth_missing,
    count(*) FILTER (WHERE birth_date IS NOT NULL AND extract(year FROM birth_date) < 1900)::bigint AS birth_impossible,
    (array_agg(to_char(birth_date, 'YYYY-MM-DD')) FILTER (WHERE birth_date IS NOT NULL AND extract(year FROM birth_date) < 1900))[1:5] AS birth_impossible_ex,
    count(*) FILTER (WHERE birth_date IS NOT NULL AND birth_date > CURRENT_DATE)::bigint AS birth_future,
    (array_agg(to_char(birth_date, 'YYYY-MM-DD')) FILTER (WHERE birth_date IS NOT NULL AND birth_date > CURRENT_DATE))[1:5] AS birth_future_ex,

    count(*) FILTER (WHERE hobbies IS NULL)::bigint AS hobbies_null,
    count(*) FILTER (WHERE hobbies IS NOT NULL AND hobbies ~ '${HOBBIES_SPECIAL}')::bigint AS hobbies_special,
    (array_agg(left(hobbies, 80)) FILTER (WHERE hobbies IS NOT NULL AND hobbies ~ '${HOBBIES_SPECIAL}'))[1:5] AS hobbies_special_ex,
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
  for (const [key, val] of [['-2', r.s_n2], ['-1', r.s_n1], ['0', r.s_0], ['1', r.s_1], ['2', r.s_2], ['3', r.s_3], ['null', r.s_null], ['other', r.s_other]]) {
    if (Number(val) > 0) distribution[key] = Number(val);
  }
  r.status_distribution = distribution;
  return r;
}

// Distinct + duplicate counts via the partial indexes (GroupAggregate). extra_rows
// = redundant rows beyond the first per value; dup_groups = number of duplicated values.
const DUP_SQL = (expr, notNull) => `
  WITH g AS (
    SELECT ${expr} AS v, count(*) AS c
    FROM ws_user
    WHERE ${notNull} AND ${expr} <> ''
    GROUP BY ${expr}
  )
  SELECT
    count(*)::bigint AS distinct_count,
    count(*) FILTER (WHERE c > 1)::bigint AS dup_groups,
    (coalesce(sum(c) FILTER (WHERE c > 1), 0) - coalesce(count(*) FILTER (WHERE c > 1), 0))::bigint AS extra_rows
  FROM g
`;

const EMAIL_DUP_SQL = DUP_SQL('lower(user_email)', 'user_email IS NOT NULL');
const PHONE_DUP_SQL = DUP_SQL('msisdn', 'msisdn IS NOT NULL');

export async function getEmailDupStats() {
  const { rows } = await reportPool.query(EMAIL_DUP_SQL);
  return rows[0];
}

export async function getPhoneDupStats() {
  const { rows } = await reportPool.query(PHONE_DUP_SQL);
  return rows[0];
}
