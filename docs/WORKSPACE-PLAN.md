# Workspace plan: one place for everything

Status: **agreed by the owner on 2026-11-11**. This is the shared plan for the
owner, Claude, Codex and the Paperclip team. Research and comparison of all
options: private research page shared with the owner (not in this public repo).

**Santrauka lietuviškai:** Control Center tampa viena darbo vieta viskam.
Control Center organizuoja, AI modeliai galvoja, n8n daro veiksmus, Paperclip
programuoja, o savininkas sprendžia. Įgyvendiname 0–8 etapus iš eilės; pirmas
naudingas rezultatas yra LJA partnerių paieškos ciklas.

## Architecture (hybrid)

- **Control Center** (this repo): the cockpit. Receives tasks, splits them into
  steps, shows approval cards, keeps history, memory and lessons, routes
  models, tracks cost.
- **Model routing** (inside Control Center): picks who thinks. nexos (30 EUR
  free per month) for everyday work, Codex Pro for coding, Claude for hard
  reasoning. Analysis is free and deterministic; fallback only to cheaper pools.
- **Tool Hub** (MCP server inside Control Center): the tools every engine may
  use (web search, CRM via n8n, Knowledge, n8n runs, Paperclip, statistics),
  with approval rules. Reading is free; outward actions need the owner's yes.
- **AI engines**: nexos models, Codex, Claude Code, later Hermes or OpenClaw.
  They think and write; they change the outside world only through Tool Hub.
- **n8n** (Hostinger): executes reviewed procedures: Gmail, CRM writes,
  reminders, schedules. No improvisation.
- **Paperclip** (Hostinger): the coding team (boss, dev, dev-codex, reviewer).
  Delivers PRs only; never merges.
- **Hermes + Telegram** (Oracle): the owner's phone channel, using the same
  Tool Hub.
- **External systems**: CRM, Gmail, GitHub hold the real data.

## Who is responsible

| Who            | Responsibility                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner          | Decisions and approvals, accounts and keys (CRM, Gmail, Telegram bot, DuckDNS), event details, final testing, merging PRs                   |
| Claude         | Architecture, Tool Hub, new Control Center features, n8n workflow drafts, tests and security, review of every PR (Paperclip team and Codex) |
| Codex          | Oracle deployment (Phase 6 scope), syncing the owner's main checkout                                                                        |
| Paperclip team | Smaller coding tasks as PRs once Hostinger fixes Paperclip                                                                                  |
| n8n            | Integrations and schedules                                                                                                                  |
| Hostinger      | Fixing the stuck Paperclip run (in progress)                                                                                                |

To avoid conflicts each contributor owns a separate area: Claude owns Tool Hub
and the LJA loop, Codex owns Oracle deployment, the Paperclip team owns small
features.

## Phases

| #   | Phase                                                                                                                               | Owner of work                        | Needs from owner                     | Size         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------ | ------------ |
| 0   | Preparation: merge PR #9, answer CRM / email / event questions, Codex syncs the main checkout                                       | Owner, Codex, Claude                 | Answers                              | 1–2 days     |
| 1   | Tool Hub: owner's tools (CRM, n8n, Knowledge, search, statistics) as MCP with approval rules                                        | Claude                               | —                                    | ~1 week      |
| 2   | LJA partner loop: search → CRM check → score → email drafts → owner approval → Gmail → CRM record → reminders                       | Claude (n8n drafts), owner publishes | CRM and Gmail access, email template | ~1–1.5 weeks |
| 3   | Pool routing: Codex Pro / Claude / nexos with limit tracking and a "nexos X EUR of 30 EUR" meter                                    | Claude                               | —                                    | 2–3 days     |
| 4   | Oracle deployment: HTTPS and password login so the phone and Hermes can reach Control Center                                        | Codex, Claude reviews                | DuckDNS account, approvals           | ~1 week      |
| 5   | Phone: Hermes on Oracle + Tool Hub + Telegram (approval buttons, morning summaries)                                                 | Claude                               | Telegram bot                         | 2–3 days     |
| 6   | Coding from Control Center: task in chat → Codex or Claude Code → PR → review                                                       | Paperclip team or Claude             | —                                    | ~1 week      |
| 7   | Learning: lessons from owner edits, rejections and failures (owner approves), repeated lessons become skills, 👍/👎 improve routing | Claude                               | Approve lessons                      | ~1 week      |
| 8   | Venew and design scenarios: market reviews, decks, design prototypes                                                                | Everyone                             | Ideas and priorities                 | Ongoing      |

Estimate: first useful result (LJA loop) in about 2–2.5 weeks; the full system
in about 6–8 weeks. Phases 1–3 (Claude) and 4 (Codex) can run in parallel.

## Rules that apply to every phase

- Outward actions (emails to clients, CRM writes, publishing, merging) need the
  owner's explicit approval. Every client email has an opt-out.
- Reliable actions run through reviewed n8n workflows, not improvised by a model.
- Facts live in source systems (CRM); lessons and preferences live in
  Control Center memory and are owner-approved. Web content never becomes a
  lesson automatically.
- Cost and model are recorded for every call; the cheapest suitable pool is used.
- Live switches stay off until a specific bounded test is approved.
- No secrets, private audits or personal data in this public repo.

## Status log

- 2026-11-11: plan agreed; phase 0 started.
