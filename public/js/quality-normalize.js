// public/js/quality-normalize.js
// /api/quality returns a different shape per field (email/phone share one shape,
// birth_date and hobbies each have their own). This normalizes all four into a
// common { title, total, present, presentPct, missing, missingPct, facts[] } shape
// so both the Overview charts and the Data Quality cards can render generically.

import { formatNumber } from './dom.js';

const FIELD_ORDER = ['email', 'phone', 'birth_date', 'hobbies'];
const FIELD_TITLES = {
  email: 'Email',
  phone: 'Phone',
  birth_date: 'Birth date',
  hobbies: 'Hobbies',
};

function safePct(missing, total, given) {
  if (given != null && !Number.isNaN(Number(given))) return Number(given);
  if (!total) return 0;
  return (missing / total) * 100;
}

export function normalizeMetric(name, metric) {
  if (!metric) return null;
  const total = metric.total ?? 0;

  if (name === 'hobbies') {
    const missing = metric.null_count ?? 0;
    const missingPct = safePct(missing, total, metric.null_percent);
    return {
      key: name,
      title: FIELD_TITLES[name],
      total,
      missing,
      missingPct,
      present: total - missing,
      presentPct: 100 - missingPct,
      facts: [
        ['With special characters', formatNumber(metric.with_special_chars)],
        ['With emoji', formatNumber(metric.with_emoji)],
      ],
    };
  }

  if (name === 'birth_date') {
    const missing = metric.missing_count ?? 0;
    const missingPct = safePct(missing, total, metric.missing_percent);
    return {
      key: name,
      title: FIELD_TITLES[name],
      total,
      missing,
      missingPct,
      present: total - missing,
      presentPct: 100 - missingPct,
      facts: [
        ['Invalid', formatNumber(metric.invalid_dates)],
        ['Impossible', formatNumber(metric.impossible_dates)],
        ['Future-dated', formatNumber(metric.future_dates)],
      ],
    };
  }

  // email / phone share a shape
  const missing = metric.missing_count ?? 0;
  const missingPct = safePct(missing, total, metric.missing_percent);
  const facts = [
    ['Unique', formatNumber(metric.unique)],
    ['Duplicates', formatNumber(metric.duplicate_count)],
  ];
  if (name === 'email') facts.push(['Invalid format', formatNumber(metric.invalid_format)]);
  if (name === 'phone') facts.push(['Malformed', formatNumber(metric.malformed)]);

  return {
    key: name,
    title: FIELD_TITLES[name],
    total,
    missing,
    missingPct,
    present: metric.present ?? (total - missing),
    presentPct: 100 - missingPct,
    facts,
  };
}

export function normalizeAllMetrics(qualityMetrics) {
  const qm = qualityMetrics || {};
  return FIELD_ORDER
    .map((key) => normalizeMetric(key, qm[key]))
    .filter(Boolean);
}

export { FIELD_ORDER };
