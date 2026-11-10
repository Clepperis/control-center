# Phase 2.5: dark workspace refinement

## Direction and baseline

The existing product had a large welcome/decision block ahead of its work list, repeated full-size plan cards, small metadata labels, and an inconsistent scan path between dashboard and chat. The refinement keeps the eight routes, Lithuanian product vocabulary, data sources and actions, while moving to charcoal surfaces, a compact labeled sidebar and a restrained blue interaction accent.

The local original Fey image and the exact user-linked [Fey dashboard](https://mobbin.com/screens/55551250-acb8-4686-b71e-b95288f56e48) and [Linear task list](https://mobbin.com/screens/e142df2a-3527-499c-8f81-1b715947ac0c) images were visually inspected. Fey informs surface separation, restrained accents and major-section spacing. Linear informs status groups, compact rows and aligned metadata. Their logos, financial content, chart data and screenshots are not application assets. The optional board reference was not needed: this product retains its existing list/detail flow.

Mobbin's connector has no direct screen-ID retrieval operation. A narrow search did not return the requested Linear screen; the exact supplied pages were inspected in the browser instead. No broad replacement search was used. Design details such as Lithuanian labels, inline plan expansion and composer placement are product-specific decisions, not claims about either reference's behavior.

## Reusable system

`src/app/globals.css` owns the dark surface layers, primary/secondary/disabled text, accent, semantic status colors, focus, type steps, spacing, radii and control sizing. Tailwind's retained neutral utilities map to the same palette. The existing font stack, Phosphor icons and Radix Dialog remain; no UI library, external font service or decorative chart was added.

- Background/navigation/surface/raised/hover roles separate areas with thin dividers rather than many elevated cards.
- Blue marks selection, links and primary actions. Green is reserved for observed completion or verified application access; amber/red carry attention/failure states. Text always states the status.
- `PageHeading`, `SectionTitle`, `Badge`, `ConnectionBadge`, `WorkspaceStatus` and `RecentActivity` are shared patterns.
- Overview leads with decisions/blockers, work rows, secondary connection status and recent activity. Missing operational storage still means unknown counts, never zero-valued live metrics.
- `RunFeed` groups actual runs by status. `RunCard` is a keyboard-accessible expandable row containing the existing objective, agent, criteria, constraints, confirmation, timestamps, errors, external link and results. Stable row identity preserves expansion across refreshes. Chat initially expands its plan for review.
- Chat separates owner messages, assistant responses and delegation plans. The composer stays in normal document flow so it cannot cover the reviewed plan. Missing-configuration details remain discoverable and open when needed.
- Existing projects, filters, drafts, agents and informative empty states use the same controls and surfaces. Demo/live distinction is retained.

## Behavior preserved

This phase changes no server authentication, PostgreSQL schema, gateway configuration, adapter, orchestration transition or reconciliation logic. Exact-plan owner approval, duplicate prevention, stale/uncertain/blocked states and local-only tracking stop remain. Deep links retain conversation IDs and expose stable `#run-…` targets. No live credentials, calls, tasks, workflows, external messages, deployment or remote settings changes were used for review.

## Review and validation

Sanitized actual browser captures are kept locally under `.local/phase-2-5/before` and `after`, at matching 1440/1024/390px widths and equivalent demo/synthetic states. They are ignored, together with audit/environment files. `REVIEW_CAPTURE_DIR` lets `npm run test:ui:live` capture the proposal and result states without external services. No third-party reference images are committed.

`npm run test:a11y` scans all eight demo pages at all three widths with axe AA tags, checks overflow, skip-link navigation, dialog focus trapping/return (including a removed trigger), the mobile drawer and reduced motion. The synthetic live browser suite checks the proposal/result contrast, keyboard row expansion, preserved expansion after refresh and the existing approval/status/results flow. Automated checks do not replace a complete assistive-technology audit.

Live account verification, production OIDC/proxy setup, conventional PostgreSQL-server testing and ARM64 deployment remain the Phase 2 limitations documented in `PHASE-2.md`. This visual phase does not resolve or conceal those blockers. n8n execution remains a later phase.
