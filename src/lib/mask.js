// src/lib/mask.js

// Mask an msisdn as first4****last4 (e.g. "6281312577750" -> "6281****7750").
// Real data has wildly inconsistent lengths (1-20 chars, some with dashes/+),
// so short values fall back to a conservative partial mask instead of risking
// overlap or exposing the whole number.
export function maskMsisdn(msisdn) {
  if (msisdn === null || msisdn === undefined || msisdn === '') return null;
  const s = String(msisdn);
  if (s.length <= 8) {
    if (s.length <= 2) return '*'.repeat(s.length);
    return s.slice(0, 2) + '*'.repeat(s.length - 2);
  }
  return s.slice(0, 4) + '****' + s.slice(-4);
}
