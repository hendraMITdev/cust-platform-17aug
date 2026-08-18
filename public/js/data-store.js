// public/js/data-store.js
// Shared, lazily-fetched cache for /api/quality and /api/health so the stat grid,
// the Overview charts, and the Data Quality panel all read the same live snapshot
// instead of triggering their own redundant fetches. /api/quality is explicitly
// NOT cached server-side and can take a few seconds, so we fetch it once and only
// re-fetch when the user asks (via loadQuality({ force: true })).

import { fetchQuality, fetchHealth, ApiError } from './api.js';

const listeners = new Set();

let state = {
  quality: null,
  qualityError: null,
  qualityLoading: false,
  qualityComputeMs: null,
  health: null,
  healthChecked: false,
};

function emit() {
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

export async function loadQuality({ force = false } = {}) {
  if (state.qualityLoading) return;
  if (state.quality && !force) return;

  state = { ...state, qualityLoading: true, qualityError: null };
  emit();

  const startedAt = performance.now();
  try {
    const quality = await fetchQuality();
    state = {
      ...state,
      quality,
      qualityLoading: false,
      qualityComputeMs: Math.round(performance.now() - startedAt),
    };
  } catch (err) {
    state = {
      ...state,
      qualityLoading: false,
      qualityError: err instanceof ApiError ? err.message : 'Could not load data quality metrics.',
    };
  }
  emit();
}

export async function loadHealth() {
  try {
    const health = await fetchHealth();
    state = { ...state, health, healthChecked: true };
  } catch {
    state = { ...state, health: null, healthChecked: true };
  }
  emit();
}
