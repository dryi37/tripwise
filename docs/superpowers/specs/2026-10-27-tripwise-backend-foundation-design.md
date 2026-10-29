# Tripwise Backend Foundation Design

## Intent

Create the first runnable backend slice for the existing Tripwise prototype without changing the static frontend. The backend establishes the company-requested Route → Middleware → Controller → Service → Repository layering and a stable PostgreSQL contract that later agent, retrieval, pricing, and review features can extend.

## Chosen approach

Use a modular monolith in TypeScript with Express 5, Prisma ORM 7, PostgreSQL, Zod, and Vitest/Supertest. The first vertical slice exposes health and trip CRUD APIs. Controllers only translate HTTP, services own business rules, repositories own persistence, and middleware owns validation and error formatting.

Alternatives considered:

- A broad scaffold for every future Tripwise module was rejected because it would create untested empty abstractions.
- Direct Prisma calls from controllers were rejected because they violate the requested repository boundary and make business logic difficult to test.
- Prisma 8 was rejected for this slice because the company version is unknown and Prisma 7 remains fully supported with the familiar generated-client workflow.

## API contract

- Prefix: `/api/v1`
- `GET /health`
- `POST /trips`
- `GET /trips`
- `GET /trips/:tripId`
- `PATCH /trips/:tripId`
- IDs are UUIDs; payloads are camelCase.
- Create returns `201`; reads and updates return `200`.
- Invalid input returns `422`; missing records return `404`; revision conflicts return `409`.
- Errors use `{ "error": { "code", "message", "details?" } }`.
- List responses use `{ data, page: { nextCursor } }` with cursor pagination.
- PATCH requires `expectedRevision`; successful updates increment `revision`.

## Data model

The first `Trip` model stores title, customer name, origin, destination, local start/end dates, group size, budget in integer minor units, ISO currency, lifecycle status, optimistic-lock revision, and timestamps. PostgreSQL remains the source of truth. Qdrant will only become a rebuildable retrieval index in a later slice.

## Boundaries

- Routes compose middleware and controller handlers.
- Validation middleware parses params/query/body and replaces them with typed, sanitized values.
- Controllers contain no Prisma calls or business decisions.
- Services enforce date order and optimistic concurrency.
- Repositories expose domain-shaped operations; the Prisma implementation is replaceable by an in-memory test repository.
- Agent, Gemma, LangGraph.js, Qdrant, authentication, and frontend integration are explicitly deferred.

## Operational constraints

- Environment variables are validated at startup.
- Secrets are never committed; `.env.example` contains placeholders only.
- Prisma transactions must not remain open while waiting on model or network calls.
- A local PostgreSQL service is supplied through Docker Compose, but tests do not require Docker.

