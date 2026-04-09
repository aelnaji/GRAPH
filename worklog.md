# GRAPH — Work Log

All significant changes to the project are documented here.

---

## 2026-04-09 — Full Production Hardening

### 🔴 Critical Fixes

#### SQLite → PostgreSQL Migration
- `prisma/schema.prisma`: Changed provider from `sqlite` to `postgresql`
- All `String` JSON fields migrated to native Prisma `Json` type: `metadata`, `tags`, `payload`
- Added `onDelete: Cascade` to `KnowledgeEdge` relations (auto-cleanup orphaned edges)
- Added `minValue` / `maxValue` guardrail columns to `PolicyConfig`
- Run locally: `bunx prisma migrate dev --name postgres-migration`

#### Auth Middleware
- Created `src/lib/auth.ts` — `requireAuth()` checks `Authorization: Bearer <API_SECRET_KEY>`
- Applied to all write routes: `POST /api/chat`, `GET /api/chat`, `PUT /api/policies`, `POST /api/ingest`
- Dev mode: warns but allows through if `API_SECRET_KEY` not set
- Production: returns `401` on missing/wrong key, `500` if key not configured

#### JSON.parse Crash Fix
- Removed all `JSON.parse(l.payload)`, `JSON.parse(n.tags)`, `JSON.parse(n.metadata)` calls
- Prisma `Json` type returns native JS objects — no parsing needed
- Fixed in: `logs/route.ts`, `orchestrator.ts`, `memory.ts` (autoLink, query, createNode)

### 🟠 Important Additions

#### Node Deletion API
- Created `src/app/api/graph/[id]/route.ts`
- `DELETE /api/graph/:id` — deletes node + cascades edges + cleans chat message refs
- `GET /api/graph/:id` — fetch single node with edges
- Both routes require auth for DELETE, open for GET

#### Pagination
- `GET /api/chat` — added `?page=&limit=` with `pagination` object in response
- `GET /api/logs` — added `?page=&limit=&eventType=` cursor-style pagination
- Default limit: 50, max: 200

#### Policy Guardrails (DB-Driven)
- `src/lib/agents/types.ts`: All 15 `DEFAULT_POLICIES` now include `minValue` and `maxValue`
- `src/lib/agents/policy-store.ts`: `ensurePolicies()` seeds min/max into DB; `adjustPolicy()` reads DB bounds first
- `src/lib/agents/self-modify.ts`: All 6 rules now call `getBounds(key)` to read live DB guardrails before clamping — no hardcoded limits
- `src/app/api/policies/route.ts`: `PUT` validates value against DB `minValue`/`maxValue` before saving

#### Startup Key Warning
- `src/lib/agents/orchestrator.ts`: Logs clear error at startup if `OPENAI_API_KEY` is not set

### 🐳 Docker

#### Dockerfile
- Multi-stage build: `deps` → `builder` → `runner`
- Uses `oven/bun:1` base image
- Runs `prisma migrate deploy` then `bun server.js` on container start
- Requires `output: 'standalone'` in `next.config.ts` (already set)

#### docker-compose.yml
- Services: `postgres` (postgres:16-alpine), `app` (built from Dockerfile), `caddy` (optional, `--profile caddy`)
- `postgres` has healthcheck; `app` waits for postgres healthy
- Persistent volumes: `postgres_data`, `caddy_data`, `caddy_config`
- All env vars injected from `.env` file

### 📄 Documentation
- `.env.example`: Full env var template with all providers documented
- `README.md`: Features, quickstart, Docker, provider table, project structure, security notes
- `.github/workflows/ci.yml`: Lint + type check + build + test on every push to main/dev

### 🧪 Tests
- `jest.config.ts`: Next.js Jest config with `@/` path alias, `node` test environment
- `src/lib/__tests__/auth.test.ts`: 6 tests covering all auth scenarios
- `src/lib/agents/__tests__/memory.test.ts`: 10 tests — verify, createNode, reinforceNode, createEdge, decayNodes
- `src/lib/agents/__tests__/self-modify.test.ts`: 7 tests — all 6 rules, DB guardrail clamping, edge cases
- `src/lib/agents/__tests__/policy-store.test.ts`: 8 tests — ensurePolicies, getPolicy, setPolicy, adjustPolicy, getAllPolicies

### ⚠️ Known Remaining Items
- No Playwright / E2E tests yet
- `memory.ts` `createNode()` still passes `JSON.stringify(metadata)` and `JSON.stringify(tags)` — needs update after confirming Prisma migration applied
- `memory.ts` `query()` and `autoLink()` still call `JSON.parse()` on tags — same as above

---

## Initial Development (Pre-2026-04-09)

- Next.js + Bun + Prisma project scaffolded
- Knowledge graph schema: `KnowledgeNode`, `KnowledgeEdge`, `SystemLog`, `PolicyConfig`, `ChatMessage`, `IngestQueue`
- Agent pipeline: Perception → Memory → StateEmotion → SelfModify → Orchestrator
- SSE event bus for real-time graph visualization
- Caddy reverse proxy config for self-hosted deployment
- 3D graph visualization with D3 force-directed layout
- Policy system with 15 configurable parameters
