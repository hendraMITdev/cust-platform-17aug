# Database Notes — Schema, Indexes, Optimizations

PostgreSQL 17 (Docker), dataset `challenge_db_anonymized_v2` (pg_dump from PG 14, COPY format). All figures below are **measured on the live 15M-row database**, not estimates.

## 1. Dataset

| Table | Rows | Notes |
|-------|-----:|-------|
| `ws_user` | 14,999,896 | primary entity; ~40 columns |
| `ws_orders` | 2,999,986 | FK `user_id` → ws_user |
| `ws_transactions` | 2,400,548 | FK `order_id` → ws_orders |
| `ws_user_activity` | 2,000,000 | FK `user_id` → ws_user |
| `ws_user_preferences` | 0 | present in dump, empty |

The dump ships **only primary keys — no secondary indexes** (by design). All performance below comes from the index + query strategy we added.

## 2. Real data characteristics (this shaped every query)

Profiling the actual data revealed traps that a naïve implementation gets wrong:

- **`msisdn` (phone) is mixed-format.** Of 13,969,241 non-null values: `62`-prefixed with no `+` dominates (10.34M, e.g. `6282335110566`), `0`-prefixed (1.62M, e.g. `082335110566`), plus stragglers with literal `+`, dashes, or spaces. **1,917,240 rows are the empty string `''`, not NULL** — they pass `IS NOT NULL` filters silently.
- **`user_name` is 100% NULL**; human names live entirely in **`full_name`** (100% populated). Name search therefore targets `full_name` (the concatenated index still works — the `user_name` half is a harmless no-op).
- **`status` has more than the documented `{-1,0,1}`:** `-2:178 · -1:1,348,853 · 0:225 · 1:13,597,726 · 2:52,843 · 3:71`. Quality reporting computes the distribution dynamically.
- **`birth_date` is dirty:** 53.2% NULL (7,984,842), 1,019,932 impossible (`year < 1900`, incl. `0001-06-08 BC`), 220 future dates, max `9944-03-09`.
- **`user_email`:** ~2.4% mixed-case (360,125) → case-insensitive matching required; a handful contain phone numbers instead of emails (flagged as `invalid_format`).
- **`create_time`:** clean (9 NULLs) → used directly as `created_at`.

## 3. Index strategy

| Index | Definition | Type | Size | Build |
|-------|-----------|------|-----:|------:|
| `idx_user_name_trgm` | `gin ((coalesce(user_name,'')||' '||coalesce(full_name,'')) gin_trgm_ops)` | GIN trigram | 436 MB | 121.7s |
| `idx_user_email_lower` | `(lower(user_email)) WHERE user_email IS NOT NULL` | btree, partial | 590 MB | 59.2s |
| `idx_user_msisdn` | `(msisdn) WHERE msisdn IS NOT NULL` | btree, partial | 365 MB | 48.4s |
| `idx_orders_user` | `ws_orders (user_id)` | btree | 64 MB | 2.2s |
| `idx_txn_order` | `ws_transactions (order_id)` | btree | 51 MB | 1.2s |
| `idx_activity_user` | `ws_user_activity (user_id)` | btree | 43 MB | 1.4s |

Rationale:
- **Trigram GIN** is the make-or-break index: it lets `full_name ILIKE '%term%'` (substring/fuzzy) use an index instead of a 15M-row sequential scan.
- **Partial btrees** on email/phone skip the large null/absent population, keeping the indexes smaller and lookups exact + fast.
- **FK btrees** back the users→orders→transactions joins and duplicate lookups.
- Built with `maintenance_work_mem=1.5GB` and `max_parallel_maintenance_workers=3`; PK lookups use the dump's existing `ws_user_pk`.

## 4. Query strategy (per endpoint)

- **Phone (exact):** normalize the input to digits, strip a leading `+`, then build **both** a `62`- and a `0`-prefixed candidate and query `WHERE msisdn IN ($1,$2)`. Handles the dominant `62…` and legacy `0…` formats with one index scan.
- **Name (fuzzy):** `WHERE (coalesce(user_name,'')||' '||coalesce(full_name,'')) ILIKE '%'||$q||'%' ORDER BY similarity(concat, $q) DESC LIMIT/OFFSET`.
  **Optimization insight:** switching the filter to the `%` similarity operator with a lowered `pg_trgm.similarity_threshold` is **28× slower** (2492ms vs 90ms) — it matches ~464k candidate rows before the LIMIT trims them. We keep `ILIKE` for GIN-accelerated substring filtering and use `similarity()` only for *ranking*.
- **Email (exact):** `WHERE lower(user_email) = lower($1)`.
- **user_id:** primary-key lookup.
- **Quality/metrics:** computed **live** (spec forbids pre-computed results and requires real-time calculation) using `FILTER` aggregates to minimize table passes. Missing-phone counts treat `''` as missing (`msisdn IS NULL OR msisdn = ''`).
- **Duplicates:** candidate set from exact `lower(email)` match, exact normalized `msisdn` match, or trigram-similar `full_name` — never a full scan. Composite score `email*0.4 + phone*0.4 + name_similarity*0.2`, `status=1` only.

## 5. Postgres tuning

**Import phase** (fast bulk load): `fsync=off`, `synchronous_commit=off`, `full_page_writes=off`, `autovacuum=off`, large `maintenance_work_mem`/`max_wal_size`. Result: 22.4M rows imported in **141s**.

**Serving phase** (`docker-compose.yml`, durable): `shared_buffers=2GB`, `effective_cache_size=5GB`, `work_mem=32MB`, `random_page_cost=1.1`, `effective_io_concurrency=200`, `max_parallel_workers_per_gather=2`, `jit=off`, `synchronous_commit=off`. Fits comfortably in the box's 8GB with headroom for the page cache.

App layer: `pg` pool (min 10 / max 40) with `statement_timeout=4500ms` (fails just under the load test's 5s hard cutoff rather than hanging); gzip; thin handlers with all computation pushed into SQL; short-TTL in-memory cache for **search** only (metrics/quality stay live).

## 6. Measured latency (indexed, single query)

| Query | Plan | Time |
|-------|------|-----:|
| email exact | Bitmap Heap → `idx_user_email_lower` | 0.24 ms |
| phone exact (`IN` 2 candidates) | Index Scan → `idx_user_msisdn` | 0.13 ms |
| user_id | Index Scan → `ws_user_pk` | 0.70 ms |
| name fuzzy (ILIKE + similarity order) | Bitmap Heap → `idx_user_name_trgm` | 89.7 ms |

All four required search types hit an index — zero sequential scans. Targets (email/phone/user_id < 100ms, name < 300ms) are met with large margins.

## 7. Design decisions worth calling out

- **`/health` returns `total_records: 15000000`** (the spec's exact required constant); the analytics endpoints (`/api/quality`, `/api/metrics`) report the **true live count** (14,999,896). Documented here so the discrepancy is intentional and transparent, not a bug.
- **Quality metrics reflect the real data**, which diverges from the spec's reference figures (e.g. birth_date is 53% NULL, not ~7%). We report what the database actually contains, computed live, per the "no pre-computed results" rule.
- **Phone numbers are masked** in search results (`0812****7890`).
