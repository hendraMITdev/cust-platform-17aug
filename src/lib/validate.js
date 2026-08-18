// src/lib/validate.js

export const SEARCH_TYPES = ['email', 'phone', 'user_id', 'name'];

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_OFFSET = 0;

// Clamp/parse limit & offset defensively — never trust query string input
// directly in a LIMIT/OFFSET clause even when parameterized, since a
// malformed or absurd value (negative, NaN, huge) should degrade gracefully
// rather than error or hammer the DB with an unbounded scan.
export function parseLimit(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export function parseOffset(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_OFFSET;
  return n;
}

export function isValidSearchType(type) {
  return SEARCH_TYPES.includes(type);
}

// user_id is a bigint PK — only digit strings are valid lookups. Anything else
// (SQL injection attempts, garbage, decimals) should just yield "no match"
// rather than a thrown cast error from `$1::bigint`.
export function isValidUserId(q) {
  return /^\d+$/.test(q) && q.length <= 19; // 19 digits covers int8 range
}
