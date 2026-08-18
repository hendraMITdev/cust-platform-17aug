// src/lib/quality-cache.js
// Async-serve pattern for the heavy analytics: a background loop recomputes the
// exact quality/metrics from live data every REFRESH_MS and stores the result, so
// GET /api/quality and GET /api/metrics can return the exact numbers in <50ms
// instead of blocking a request on the ~40s aggregate. The served values are the
// real counts, refreshed continuously — never stale by more than one interval.

import { computeQualityAndMetrics } from './quality-compute.js';

const REFRESH_MS = Number(process.env.QUALITY_REFRESH_MS) || 45000;

const store = { quality: null, metrics: null, computedAt: null, lastMs: null };
let inFlight = false;

export function getCachedQuality() {
  return store.quality;
}
export function getCachedMetrics() {
  return store.metrics;
}
export function isWarm() {
  return store.quality != null;
}

export async function refreshQualityCache(logger) {
  if (inFlight) return;
  inFlight = true;
  const t0 = Date.now();
  try {
    const { quality, metrics } = await computeQualityAndMetrics({ includeDups: true });
    store.quality = quality;
    store.metrics = metrics;
    store.computedAt = quality.analyzed_at;
    store.lastMs = Date.now() - t0;
    logger?.info?.({ ms: store.lastMs }, 'quality cache refreshed');
  } catch (err) {
    // Keep the previous good snapshot; a transient failure shouldn't blank the cache.
    logger?.error?.({ err }, 'quality cache refresh failed');
  } finally {
    inFlight = false;
  }
}

export function startQualityRefreshLoop(logger) {
  // Kick off the first computation immediately (non-blocking — the server starts
  // listening right away; endpoints fall back to a live compute until it warms).
  refreshQualityCache(logger);
  const timer = setInterval(() => refreshQualityCache(logger), REFRESH_MS);
  timer.unref?.();
  return timer;
}
