// test/smoke.test.mjs
// End-to-end smoke tests against a RUNNING instance (no DB mocks — this is the
// real contract the grader checks). Point at any deployment:
//   BASE_URL=http://168.144.241.41:3000 npm test
// Defaults to localhost:3000. Uses Node's built-in test runner (no deps).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function req(path, opts) {
  const res = await fetch(BASE + path, opts);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

test('GET /health — R1 spec shape', async () => {
  const { status, body } = await req('/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ready');
  assert.equal(body.total_records, 15000000);
  assert.equal(body.database, 'connected');
  assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test('GET /api/health — WAJIB ok:true', async () => {
  const { status, body } = await req('/api/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status, 'running');
});

test('GET /api/search email — exact, masked phone, took_ms', async () => {
  const { status, body } = await req('/api/search?q=eko130374@gmail.com&type=email&limit=5');
  assert.equal(status, 200);
  assert.equal(body.type, 'email');
  assert.ok(Array.isArray(body.results));
  assert.equal(typeof body.total, 'number');
  assert.equal(typeof body.took_ms, 'number');
  if (body.results[0]) assert.match(String(body.results[0].msisdn), /\*/, 'phone must be masked');
});

test('GET /api/search phone / user_id / name — all 200 with results[]', async () => {
  for (const q of ['q=6282335110566&type=phone', 'q=43795603&type=user_id', 'q=eko&type=name']) {
    const { status, body } = await req('/api/search?' + q + '&limit=3');
    assert.equal(status, 200, q);
    assert.ok(Array.isArray(body.results), q);
  }
});

test('GET /api/search empty query — 200 empty', async () => {
  const { status, body } = await req('/api/search?q=&type=name');
  assert.equal(status, 200);
  assert.equal(body.results.length, 0);
});

test('GET /api/search — SQL-injection string is parameterized (no 500)', async () => {
  const { status } = await req("/api/search?q=%27%20OR%201%3D1--&type=name&limit=3");
  assert.equal(status, 200);
});

test('GET /api/user-profile/:id — 4-table join shape (R5 target)', async () => {
  const { status, body } = await req('/api/user-profile/43795603');
  assert.equal(status, 200);
  assert.equal(body.user_id, 43795603);
  assert.equal(typeof body.order_count, 'number');
  assert.equal(typeof body.transaction_total, 'number');
  assert.equal(typeof body.activity_count, 'number');
  assert.ok('last_activity' in body);
});

test('GET /api/duplicates/:id — possible_duplicates[]', async () => {
  const { status, body } = await req('/api/duplicates/43795603');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.possible_duplicates));
});

test('POST /api/duplicates — {duplicates[], count}', async () => {
  const { status, body } = await req('/api/duplicates', { method: 'POST' });
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.duplicates));
  assert.equal(typeof body.count, 'number');
});

test('GET /api/duplicates/find?method=ip_address — groups', async () => {
  const { status, body } = await req('/api/duplicates/find?method=ip_address&limit=5');
  assert.equal(status, 200);
  assert.equal(body.method, 'ip_address');
  assert.ok(Array.isArray(body.duplicate_groups));
});

test('GET /api/metrics — {duplicates, missing_fields, quality_score}', async () => {
  const { status, body } = await req('/api/metrics');
  assert.equal(status, 200);
  assert.equal(typeof body.duplicates, 'number');
  assert.equal(typeof body.missing_fields, 'number');
  assert.equal(typeof body.quality_score, 'number');
});

test('GET /api/quality — full breakdown + status distribution + issues', async () => {
  const { status, body } = await req('/api/quality');
  assert.equal(status, 200);
  assert.equal(body.total_records > 14000000, true);
  assert.ok(body.quality_metrics.email);
  assert.ok(body.quality_metrics.phone);
  assert.ok(body.quality_metrics.status.distribution);
  assert.ok(Array.isArray(body.data_issues));
});
