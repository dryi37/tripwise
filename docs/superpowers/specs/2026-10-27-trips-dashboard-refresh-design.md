# Tripwise Trips Dashboard Refresh

## Intent
Refresh the Trips dashboard for Vietnamese travel consultants so it feels polished, calm, and travel-specific while remaining an efficient operational workspace.

## Goals
- Make the active trip and next action immediately legible.
- Improve scanning of trip status, dates, party size, and budget.
- Add restrained destination imagery without turning the workspace into a consumer travel landing page.
- Preserve all existing create, open, search, filter, local-storage, and responsive behavior.

## Non-goals
- No data-model, routing, persistence, booking, messaging, or AI behavior changes.
- No copied layouts, copy, branding, or assets from reference products.
- No redesign of other routes in this change.

## References and chosen approach
- TravelJoy and Travefy: advisor-first hierarchy, clear trip lifecycle, direct continuation actions.
- Travelandz Planner: catalogue-aware, professional operational density.
- Mindtrip: image-rich destination context used selectively.

Three directions were considered: dense operations dashboard, image-led travel gallery, and a hybrid advisor workspace. The approved direction is the hybrid: professional and compact first, with one controlled destination spotlight as the visual signature.

## Visual system
- Preserve IKIGAI forest green and lime as primary identity colors.
- Add a mist canvas, warm white surfaces, deeper ink text, and a soft travel-blue accent only for contextual information.
- Use the existing offline Segoe UI/Arial stack; increase contrast through scale, weight, and spacing rather than network fonts.
- Signature element: a wide active-trip spotlight using the existing Seoul image, overlaid with lifecycle context and a clear resume action.
- Use restrained radii, borders, and shadows. Avoid a generic card grid or decorative KPI tiles.

## Layout and behavior
- Desktop: compact page heading, spotlight trip, interactive pipeline strip, then a purposeful trip queue.
- The trip queue retains semantic table markup on wide screens and becomes stacked trip records on narrow screens.
- Search and status filter remain URL-backed and keyboard accessible.
- Empty results retain the existing recovery guidance.
- Reduced-motion and visible-focus behavior remain supported.

## Constraints
- Runtime UI stays buildless in `dist/`.
- `dist/redesign.js` remains the presentation owner for the Trips route.
- `dist/redesign.css` remains the runtime visual-token and override owner.
- Existing event delegation and stable element IDs/data attributes must be preserved.

