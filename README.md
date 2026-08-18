# Customer Intelligence Platform

High-performance search, data-quality, and duplicate-detection API over **22.4M PostgreSQL records** (15M users + 3M orders + 2.4M transactions + 2M activity logs), with a live dashboard UI. Built for the 17 Agustus Coding Challenge.

- **Stack:** Node 20 · Fastify 5 · PostgreSQL 17 · Docker Compose
- **Deployed:** `http://168.144.241.41:3000`
- **Design goal:** the dataset ships with *zero* secondary indexes — performance comes from a deliberate index + query strategy (see [`DATABASE_NOTES.md`](./DATABASE_NOTES.md)).

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health`, `/api/health` | Liveness + record count |
| GET | `/api/search?q=&type=&limit=&offset=` | Search by `name` (fuzzy), `email`/`phone`/`user_id` (exact) |
| GET | `/api/metrics` | Compact data-quality summary |
| GET | `/api/quality` | Full data-quality breakdown (live, uncached) |
| POST | `/api/duplicates` | Batch duplicate pairs |
| GET | `/api/duplicates/:id?threshold=&limit=` | Per-user duplicate candidates with similarity scores |

UI dashboard (search, data quality, duplicates) is served at `/`.

## Quick start

```bash
docker compose up -d          # starts Postgres 17 (tuned) + the API on :3000
# wait for health, then:
curl http://localhost:3000/api/health
```

> **Data:** The 22.4M-row dataset is **not** in this repo (4.8GB uncompressed). On the challenge VPS it is preloaded at `/app/data/challenge_db_anonymized_v2.sql.gz` and imported into the `pgdata` volume. To reproduce elsewhere, place the dump and run:
>
> ```bash
> zcat challenge_db_anonymized_v2.sql.gz | docker exec -i challenge_pg psql -U postgres -d challenge_db
> ```
>
> then build the indexes documented in [`DATABASE_NOTES.md`](./DATABASE_NOTES.md).

## Configuration

| Env | Default | Notes |
|-----|---------|-------|
| `DATABASE_URL` | `postgres://postgres:postgres@postgres:5432/challenge_db` | Postgres DSN |
| `PORT` | `3000` | API listen port |
| `PGPOOL_MAX` / `PGPOOL_MIN` | `40` / `10` | Connection pool bounds |

## Project layout

```
src/            Fastify app (server, db pool, routes)
public/         Dashboard UI (static)
docker-compose.yml   Postgres 17 (tuned) + API
Dockerfile      API image (node:20-alpine)
DATABASE_NOTES.md    Schema, indexes, optimizations, design decisions
REQUIREMENTS.md      Scoring/requirements tracker
```

## Notes

- All queries are parameterized (the dataset intentionally contains SQL-injection-like strings).
- Phone numbers are masked in search results.
- Data-quality and duplicate metrics are computed **live** from the database — no pre-computed answers.
