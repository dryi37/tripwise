# React frontend migration design

## Intent

Replace the browser-rendered Vanilla JavaScript prototype with a maintainable React frontend while preserving Tripwise's current visual language, Vietnamese content, backend authority, and existing product workflows.

## Goals

- React 19, TypeScript, and Vite application served on port 8080.
- Feature-oriented source layout for trips, workspace, catalog, knowledge, and agent.
- PostgreSQL-backed server state; no business-data writes to localStorage.
- Preserve the current sidebar, workspace composition, green/lime visual system, responsive behavior, and source-aware quote workflow.
- Accessible dialogs, forms, tables, loading, empty, error, offline, and revision-conflict states.

## Non-goals

- Backend contract redesign, authentication, permissions, or production deployment.
- Pixel-for-pixel preservation of accidental prototype behavior.
- Keeping `dist/app.js`, `dist/redesign.js`, or `dist/api-sync.js` in the final runtime.

## Approach

Use a parallel React application in `frontend/` and migrate complete feature slices against the existing API. Reuse visual assets and translate the current CSS into application tokens and focused component styles. After parity checks, Vite's production output becomes `dist/` and the legacy runtime files are retired.

Alternative approaches rejected: wrapping the old DOM scripts inside React would preserve technical debt and duplicate state ownership; a big-bang visual redesign would combine migration risk with unrequested product changes.

## Architecture

- `src/app`: routing, providers, shell and global error boundary.
- `src/features`: trip, workspace, catalog, knowledge and agent feature code.
- `src/shared/api`: typed HTTP client and error normalization.
- `src/shared/ui`: buttons, dialogs, fields, status/feedback and table primitives.
- TanStack Query owns server state. React Router owns navigation/filter state. Component state owns modal and draft input state.
- API base URL comes from `VITE_API_URL`, defaulting to `http://localhost:3101/api/v1`.

## Acceptance

The React UI can list/create/edit trips; edit itinerary; manage quote items from supplier offers or manual input; manage services/offers; save/restore versions; list/create knowledge documents; and submit agent instructions. Refresh preserves server-backed data, offline mutation is blocked, and the production build contains no legacy runtime scripts.
