import { PageHeading } from "./dashboard";
import type {
  UsageBucket,
  UsageStatistics,
} from "@/server/observability/stats";

const SOURCE_LABEL: Record<string, string> = {
  chat: "Pokalbis",
  knowledge: "Žinių klausimai",
  improvement: "Tobulinti sistemą",
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
            <th scope="col">Užklausos</th>
            <th scope="col">Klaidos</th>
            <th scope="col">Žetonai</th>
            <th scope="col">nexos kreditai</th>
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
        description="Modelių užklausos, klaidos, žetonai ir nexos kreditai pagal teikėjo ataskaitas. Kainos skaičiuojamos tik po užklausos."
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
    ["Užklausos", number.format(stats.totals.calls)],
    ["Klaidos", number.format(stats.totals.errors)],
    ["Žetonai", number.format(stats.totals.totalTokens)],
    ["nexos kreditai", credits.format(stats.totals.credits)],
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
            caption="Pagal paskirtį"
            heading="Paskirtis"
            rows={stats.bySource}
            label={(key) => SOURCE_LABEL[key] ?? key}
          />
          <UsageTable
            caption="Pagal modelį"
            heading="Modelis"
            rows={stats.byModel}
          />
          <UsageTable
            caption="Pagal dieną"
            heading="Diena"
            rows={stats.byDay}
          />
        </>
      )}
    </>
  );
}
