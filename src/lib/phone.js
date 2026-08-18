// src/lib/phone.js

// Live-data finding: msisdn is stored in mixed formats — dominant 62-prefixed
// with no plus (10.3M rows, e.g. '6282335110566'), 0-prefixed (1.6M rows,
// '082335110566'), plus some with literal '+', dashes, or spaces. A plain
// `msisdn = $1` misses most real matches. We normalize the query input down to
// its "core" national-significant digits, then build both canonical stored
// forms and match with `msisdn IN ($1,$2)` — confirmed hitting idx_user_msisdn
// via Index Scan at ~0.13ms on the live 15M-row table.
export function phoneVariants(raw) {
  if (!raw) return [];
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return [];

  let core;
  if (digits.startsWith('62')) {
    core = digits.slice(2);
  } else if (digits.startsWith('0')) {
    core = digits.slice(1);
  } else {
    core = digits;
  }
  if (!core) return [];

  return [`62${core}`, `0${core}`];
}

// Canonical "core" digits for duplicate-detection matching (Round 4 spec:
// "exact phone match, normalized: strip +,-,space"). We go further than a
// literal strip and also fold the 62/0 country-code prefix, since that's the
// dominant real-world formatting difference in this dataset — two records
// storing the same number as '62812...' and '0812...' should be treated as
// the same phone for duplicate purposes, not as a punctuation mismatch.
export function canonicalPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('62')) return digits.slice(2);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
}
