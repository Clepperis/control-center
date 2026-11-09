# Integration contracts

Phase 1 provides interfaces, not working integrations.

| Adapter | Owns | Application setup |
| --- | --- | --- |
| Paperclip | Translate confirmed delegation to an external task and normalize status/results | Separately authorized operator authentication, company scope and allowed agents; verify installed contract |
| n8n | Read workflow/execution projections in a later phase | Separate application credentials and verified instance contract; no workflow activation now |
| Model gateway | Send validated conversation context, normalize response/errors and actual usage | Separate nexos API key and a verified available model; no Codex OAuth reuse |

`demo`, `disconnected`, `unavailable`, and `verified` are distinct states. A verified state requires an actual successful check and timestamp. A configured URL or a connected development MCP tool is not proof of application connectivity.

External descriptions, results, comments, documents and model output are untrusted data. They cannot select credentials, authorize delegation or change application policy. No integration should silently switch models/providers.
