# Tour Agent Design

## Goal

Add a safe, synchronous MVP agent that turns a consultant's Vietnamese request into itinerary draft activities for an existing trip.

## Boundaries

- LangGraph.js owns the bounded model/tool loop.
- Gemma 4 is accessed through the official Google GenAI SDK.
- The model can only call `add_itinerary_item` or finish. It cannot write prices, book services, call SQL, or choose optimistic-lock revisions.
- Every tool payload is validated with Zod and is executed through `PlanningService`; the server injects the current draft revision.
- The loop stops after configurable model-turn and total-tool-call budgets (20 and 60 by default) and returns a clear error rather than continuing indefinitely.
- Missing API configuration does not prevent the API from starting; only the agent endpoint returns `AI_NOT_CONFIGURED`.

## API

`POST /api/v1/trips/:tripId/agent/runs`

Request: `{ "instruction": "Tạo lịch trình nhẹ nhàng..." }`

Response: the run summary, final draft, number of model turns and executed tools. This first slice is synchronous and does not persist model reasoning or hidden chain-of-thought.

## Architecture

The module follows Route -> Middleware -> Controller -> Service. `TourAgentService` uses `TripService` and `PlanningService` as its safe application boundary. `AgentModel` is a provider interface; `GemmaAgentModel` is the production adapter and scripted fakes are used in tests.

## Failure handling

Invalid/unknown tool calls fail closed with `AGENT_TOOL_REJECTED`. Provider configuration failures return 503. A model that never finishes returns `AGENT_ITERATION_LIMIT` without another model call. Already-written activities remain draft data and are visible for consultant review.
