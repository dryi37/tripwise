# Tripwise backend

## Web search and external estimates

The tour agent can search bounded public web results when `TAVILY_API_KEY` is configured. Every usable result is persisted as an `ExternalSource`; the controlled planning mutation accepts only its server-issued `externalSourceId`, so the model cannot submit an arbitrary web price or URL.

External quote lines use `sourceType: EXTERNAL`, remain `UNVERIFIED`, and retain the title, canonical URL, excerpt, retrieval time, confidence, constraints, original amount/currency, and evidence snapshot. Unsuitable sources are rejected. Foreign prices are converted by the backend to the trip budget currency using the dated reference rate from `FX_RATE_API_URL`; the original source amount and conversion details are kept in the quote terms. Configure `FX_RATE_TIMEOUT_MS` and `FX_RATE_CACHE_TTL_MS` with the provider URL. If a rate is unavailable, the price is not saved as if it were VND.

Configuration is documented in `.env.example`. `AGENT_SEARCH_RESULTS_PER_TOOL` controls the result count for each independent agent search tool (web, knowledge, and internal catalog); the model cannot set this value. `AGENT_REQUEST_TIMEOUT_MS` is the agent's overall time budget per itinerary day (600,000 ms in the local example); the total run deadline scales with trip length. `APP_LOG_FILE` selects the application-wide JSONL log destination; the local example writes under `../artifacts/logs/backend/`. Logs include HTTP request IDs, route/status/duration, centralized API errors, agent model/tool calls, and external-provider outcomes; request bodies, API keys, and prompts are not recorded. Model retry/context/output settings, agent budgets/timeouts, Qdrant request/batch settings, knowledge chunking, web freshness, request rate/body limits, and CORS origins are also required environment values. There are no code fallbacks for these deployment settings; provide them in each environment. Use `prisma migrate dev` during local schema development and `prisma migrate deploy` in staging/production to apply reviewed migration files. The read endpoint is `GET /api/v1/trips/:tripId/external-sources`.

## Logs

Backend events are written as one JSON object per line to `APP_LOG_FILE`. With the sample configuration, inspect the file from the repository root with `Get-Content artifacts/logs/backend/application.jsonl -Tail 100 -Wait`. Filter an agent run with `Select-String -Path artifacts/logs/backend/application.jsonl -Pattern '"runId":"<run-id>"'`; place-search entries include the normalized query, tool number, result count, and duration. Each HTTP response includes `X-Request-Id`; frontend API failures log that same ID in the browser console. Search for the ID to join client and backend events.

Express/TypeScript modular monolith using Route → Middleware → Controller → Service → Repository.

## Requirements

- Node.js 24+
- Docker Desktop (for local PostgreSQL and Qdrant)

## Local setup

Run the project from its repository root with the platform launcher:

```bash
# Ubuntu / WSL
bash scripts/start/ubuntu.sh
```

```powershell
# Windows PowerShell
.\scripts\start\windows.ps1

# Or double-click scripts\start\windows.bat in File Explorer
```

The launcher starts PostgreSQL and Qdrant with Docker Compose, creates `backend/.env` from `.env.example` on first run, installs backend dependencies if needed, generates the Prisma client, runs `prisma migrate dev` to check `schema.prisma` and create/apply development migrations, then starts the API and frontend and waits for both endpoints to respond. Local development uses `migrate dev`; CI, staging, and production should apply reviewed migration files with `prisma migrate deploy`. A migration can preserve existing rows, but its SQL determines whether it changes or deletes data. Inspect new migration SQL and back up important data before applying it. If you need a one-off start without schema checks, use `bash scripts/start/ubuntu.sh --skip-migrations` on Ubuntu/WSL or `.\scripts\start\windows.ps1 -SkipMigrations` on Windows. Add `GEMINI_API_KEY` and `TAVILY_API_KEY` to `backend/.env` to enable the default Gemini agent and web search.

For Gemini agent runs, `GEMMA_SUMMARY_TRIGGER_TOKENS` (default 12000) triggers summarization based on Gemini token counting for the full prompt plus serialized tool declarations and a 256-token framing allowance. Gemini Developer API cannot count actual tool declarations directly, so this is an estimate rather than an exact total. `GEMMA_MAX_INPUT_TOKENS` (default 16000) rejects requests exceeding the input limit after summarization. `GEMMA_MAX_TOOL_RESULT_CONTEXT_CHARS` independently bounds tool result characters and can also trigger summarization before old results are cut. The context-summary node retains four recent results and stores its summary in run state; original results remain available for server validation. Gemini estimates tokens again after summarization. Token-count failure stops the request; summary failure falls back to bounded context if it fits. Summary and token-count requests use the configured provider and may consume quota. The completion fallback keeps its bounded history and checks its input token count.

To use the LAN GX10 gateway for agent chat instead, set `AGENT_MODEL_PROVIDER=gx10` and `GX10_API_KEY` in `backend/.env`; `GX10_BASE_URL` and `GX10_MODEL` already default to the documented gateway and chat model. All tour-agent turns use `/chat/completions`, including ordinary conversational replies and turns where the model calls Tripwise tools. Requests include the available tools so GX10 can choose whether to answer in text or call a tool. Thinking is enabled. Its embedding and rerank endpoints are not used. The existing Gemini embedding configuration for Tripwise knowledge/catalog remains separate. GX10 requires a timeout of at least 120 seconds and at least 4,000 output tokens when thinking is enabled; this backend defaults to 4,096 tokens. This backend process caps its own concurrent GX10 calls at four, though other systems can still use the shared gateway slots. The gateway must be reachable from the backend host. Restart the backend after changing provider settings. On Ubuntu both server logs share the terminal; press Ctrl+C to stop them. On Windows the API and frontend logs open in separate PowerShell windows; close those windows to stop them.

For manual setup, use:

```powershell
Copy-Item backend/.env.example backend/.env
docker compose -f backend/docker-compose.yml up -d
Set-Location backend
npm ci
npm run prisma:generate
npx prisma migrate dev
npm run dev
```

In another terminal from the repository root, run `node scripts/serve-static.cjs frontend 8080 127.0.0.1` to start the frontend.

The API uses the configured `PORT`. The static frontend uses `frontend/runtime-config.js` for its API base URL and request timeouts; update that file for the deployment environment. Start its local server with explicit settings, for example `node scripts/serve-static.cjs frontend 8080 127.0.0.1`.

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

`APP_TIMEZONE` is the single valid IANA timezone used for every itinerary activity. Set it to `Asia/Ho_Chi_Minh` for this Vietnam-focused product. The agent and itinerary APIs do not accept a timezone argument; the backend applies the configured value when saving activities.

### OpenStreetMap place search and itinerary map

Place search uses the public Photon service and the browser map uses Leaflet with OpenStreetMap tiles. No Google Maps API key, Map ID, billing account, or `.env` value is required. The backend exposes `POST /api/v1/trips/:tripId/places/search` and `GET /api/v1/trips/:tripId/itinerary/map?dayIndex=N`; it stores the selected OSM provider, OSM ID, display name, address, and coordinates so map views do not geocode each activity again. Existing Google Place IDs are retained as `GOOGLE_LEGACY` and remain visible in the itinerary but do not create OSM pins; choose an OSM result to relink them.

Photon's public demo is a community service: reasonable use is allowed, but heavy use may be throttled or blocked and availability is not guaranteed. Tripwise serializes search requests to at most one per second per backend process and caches results. Keep map attribution visible. For production scale, use a hosted OSM-compatible provider or self-hosted service. See the [Photon API and demo guidance](https://github.com/komoot/photon/blob/master/README.md#demo-server) and [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
