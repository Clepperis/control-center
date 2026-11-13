# LJA partner loop — design draft

Workspace plan phase 2 (see `docs/WORKSPACE-PLAN.md` on `claude/workspace-plan`).
Status: **draft, waiting on owner answers below and on Google credentials in n8n.**

## Goal

Find potential partners, check them against the CRM, score them, and prepare
personalised email drafts. Nothing leaves the mailbox until the owner approves
it. Every sent email and reply is recorded back in the CRM, and follow-up
reminders are scheduled.

## Where each piece runs

| Step                  | Runs in                  | Why                                                        |
| --------------------- | ------------------------ | ---------------------------------------------------------- |
| Search for candidates | Control Center (model)   | Needs reasoning and web search; cost shown on route card   |
| CRM duplicate check   | n8n → Google Sheets      | n8n holds the Google credential; Control Center never does |
| Scoring               | Control Center (model)   | Cheap model; rubric below                                  |
| Email draft           | n8n → Gmail **draft**    | Draft only; no `send` node in this workflow                |
| Owner approval        | Control Center approvals | Existing approval flow; one approval per email             |
| Send                  | n8n → Gmail send draft   | Separate workflow, runs only with an approval id           |
| CRM record + reminder | n8n → Google Sheets      | Same execution as send; reminder via n8n schedule          |

Two n8n workflows keep the risky step isolated:

1. `lja-prepare` — reads the CRM, appends candidate rows with status `draft`,
   creates Gmail drafts. No external side effects beyond drafts and CRM rows.
2. `lja-send` — input: approval id + draft id. Sends exactly one draft, writes
   `sent_at` and `follow_up_at` to the CRM row. Rejects input without an
   approval id that Control Center issued.

Both are registered as curated automation contracts, like
`examples/n8n/safe-text.workflow.mjs`, so the orchestrator can only call them
through `execute_workflow` with a validated payload.

## CRM row contract (proposal)

| Column          | Type     | Notes                                                                 |
| --------------- | -------- | --------------------------------------------------------------------- |
| `org`           | text     | Organisation name; duplicate key (normalised)                         |
| `website`       | url      | Second duplicate key (domain)                                         |
| `contact_name`  | text     |                                                                       |
| `contact_email` | email    | Required before a draft is created                                    |
| `category`      | enum     | e.g. sponsor, venue, media, education                                 |
| `score`         | 0–100    | From scoring rubric                                                   |
| `status`        | enum     | `candidate → draft → approved → sent → replied / declined / no_reply` |
| `draft_id`      | text     | Gmail draft id                                                        |
| `sent_at`       | datetime |                                                                       |
| `follow_up_at`  | datetime | Default `sent_at + 7 days`                                            |
| `notes`         | text     | Free text, owner-editable                                             |

If the existing sheet uses other columns, the workflow maps to them instead;
the sheet stays the source of truth.

## Scoring rubric (proposal)

- Fit with the LJA audience and event theme — 40
- Evidence of past youth / alumni / community partnerships — 25
- Reachable contact (named person, direct email) — 20
- Lithuania / Vilnius presence — 15

Candidates under 50 stay `candidate` without a draft.

## Safety rules

- No Gmail `send` node in `lja-prepare`.
- `lja-send` sends one draft per execution; no batch sending.
- Daily send cap (default 20) enforced inside the workflow.
- "Please stop" / unsubscribe replies set status `declined`; never contacted again.
- Credentials live only in n8n; Control Center sees ids and statuses.

## Open questions for the owner

1. Current CRM sheet columns (a screenshot of the header row is enough).
2. Partners for what: the alumni event, LJA in general, or both?
3. One example email you would be happy to send (tone, signature, LT/EN).
4. Which partner categories matter most right now?
5. Daily send cap and follow-up delay — keep 20 / 7 days?

## Build order

1. Owner connects Google Sheets + Gmail credentials in n8n.
2. `lja-prepare` against a **copy** of the CRM sheet; verify rows and drafts.
3. Contract + orchestrator route in Control Center; approval card.
4. `lja-send` with the daily cap; first real send only after owner review.
5. Reminder schedule and reply detection.
