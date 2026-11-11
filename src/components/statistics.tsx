import { PageHeading } from "./dashboard";
import type {
  UsageBucket,
  UsageStatistics,
} from "@/server/observability/stats";

const SOURCE_LABEL: Record<string, string> = {
  chat: "Chat",
  knowledge: "Knowledge",
  improvement: "Platform Engineer",
};
const number = new Intl.NumberFormat("lt-LT");
const credits = new Intl.NumberFormat("lt-LT", { maximumFractionDigits: 6 });

function UsageTable({
  caption,
  heading,
  rows,
  label = (key) => key,
}: {
  caption: string;
  heading: string;
  rows: UsageBucket[];
  label?: (key: string) => string;
}) {
  return (
    <div className="stats-table-wrap">
      <table className="stats-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{heading}</th>
            <th scope="col">Requests</th>
            <th scope="col">Errors</th>
            <th scope="col">Tokens</th>
            <th scope="col">Credits</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{label(r.key)}</th>
              <td>{number.format(r.calls)}</td>
              <td>{number.format(r.errors)}</td>
              <td>{number.format(r.totalTokens)}</td>
              <td>{credits.format(r.credits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UsageStatisticsView({
  stats,
}: {
  stats: UsageStatistics | null;
}) {
  return (
    <>
      <PageHeading
        eyebrow="Stebėsena"
        title="Statistika"
        description="Model requests, errors, tokens ir nexos credits pagal teikėjo ataskaitas. Kaina žinoma tik po užklausos."
      />
      <UsageStatisticsBody stats={stats} />
    </>
  );
}

export function UsageStatisticsBody({
  stats,
}: {
  stats: UsageStatistics | null;
}) {
  if (!stats)
    return (
      <>
        <p className="notice">
          Statistika rodoma tik veikiant su PostgreSQL duomenų baze ir
          pritaikius migraciją 007. Demonstraciniame režime modelių užklausų
          nėra.
        </p>
      </>
    );
  const tiles = [
    ["Requests", number.format(stats.totals.calls)],
    ["Errors", number.format(stats.totals.errors)],
    ["Tokens", number.format(stats.totals.totalTokens)],
    ["Credits", credits.format(stats.totals.credits)],
  ];
  return (
    <>
      <p className="muted text-sm mb-4">
        Paskutinės {stats.days} dienos (UTC).
      </p>
      <dl className="stats-tiles">
        {tiles.map(([label, value]) => (
          <div className="panel stats-tile" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {stats.totals.calls === 0 ? (
        <p className="muted">Šiuo laikotarpiu modelio užklausų nebuvo.</p>
      ) : (
        <>
          <UsageTable
            caption="By source"
            heading="Source"
            rows={stats.bySource}
            label={(key) => SOURCE_LABEL[key] ?? key}
          />
          <UsageTable caption="By model" heading="Model" rows={stats.byModel} />
          <UsageTable caption="By day (UTC)" heading="Day" rows={stats.byDay} />
        </>
      )}
    </>
  );
}
