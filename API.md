# API Documentation — Customer Intelligence Platform

**Base URL:** `http://168.144.241.41:3000`
All responses are JSON. All queries are parameterized (SQL-injection safe). Phone numbers are masked in search results.

Quick check:
```bash
curl http://168.144.241.41:3000/api/health
```

---

## Health

### `GET /health`  ·  `GET /api/health`
Liveness + record count. Response < 500ms.
```bash
curl http://168.144.241.41:3000/health
```
```json
{ "status": "ready", "total_records": 15000000, "database": "connected", "timestamp": "2026-08-18T05:00:00.000Z" }
```
`/api/health` returns `{ "ok": true, "status": "running", "total_records": 15000000, "database": "connected", "timestamp": "..." }`.

---

## Round 2 — Search

### `GET /api/search?q=&type=&limit=&offset=`
`type` ∈ `email` | `phone` | `user_id` (exact) · `name` (fuzzy). `limit` default 10 (max 100), `offset` default 0.
```bash
curl "http://168.144.241.41:3000/api/search?q=eko130374@gmail.com&type=email&limit=5"
curl "http://168.144.241.41:3000/api/search?q=6282335110566&type=phone"
curl "http://168.144.241.41:3000/api/search?q=43795603&type=user_id"
curl "http://168.144.241.41:3000/api/search?q=budi&type=name&limit=10&offset=0"
```
```json
{
  "query": "budi", "type": "name", "limit": 10, "offset": 0,
  "results": [
    { "user_id": 65070641, "full_name": "Budi", "user_email": "...", "msisdn": "6285****2162", "status": 1, "created_at": "2019-05-12T00:21:00.000Z" }
  ],
  "total": 1000, "took_ms": 88
}
```
Notes: `msisdn` is masked. Email/phone/user_id are exact-match only (partial email like `@gmail` returns 0). Name is fuzzy (trigram substring, ranked by similarity).

---

## Round 3 — Data Quality (live, not cached)

### `GET /api/metrics`
Compact summary. ~34s (exact live counts over 15M rows).
```bash
curl http://168.144.241.41:3000/api/metrics
```
```json
{ "duplicates": 982381, "missing_fields": 8754782, "quality_score": 41.63 }
```

### `GET /api/quality`
Full breakdown. ~43s (exact live distinct/duplicate counts).
```bash
curl http://168.144.241.41:3000/api/quality
```
```json
{
  "total_records": 14999896, "analyzed_at": "2026-08-18T05:01:00.000Z",
  "quality_metrics": {
    "email": { "total": 14999896, "present": 14999896, "missing_count": 0, "missing_percent": 0, "unique": 14701522, "duplicate_count": 286769, "invalid_format": 2841254 },
    "phone": { "total": 14999896, "present": 12052001, "missing_count": 2947895, "missing_percent": 19.65, "unique": 10815687, "duplicate_count": 695612, "malformed": 150723 },
    "birth_date": { "total": 14999896, "present": 7015054, "missing_count": 7984842, "missing_percent": 53.23, "invalid_dates": 1020152, "impossible_dates": 1019932, "future_dates": 220 },
    "hobbies": { "total": 14999896, "null_count": 13237519, "null_percent": 88.25, "with_special_chars": 304240, "with_emoji": 299645 },
    "status": { "total": 14999896, "distribution": { "-2": 178, "-1": 1348853, "0": 225, "1": 13597726, "2": 52843, "3": 71 } }
  },
  "data_issues": [ { "field": "email", "issue_type": "invalid_format", "count": 2841254, "examples": ["..."], "severity": "medium" } ]
}
```

---

## Round 4 — Duplicate Detection

### `GET /api/duplicates/:user_id?threshold=0.7&limit=10`
Per-user candidates (exact email/phone + trigram name; composite score). < 2s.
```bash
curl "http://168.144.241.41:3000/api/duplicates/43795603?threshold=0.7&limit=10"
```
```json
{ "user_id": 43795603, "user_email": "...", "user_phone": "...", "full_name": "...",
  "possible_duplicates": [ { "user_id": 7654321, "similarity_score": 0.94, "match_reasons": ["phone_exact_match","name_similarity_0.92"], "confidence": "high" } ],
  "total_possible_duplicates": 2 }
```

### `POST /api/duplicates`
Batch sample of exact-email/exact-phone duplicate pairs. ~43s.
```bash
curl -X POST http://168.144.241.41:3000/api/duplicates
```
```json
{ "duplicates": [ { "id1": 89235000, "id2": 89235001, "similarity": 1.0 } ], "count": 982381 }
```

### `GET /api/duplicates/find?method=ip_address&limit=50`
Cluster accounts by a shared signal. `method` ∈ `ip_address` (high) · `order_history` (medium) · `activity_pattern` (low).
```bash
curl "http://168.144.241.41:3000/api/duplicates/find?method=ip_address&limit=50"
```
```json
{ "method": "ip_address",
  "duplicate_groups": [ { "group_id": 1, "shared_attribute": "192.168.206.236", "attribute_type": "ip_address", "user_count": 57, "user_ids": [311790, 577471], "user_names": ["User A","User B"], "first_activity": "2026-05-19T09:47:16Z", "last_activity": "2026-08-14T15:52:07Z", "confidence": "high" } ],
  "total_groups_found": 50, "total_duplicate_users": 2577 }
```

---

## Round 5 — Load-test target (4-table JOIN)

### `GET /api/user-profile/:user_id`
Profile + order count + transaction total + activity, from user + orders + transactions + activity. ~18ms.
```bash
curl http://168.144.241.41:3000/api/user-profile/26091048
```
```json
{ "user_id": 26091048, "full_name": "Rif Khy", "user_email": "...", "msisdn": "6285****8984", "status": 1,
  "order_count": 1, "transaction_total": 368.44, "activity_count": 0, "last_activity": null, "created_at": "2017-12-24T05:51:00.000Z" }
```

Load test result (100 concurrent, 60s, localhost): 100% success, avg 56.8ms, p99 274ms, 0 timeouts, 119,808 requests.

---

## UI
Dashboard served at `/` — Overview, Search, Data Quality, Duplicates (+ IP finder), User Profile. Hash-routed SPA (`#/overview`, `#/search`, `#/quality`, `#/duplicates`, `#/user-profile`).
