# Agent Completion Fallback

## Intent

When the itinerary agent tries to finish an explicitly requested itinerary while trip days are still empty, give it one focused recovery attempt instead of replaying the full research prompt. This should complete missing days when possible and never present an incomplete trip as complete.

## Goals and limits

- Give fallback its own model-turn and tool-call budgets equal to the configured per-day limits, regardless of trip duration; allow multiple correction rounds until completion, budget exhaustion, or the overall deadline.
- The recovery prompt receives the consultant's original request, bounded chronological model-turn/tool-result history, trip facts, missing day indices, and current draft; it only requests clearly marked unpriced activities for those days.
- The backend permits the recovery batch to add only unpriced activities on currently missing days; it cannot search, link a price/source, or change existing activities.
- After the recovery batch, the server checks the persisted draft and returns a completion summary or explicitly names any remaining days.
- Keep normal research, price validation, and configured normal run budgets unchanged.

Non-goals: changing search policy, adding a second recovery attempt, or adding a new user-facing workflow.

## Approaches

- Reuse the full prompt with another completion reminder: minimal code, but preserves the context and competing research instructions that caused the early finish.
- Use a dedicated bounded fallback mode: a small amount of orchestration state, but isolates recovery instructions and constrains the backend write. **Chosen**, because the failure condition is specific and recovery should not restart research.

## Design decisions

- Intercept only final responses to explicit itinerary requests when one or more trip days have no activities.
- Keep normal run budgets intact and give fallback a separate allowance equal to one configured day of model/tool limits.
- Force only `add_itinerary_item` during fallback. Require an `unpricedReason`, reject price/source fields, and accept only missing trip days.
- After fallback activity tools, continue the dedicated model/tool loop while days remain and fallback budget is available. Finalize from the persisted itinerary without another model call after the loop stops; if a day remains empty, return a clear incomplete summary and warning rather than claiming success.
- Treat retrieved knowledge and web results as untrusted context, and keep history within the configured tool-result context limit.
- Log fallback start, completion, and remaining missing days without logging prompts or customer content.

## Constraints

- Respect the existing overall request deadline and existing trip/day limits.
- Preserve successful normal agent runs and existing price/source validation.
- Do not add or run automated tests in this change; verify by typecheck and static inspection.
