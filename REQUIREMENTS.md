# 17 Agustus Challenge — Requirements Tracker

**Deadline: 14:00 Jakarta (hard cutoff). Submit:** http://143.198.201.56:4000 — nama + token `Y4AJ9PNT` + GitHub URL + deployed URL.
**Deployed URL target:** `http://168.144.241.41:3000`
**Max score:** 1,950 base + 200 bonus = **2,150**

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` risk/attention

---

## 0. Global rules & submission (gate — lose everything if missed)
- [ ] GitHub repo **public** (account: hendraMITdev)
- [ ] Single `docker-compose.yml` at repo root
- [ ] `README.md` with setup instructions
- [ ] `DATABASE_NOTES.md` (schema changes, indexes, optimizations, design decisions)
- [ ] Source code committed (`src/`, `public/`, `.gitignore`)
- [ ] `docker-compose up` → `curl http://localhost:3000/api/health` returns 200 + JSON (grader reproduces locally)
- [ ] Dataset stays in **PostgreSQL** (✓ Postgres 17)
- [ ] **No pre-computed results** — all calculations live (caching OK for search per spec; metrics/quality NOT cached)
- [ ] No external API calls (docs/learning only)
- [ ] **UI/Frontend WAJIB** — dashboard, not CLI-only
- [ ] Understand the code (AI allowed)
- [ ] Submit before 14:00 (early = more time bonus; tiebreaker = earlier submission)

## WAJIB grader endpoints (exact path/method/params — auto-tested)
- [ ] `GET /api/search?q=&type=&limit=&offset=` → 200
- [ ] `GET /api/metrics` → 200
- [ ] `POST /api/duplicates` → 200
- [ ] `GET /api/health` → 200
- [ ] (aliases also served: `/health`, `/api/quality`, `GET /api/duplicates/:id`)

---

## Round 1 — Import (200 pts + 100 bonus first-5)
- [x] Database imported — all 4 tables (ws_user 14,999,896 · ws_orders 2,999,986 · ws_transactions 2,400,548 · ws_user_activity 2,000,000) — **100**
- [ ] `GET /health` returns valid JSON, ALL fields — **75**
  - [ ] `status` == "ready" (exact)
  - [ ] `total_records` == 15000000 (exact int — spec-literal; real 14,999,896 reported in /api/quality)
  - [ ] `database` == "connected" (exact)
  - [ ] `timestamp` valid ISO 8601
- [ ] `total_records` correct — **25**
- [ ] HTTP 200 · Content-Type application/json · response < 500ms
- [ ] +100 bonus if first 5 teams to complete

## Round 2 — Search Engine (600 pts) ⭐ biggest correctness+perf round
**Response (EXACT):** `{query,type,limit,offset,results:[{user_id,full_name,user_email,msisdn,status,created_at}],total,took_ms}`
### Correctness — 300
- [ ] email search: exact match only, accurate — 75
- [ ] phone search: exact match only, accurate — 75
- [ ] name search: fuzzy/partial (substring/Levenshtein) — 75
- [ ] pagination (limit/offset) + **msisdn masking** (no raw phones) — 75
- [ ] user_id: exact single match or empty · no duplicate results
### Performance — 200 (p50)
- [ ] email / phone / user_id < 100ms — 100
- [ ] name < 300ms — 100
- [ ] p99 name < 500ms · handles 100+ concurrent without degradation
### UI/UX — 100
- [ ] professional UI — 40
- [ ] responsive/mobile — 30
- [ ] error handling (no results, malformed input) — 30
- [ ] search box + type dropdown · results table (paginated, sortable) · live response-time display · loading state · no console.log
### Edge cases
- [ ] empty query string · [ ] SQL injection attempts in `q` (parameterized) · [ ] large result sets (pagination) · [ ] special chars/emoji/accents in names · [ ] NULL email/phone · [ ] duplicate emails/phones (return all)

## Round 3 — Data Quality Dashboard (250 pts)
**`GET /api/quality`** (live, NOT cached) — exact shape: `total_records, analyzed_at, quality_metrics{email,phone,birth_date,hobbies,status}, data_issues[]`
### Accuracy — 150
- [ ] email metrics (present/missing/%/unique/duplicate/invalid_format) — 30
- [ ] phone metrics (present/missing/%/unique/duplicate/malformed) — 30
- [ ] birth_date metrics (present/missing/%/invalid/impossible/future) — 30
- [ ] hobbies + status metrics (null%, special/emoji; distribution -1/0/1) — 30
- [ ] percentages correct (missing/total*100) — 30
### Issue detection — 50
- [ ] identifies 3+ issue types (invalid email @@/no-@, malformed phone, impossible dates 9999/0001/future) — 25
- [ ] severity categorization low/medium/high — 25
### UI/UX — 50
- [ ] dashboard cards layout — 20
- [ ] visualizations (gauges/progress bars/charts) — 20
- [ ] responsive — 10
- [ ] `GET /api/metrics` (WAJIB) → `{duplicates,missing_fields,quality_score}`
**Reference:** total 14,999,896 · email missing ~8% · phone missing ~40% · birthdate invalid ~28K · hobbies null ~10% · email dup ~299K · phone dup ~499K

## Round 4 — Duplicate Detection (300 pts)
**`GET /api/duplicates/:id?threshold=0.7&limit=10`** exact shape: `{user_id,user_email,user_phone,full_name,possible_duplicates:[{user_id,user_email,user_phone,full_name,similarity_score,match_reasons[],confidence}],total_possible_duplicates}`
**`POST /api/duplicates`** (WAJIB) → `{duplicates:[{id1,id2,similarity}],count}`
### Accuracy — 150
- [ ] exact email match (case-insensitive) — 50
- [ ] exact phone match (normalized: strip +,-,space) — 50
- [ ] name similarity (Levenshtein/Jaro-Winkler / trigram) — 50
### Recall — 75  (>80% of actual duplicates found)
### Precision — 75  (>90%, few false positives)
- [ ] composite score = email*0.4 + phone*0.4 + name_sim*0.2
- [ ] confidence: high ≥0.9 · medium 0.7–0.9 · low <0.7
- [ ] only status=1 accounts · ordered by score desc · < 2s · efficient (no full scan)

## Round 5 — Concurrent Load Test (600 pts) ⭐ FINAL BOSS
Mix: 40% email · 30% phone · 20% name · 10% duplicates. 100 concurrent, 60s, **5s hard timeout/req**.
- [ ] correct responses > 95% success — 300
- [ ] avg response time < 1000ms — 150
- [ ] p99 latency < 2000ms — 100
- [ ] zero crashes / 500s — 50
- [ ] all endpoints respond under load (/health, /api/search, /api/quality, /api/duplicates/:id)
- [ ] accuracy maintained under load
- [ ] connection pooling (no exhaustion) · gzip · pagination cap 100
- [ ] each 1% success drop = -1pt · p99 > 5s = 0 for that metric

## Bonus (+200 max)
- [ ] fast email search < 50ms avg — +50
- [ ] fast name search < 100ms avg — +50
- [ ] perfect load test 100% success — +50
- [ ] code quality (documented, clean) — +50

---

## Judge criteria (human)
Correctness · Performance · Scalability (15M gracefully) · Code Quality (readable, maintainable) · UI/UX
