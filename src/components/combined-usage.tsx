import {
  USAGE_MAX_AGE_MS,
  isQuotaCurrent,
  type UsageSnapshot,
} from "@/domain/usage";

const number = new Intl.NumberFormat("lt-LT");
const date = (value: string) =>
  new Date(value).toLocaleString("lt-LT", { timeZone: "Europe/Vilnius" });
const count = (value: number | null) =>
  value === null ? "Unknown" : number.format(value);
const services = { nexos: "Nexos.ai", claude: "Claude", codex: "Codex" };
const scopes = {
  "nexos-key": "Nexos API key scope (UTC days)",
  "control-center": "Control Center",
  local: "Local sessions",
  paperclip: "Paperclip provider runs",
};

export function CombinedUsage({
  snapshot,
  now,
}: {
  snapshot: UsageSnapshot | null;
  now: number;
}) {
  const currentQuotas =
    snapshot?.quotas.filter((q) => isQuotaCurrent(q, now)) ?? [];
  return (
    <section className="mt-6" aria-labelledby="shared-usage-heading">
      <h2 id="shared-usage-heading">Nexos.ai · Claude · Codex</h2>
      {!snapshot ? (
        <p className="notice">
          Bendra usage suvestinė dar neprieinama. Paleiskite usage:sync
          kompiuteryje, kuriame dirba Claude ir Codex.
        </p>
      ) : (
        <>
          <p className="muted text-sm">
            Atnaujinta {date(snapshot.generatedAt)} (Vilnius). Laikotarpis:{" "}
            {date(snapshot.from)}–{date(snapshot.to)}.
          </p>
          {(now - Date.parse(snapshot.generatedAt) > USAGE_MAX_AGE_MS ||
            Date.parse(snapshot.generatedAt) > now + 60000) && (
            <p className="notice">
              Suvestinė pasenusi arba kompiuterio laikas netikslus. Dabartinių
              limitų iš jos nustatyti negalima.
            </p>
          )}
          <p className="muted text-sm">
            Šaltinių aprėptis gali persidengti, todėl eilučių nesumuojame.
            Cached input įskaičiuotas į bendrą tokenų skaičių. Prenumeratos
            mokestis į usage kainą neįtrauktas.
          </p>
          <div
            className="stats-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Shared usage table"
          >
            <table className="stats-table">
              <caption>Shared usage by source and model</caption>
              <thead>
                <tr>
                  {[
                    "Service",
                    "Scope",
                    "Model",
                    "Usage records",
                    "Tokens",
                    "Cost",
                    "Status",
                  ].map((h) => (
                    <th scope="col" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshot.rows.map((r, i) => (
                  <tr key={`${r.service}:${r.scope}:${r.model}:${i}`}>
                    <th scope="row">{services[r.service]}</th>
                    <td>{scopes[r.scope]}</td>
                    <td>{r.model}</td>
                    <td>{count(r.records)}</td>
                    <td>{count(r.totalTokens)}</td>
                    <td>
                      {r.cost === null || !r.currency
                        ? "Unknown"
                        : new Intl.NumberFormat("lt-LT", {
                            style: "currency",
                            currency: r.currency,
                            maximumSignificantDigits: 4,
                          }).format(r.cost)}
                      {r.billing === "subscription_included"
                        ? " · subscription included"
                        : ""}
                    </td>
                    <td>
                      {r.status === "unavailable"
                        ? "Unavailable"
                        : r.status === "partial"
                          ? "Partial"
                          : "Reported"}
                      {r.reason ? ` (${r.reason})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="mt-5">Subscription quota</h3>
          {!currentQuotas.some((q) => q.service === "claude") && (
            <p className="muted text-sm">
              Claude quota: Unavailable. Reikia naujos Claude Code status line
              kvotos ataskaitos.
            </p>
          )}
          {!currentQuotas.some((q) => q.service === "codex") && (
            <p className="muted text-sm">Codex quota: Unknown.</p>
          )}
          {currentQuotas.map((q) => (
            <p className="text-sm" key={`${q.service}:${q.label}`}>
              {services[q.service]} · {q.label}: {number.format(q.usedPercent)}{" "}
              % panaudota.
              {q.resetsAt ? ` Atsinaujina ${date(q.resetsAt)} (Vilnius).` : ""}
              {` Stebėta ${date(q.observedAt)}.`}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
