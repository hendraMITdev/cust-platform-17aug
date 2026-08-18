# Test Results & Benchmarks

Living record of endpoint verification, load-test runs, tuning changes, and score estimate.
Status: `⏳ pending` · `✅ pass` · `❌ fail` · `⚠️ partial`

**Environment:** VPS `lombacoding-03` — 4 vCPU · 8 GB RAM · Ubuntu 24.04 · Docker · PostgreSQL 17.
**Stack:** Node 20 · Fastify 5 · `pg` pool (min 10 / max 40, `statement_timeout=4500ms`).
**Deployed URL:** `http://168.144.241.41:3000` · **Dataset:** 14,999,896 users + 3M orders + 2.4M txns + 2M activity.
**Deadline:** 14:00 WIB.

---

## 1. Endpoint verification matrix

| # | Round | Endpoint | Method | Expected (shape / key values) | Status | Latency | Notes |
|---|-------|----------|--------|-------------------------------|:------:|--------:|-------|
| 1 | R1 | `/health` | GET | `status:"ready"`, `total_records:15000000`, `database:"connected"`, ISO `timestamp` | ⏳ | | <500ms |
| 2 | R5 | `/api/health` | GET | `ok:true`, `status:"running"`, `total_records`, `database`, `timestamp` | ⏳ | | WAJIB |
| 3 | R2 | `/api/search?q&type=email` | GET | exact; `results[]`, `total`, `took_ms`; phone masked | ⏳ | | <100ms |
| 4 | R2 | `/api/search?q&type=phone` | GET | exact (62/0 normalized); masked msisdn | ⏳ | | <100ms |
| 5 | R2 | `/api/search?q&type=user_id` | GET | exact single / empty | ⏳ | | <50ms |
| 6 | R2 | `/api/search?q&type=name` | GET | fuzzy (full_name), ordered by similarity | ⏳ | | <300ms |
| 7 | R2 | search pagination + masking | GET | `limit`/`offset` honored; no raw phones; no dupes | ⏳ | | |
| 8 | R2 | search edge cases | GET | empty q → `[]`; SQL-inj string safe; emoji/accents | ⏳ | | |
| 9 | R3 | `/api/metrics` | GET | `duplicates`, `missing_fields`, `quality_score` (live) | ⏳ | | WAJIB |
| 10 | R3 | `/api/quality` | GET | full `quality_metrics{email,phone,birth_date,hobbies,status}` + `data_issues[]` | ⏳ | | live, uncached |
| 11 | R4 | `/api/duplicates` | POST | `duplicates:[{id1,id2,similarity}]`, `count` | ⏳ | | WAJIB |
| 12 | R4 | `/api/duplicates/:id` | GET | `possible_duplicates[]` w/ `similarity_score`, `match_reasons`, `confidence` | ⏳ | | <2s |
| 13 | R4 | `/api/duplicates/find?method=ip_address` | GET | `duplicate_groups[]` w/ `shared_attribute`, `user_count`, `user_ids`, `confidence:"high"` | ⏳ | | +order_history,+activity_pattern |
| 14 | R5 | `/api/user-profile/:id` | GET | profile + `order_count` + `transaction_total` + `activity_count` + `last_activity` (4-table JOIN) | ⏳ | | load-test target, <50ms |
| 15 | — | `/` (dashboard UI) | GET | loads; search/quality/duplicates panels work | ⏳ | | UI WAJIB |

### Accuracy spot-checks (endpoint output vs direct SQL)
| Metric | Direct SQL value | API value | Match |
|--------|------------------|-----------|:-----:|
| ws_user count | 14,999,896 | | ⏳ |
| dup emails (ci) groups | 11,605 | | ⏳ |
| birth_date NULL | 7,984,842 | | ⏳ |
| status=1 count | 13,597,726 | | ⏳ |
| a sample user-profile order_count/txn_total | (compute) | | ⏳ |

---

## 2. Load-test runs (R5 — `/api/user-profile/:id`, 100 conc, 60s, 5s timeout)

Command: `wrk -t12 -c100 -d60s --latency --script load_profile.lua http://<host>:3000`

| Run | Origin | Total req | RPS | Success % | Avg | P50 | P90 | P99 | Max | Timeouts/5xx | Verdict |
|-----|--------|----------:|----:|----------:|----:|----:|----:|----:|----:|-------------:|---------|
| — | — | — | — | — | — | — | — | — | — | — | ⏳ not run |

Targets: success **>95%** · avg **<1000ms** · p99 **<2000ms** · zero 5xx/timeout.
Bonuses: avg **<500ms** (+50) · p99 **<1000ms** (+50) · **100%** success (+50).

### Secondary: search mix under load (R2 stability — `load_search.lua`, 40/30/20/10)
| Run | Total req | RPS | Success % | Avg | P99 | Errors | Verdict |
|-----|----------:|----:|----------:|----:|----:|-------:|---------|
| — | — | — | — | — | — | — | ⏳ not run |

---

## 3. Single-query latency (from `EXPLAIN ANALYZE`, indexed, measured)

| Query | Plan | Time | Target | Status |
|-------|------|-----:|-------:|:------:|
| email exact | Bitmap Heap → idx_user_email_lower | 0.24 ms | <100ms | ✅ |
| phone exact (IN 2) | Index Scan → idx_user_msisdn | 0.13 ms | <100ms | ✅ |
| user_id | Index Scan → PK | 0.70 ms | <50ms | ✅ |
| name fuzzy | Bitmap Heap → idx_user_name_trgm | 89.7 ms | <300ms | ✅ |
| user-profile JOIN | (measure post-deploy) | ⏳ | <50ms | ⏳ |
| duplicates/find ip | GROUP BY idx_activity_ip | ⏳ | <2s | ⏳ |

---

## 4. Tuning changelog (what changed between runs → effect)

| # | Change | Reason | Effect on metrics |
|---|--------|--------|-------------------|
| 0 | Baseline: pool max 40, statement_timeout 4500ms, PG shared_buffers 2GB | initial | (pending run 1) |

---

## 5. Score estimate (max 2,150)

| Round | Max | Est. earned | Basis |
|-------|----:|------------:|-------|
| R1 Import + health | 200 (+100 first-5) | ⏳ | import ✅; health pending |
| R2 Search | 600 | ⏳ | indexes ✅; endpoint + UI pending |
| R3 Data Quality | 250 | ⏳ | |
| R4 Duplicates | 300 | ⏳ | |
| R5 Load Test | 600 | ⏳ | |
| Bonus | 200 | ⏳ | |
| **TOTAL** | **2,150** | **⏳** | |

---

## How to reproduce
```bash
# on the VPS (files in scratchpad copied over):
apt-get install -y wrk          # or build from source
wrk -t12 -c100 -d60s --latency --script load_profile.lua http://localhost:3000   # R5
wrk -t8  -c100 -d30s --latency --script load_search.lua  http://localhost:3000   # R2 mix
# value files: profile_ids.txt, emails.txt, phones.txt, names.txt (300/200/200/200 real values)
```
