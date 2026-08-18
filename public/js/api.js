// public/js/api.js
// Thin fetch layer against the same-origin API. Every call is timeout-guarded and
// normalizes failures into ApiError so panels can render one consistent error state.

const DEFAULT_TIMEOUT_MS = 8000;

export class ApiError extends Error {
  constructor(message, { status = 0, kind = 'network' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind; // 'network' | 'http' | 'timeout' | 'parse'
  }
}

async function apiFetch(path, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${location.origin}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      throw new ApiError('The request took too long to respond.', { kind: 'timeout' });
    }
    throw new ApiError('Could not reach the server. Check your connection.', { kind: 'network' });
  }
  clearTimeout(timer);

  let body = null;
  try {
    body = await response.json();
  } catch {
    // handled below via response.ok / body null checks
  }

  if (!response.ok) {
    const message = (body && (body.error || body.message)) || `Request failed (${response.status}).`;
    throw new ApiError(message, { status: response.status, kind: 'http' });
  }
  if (body == null) {
    throw new ApiError('The server returned an unreadable response.', { kind: 'parse' });
  }
  return body;
}

export function fetchHealth() {
  return apiFetch('/api/health', { timeoutMs: 5000 });
}

export function fetchSearch({ q, type, limit, offset }) {
  const params = new URLSearchParams({
    q: q ?? '',
    type: type ?? 'name',
    limit: String(limit ?? 10),
    offset: String(offset ?? 0),
  });
  return apiFetch(`/api/search?${params.toString()}`, { timeoutMs: 10000 });
}

// /api/quality computes exact distinct/duplicate counts live over 15M rows —
// ~43s warm, more when the cache is cold. Timeout is generous so the dashboard
// waits for the honest number instead of falsely reporting a hang.
export function fetchQuality() {
  return apiFetch('/api/quality', { timeoutMs: 90000 });
}

// Fast base pass (~8s): every quality signal EXCEPT the two slow distinct/duplicate
// counts, which come back null. Panels render this first, then patch in the exact
// dup counts from a full fetchQuality() — same data, still live, just not blocking.
export function fetchQualityBase() {
  return apiFetch('/api/quality?dups=0', { timeoutMs: 25000 });
}

export function fetchDuplicates(userId, { threshold = 0.7, limit = 10 } = {}) {
  const params = new URLSearchParams({ threshold: String(threshold), limit: String(limit) });
  return apiFetch(`/api/duplicates/${encodeURIComponent(userId)}?${params.toString()}`, { timeoutMs: 10000 });
}

// order_history / activity_pattern methods run against the report pool and can
// take 20-25s on the live dataset (see src/routes/duplicates.js) — timeout is
// generous on purpose so a slow-but-honest response isn't mistaken for a hang.
export function fetchDuplicateGroups({ method, limit = 50 } = {}) {
  const params = new URLSearchParams({ method: method ?? 'ip_address', limit: String(limit) });
  return apiFetch(`/api/duplicates/find?${params.toString()}`, { timeoutMs: 90000 });
}

export function fetchUserProfile(userId) {
  return apiFetch(`/api/user-profile/${encodeURIComponent(userId)}`, { timeoutMs: 8000 });
}
