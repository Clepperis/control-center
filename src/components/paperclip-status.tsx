import { ArrowUpRight } from "@phosphor-icons/react";
import {
  formatBudget,
  type BudgetCeiling,
  type ExternalApproval,
} from "@/domain/orchestration";

// Status of a submitted Paperclip task. Missing data is an explicit notice,
// never a zero or an invented value.
export function PaperclipStatus({
  identifier,
  status,
  taskUrl,
  budgetCeiling,
  comments,
  approvals,
}: {
  identifier?: string;
  status: string | null;
  taskUrl?: string | null;
  budgetCeiling?: BudgetCeiling;
  comments?: string[];
  approvals?: ExternalApproval[] | null;
}) {
  return (
    <div className="plan-fields mt-4">
      <p>
        Kas: <strong>{identifier ?? "Paperclip užduotis"}</strong> · Būsena:{" "}
        <strong>{status ?? "dar negauta"}</strong>
      </p>
      <div>
        <h4>Kaina</h4>
        <p>
          {budgetCeiling
            ? `Prašoma biudžeto riba: ${formatBudget(budgetCeiling)}`
            : "Biudžeto riba nenustatyta."}
        </p>
        <p className="muted text-xs mt-1">
          Paperclip biudžeto sunaudojimo duomenų nėra: sutartis dar
          nepatikrinta.
        </p>
      </div>
      <div>
        <h4>Paperclip patvirtinimai</h4>
        {approvals === null || approvals === undefined ? (
          <p className="notice notice-warning" role="status">
            Patvirtinimų duomenų gauti nepavyko. Patikrinkite Paperclip.
          </p>
        ) : approvals.length ? (
          <ul className="list-disc pl-5 space-y-1">
            {approvals.map((a) => (
              <li key={a.id}>
                {a.type}: <strong>{a.status}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Patvirtinimų nėra.</p>
        )}
      </div>
      <div>
        <h4>Komentarai</h4>
        {comments === undefined ? (
          <p className="muted">Komentarų duomenų dar nėra.</p>
        ) : comments.length ? (
          comments.map((c, i) => (
            <pre className="result-text" key={i}>
              {c}
            </pre>
          ))
        ) : (
          <p className="muted">Komentarų dar nėra.</p>
        )}
      </div>
      {taskUrl ? (
        <a
          className="text-link"
          href={taskUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Atverti Paperclip užduotį
          <ArrowUpRight size={15} />
        </a>
      ) : (
        <p className="muted text-xs">
          Nuoroda į Paperclip užduotį nepasiekiama.
        </p>
      )}
    </div>
  );
}
