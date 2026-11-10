# Linear workspace redesign

## Direction and evidence

The owner rejected the previous Fey/Linear hybrid as too spacious and too blue. This revision replaces its presentation with the neutral, compact list layout of the supplied [Linear dark issue-list screen on Mobbin](https://mobbin.com/screens/e142df2a-3527-499c-8f81-1b715947ac0c). The previous layout is not a constraint. The eight routes, Lithuanian content, data sources and functional approval boundaries are constraints.

The exact reference was inspected in the browser, including its publicly displayed 3024×2010 image. Pixel sampling found `#070707` navigation, `#0f0f0f` canvas and `#1a1a1a` group surfaces. Those values are used directly. Mobbin search also returned Linear references; the supplied screen remains the design target. No third-party screenshots or brand assets ship in the application.

The resulting interface is similar, not a verified pixel-for-pixel reproduction. It has different content and controls, fewer fictional tasks, explicit demo/connection states, inline approval details and a mobile adaptation. There is no defensible whole-screen similarity percentage. Inter is a locally bundled implementation choice; the screenshot alone does not establish Linear's font file or every CSS value.

## Shared system

`src/app/globals.css` owns the palette, typography, spacing, geometry and interaction states. The implementation uses:

- An inset neutral canvas with a 1px boundary and 12px corners; a 244px desktop sidebar (220px at intermediate widths).
- A single 44px desktop page header, 28px navigation rows and 44px work rows. Page descriptions remain available through the labeled information disclosure, without a repeated page hero.
- Locally bundled Inter, including Lithuanian characters; 12–13px desktop content, 10–11px metadata and 13px page titles. No external font service is contacted.
- Thin neutral outlines, rounded metadata/filter pills, gray navigation selection and restrained `#5e6ad2` primary actions. Amber/red/green indicate attention/failure/observed success with explicit text. Unconfigured connections remain neutral and labeled.
- Wider touch targets and wrapping metadata on phones; input text is 16px to avoid mobile focus zoom. The mobile drawer retains its labeled navigation and keyboard focus behavior.

`WorkspaceHeader` consumes the enclosing shell's actual demo/live mode and provides the same navigation, heading, page information and mode indicator everywhere. `PageHeading`, `SectionTitle`, `Badge` and `ConnectionBadge` remain shared components. Radix Dialog and Phosphor remain the primitive/icon system; no additional component framework was introduced.

## Information and behavior

Overview uses full-width decision, work, project and activity groups. Connections and execution readiness appear below, rather than narrowing the main list. Its three filter buttons actually change the visible groups. Project/task filters also change the actual list, with tasks first and project descriptions below. Demo reviews, drafts and reset retain their local persistence.

`RunFeed` still groups actual operational records. `RunCard` retains the complete objective, bounded task, agent, criteria, constraints, exact confirmation, timestamps, errors, freshness, external links and results. Stable row identity preserves expansion across refreshes. Chat initially expands the plan for review. The composer remains in normal flow so it cannot cover the reviewed plan.

No authentication, database schema, adapter, orchestration transition or reconciliation logic changed. Missing storage means unknown operational counts, not fabricated zero metrics. A created external task is not represented as proven execution. No live calls, credentials, tasks, workflows, deployment or remote settings changes were used in this redesign.

## Review

Actual matched captures at 1440/1024/390px are kept locally under `.local/phase-2-5/linear-before` and `linear-after`. Comparisons are generated from those captures, not mockups. `REVIEW_CAPTURE_DIR` enables synthetic proposal/result captures with `npm run test:ui:live`. Reference research and generated images remain ignored.

`npm run test:ui` covers the filters, information disclosure, review/draft persistence, reset and mobile navigation. `npm run test:a11y` scans all eight routes at three widths and checks skip links, dialogs, focus return and reduced motion. The synthetic operational suite covers plan review, keyboard expansion, exact confirmation, status/results and local-only stop. Automated checks do not constitute a complete assistive-technology audit.

Live application credentials, a ready allowed agent, installed-contract verification, production identity-provider setup, conventional PostgreSQL-server testing and ARM64 runtime verification retain the limitations in [PHASE-2.md](PHASE-2.md). This design work does not mark those items complete. [Phase 3](PHASE-3.md) adds n8n using these same components and tokens; its live gate remains separate.
