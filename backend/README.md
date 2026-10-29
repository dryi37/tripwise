# Tripwise backend

## Web search and external estimates

The tour agent can search bounded public web results when `TAVILY_API_KEY` is configured. Every usable result is persisted as an `ExternalSource`; the controlled planning mutation accepts only its server-issued `externalSourceId`, so the model cannot submit an arbitrary web price or URL.

External quote lines use `sourceType: EXTERNAL`, remain `UNVERIFIED`, and retain the title, canonical URL, excerpt, retrieval time, confidence, constraints, original amount/currency, and evidence snapshot. Unsuitable sources are rejected. A price in a different currency from the trip quote is rejected until an explicit conversion workflow is available.

Configuration is documented in `.env.example`. `AGENT_SEARCH_RESULTS_PER_TOOL` controls the result count for each independent agent search tool (web, knowledge, and internal catalog); the model cannot set this value. `AGENT_LOG_FILE` selects the agent JSONL log destination; the local example writes under `../artifacts/logs/backend/`. Model retry/context/output settings, agent budgets/timeouts, Qdrant request/batch settings, knowledge chunking, web freshness, request rate/body limits, and CORS origins are also required environment values. There are no code fallbacks for these deployment settings; provide them in each environment. Apply migrations with `npx prisma migrate deploy`. The read endpoint is `GET /api/v1/trips/:tripId/external-sources`.

Express/TypeScript modular monolith using Route → Middleware → Controller → Service → Repository.

## Requirements

- Node.js 24+
- Docker Desktop (for local PostgreSQL)

## Local setup

```powershell
Copy-Item .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npx prisma migrate dev --name init
npm run dev
```

The API uses the configured `PORT`. The static frontend uses `dist/runtime-config.js` for its API base URL and request timeouts; update that file for the deployment environment. Start its local server with explicit settings, for example `node scripts/serve-static.cjs dist 8080 127.0.0.1`.

## Verification

```powershell
npm test
npm run typecheck
npm run build
npx prisma validate
```

## API

- `GET /api/v1/health`
- `POST /api/v1/trips`
- `GET /api/v1/trips?q=&status=&cursor=&pageSize=20`
- `GET /api/v1/trips/:tripId`
- `PATCH /api/v1/trips/:tripId`
- `GET /api/v1/trips/:tripId/draft`
- `POST/PATCH/DELETE /api/v1/trips/:tripId/draft/items[/:itemId]`
- `GET /api/v1/trips/:tripId/draft/quote`
- `POST/PATCH/DELETE /api/v1/trips/:tripId/draft/quote/items[/:itemId]`
- `POST /api/v1/trips/:tripId/agent/runs`

PATCH requests include `expectedRevision`; stale writes return `409 REVISION_CONFLICT`.

## Tour agent

The agent endpoint is `POST /api/v1/trips/:tripId/agent/runs` with a JSON body such as:

```json
{ "instruction": "Tạo lịch trình 3 ngày nhẹ nhàng, phù hợp gia đình có trẻ nhỏ" }
```

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` to enable Gemma 4. The API still starts without a key, but this endpoint returns `AI_NOT_CONFIGURED`. Configure `GEMMA_MODEL`, `AGENT_MODEL_CALLS_PER_DAY`, and `AGENT_TOOL_CALLS_PER_DAY` in the environment; they are required and have no code defaults.

The model can only add activities to the editable itinerary draft. It cannot create quote prices, book services, or access the database directly.

### Seed internal knowledge for agent testing

The dev database should use the real supplier catalog. To exercise internal knowledge retrieval, seed the Seoul planning guides:

```powershell
npm run seed:agent-knowledge
```

This idempotently adds three documents to PostgreSQL and indexes their embeddings in Qdrant. They contain planning guidance, not supplier offers or claims about current hours, weather, or prices; the agent must verify those details against current sources. To remove legacy test rows created by the earlier seed, run `npm run cleanup:demo-catalog`. It targets only records with the `[DEMO - CHỈ DÙNG KIỂM THỬ]` prefix and retains historical quote rows.

