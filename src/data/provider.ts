import "server-only";
import { demoDashboard } from "./demo";
import type { Dashboard } from "@/domain/models";
import { requireOwner } from "@/server/auth/session";
import { getStore, setupStatus, taskUrl } from "@/server/runtime";
import { toRun } from "@/server/orchestration/store";
import { isStale } from "@/domain/orchestration";

export interface DashboardRepository {
  getDashboard(): Promise<Dashboard>;
}
export const demoRepository: DashboardRepository = {
  async getDashboard() {
    return structuredClone(demoDashboard);
  },
};
export async function getDashboard(): Promise<Dashboard> {
  await requireOwner();
  if (process.env.DATA_MODE === "demo") return demoRepository.getDashboard();
  return {
    mode: "live",
    projects: [],
    tasks: [],
    decisions: [],
    activity: [],
    agents: [],
    connections: demoDashboard.connections.map((c) => ({
      ...c,
      state: {
        kind: "disconnected",
        detail: "Programos ryšys dar nepatikrintas.",
      },
    })),
  };
}
export async function getLiveWorkspace() {
  const owner = await requireOwner();
  const data: Dashboard = {
    mode: "live",
    projects: [],
    tasks: [],
    decisions: [],
    activity: [],
    agents: [],
    connections: [],
  };
  const setup = setupStatus();
  let runs: ReturnType<typeof toRun>[] = [];
  let error: string | undefined;
  let checks: Record<string, unknown>[] = [];
  try {
    const store = getStore();
    runs = (
      await store.db.query(
        "SELECT r.* FROM orchestration_runs r JOIN conversations c ON c.id=r.conversation_id WHERE c.owner_subject=$1 ORDER BY r.created_at DESC LIMIT 50",
        [owner.subject],
      )
    ).rows.map(toRun);
    checks = (await store.db.query("SELECT * FROM connection_checks")).rows;
    data.activity = (
      await store.db.query(
        "SELECT m.id,m.role,m.content,m.created_at FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.owner_subject=$1 ORDER BY m.created_at DESC LIMIT 5",
        [owner.subject],
      )
    ).rows.map((r) => ({
      id: r.id as string,
      title:
        r.role === "user"
          ? "Išsaugota jūsų žinutė"
          : "Išsaugotas modelio atsakymas",
      detail: (r.content as string).slice(0, 100),
      time: new Date(r.created_at as string).toLocaleString("lt-LT", {
        timeZone: "Europe/Vilnius",
      }),
    }));
  } catch {
    error = setup.database
      ? "PostgreSQL nepasiekiamas arba trūksta migracijų. Vykdymų būsena nežinoma."
      : "Operaciniams duomenims reikia PostgreSQL. Nurodykite DATABASE_URL ir pritaikykite migracijas.";
  }
  for (const [id, name, purpose, detail] of [
    ["nexos", "nexos.ai", "Modelių prieiga", setup.model],
    ["paperclip", "Paperclip", "Deleguoti agentų darbai", setup.paperclip],
  ]) {
    const check = checks.find((c) => c.service === id);
    const checked = check?.checked_at
      ? new Date(check.checked_at as string).toISOString()
      : null;
    data.connections.push({
      id,
      name,
      purpose,
      state: check?.error_code
        ? {
            kind: "unavailable",
            detail:
              "Paskutinė programos užklausa nepavyko. Patikrinkite konfigūraciją.",
          }
        : checked && !isStale(checked)
          ? {
              kind: "verified",
              detail:
                "Programos užklausa patikrinta. Tai ne kito vykdymo sėkmės garantija.",
              checkedAt: checked,
            }
          : {
              kind: checked ? "unavailable" : "disconnected",
              detail: checked
                ? `Paskutinė patikra pasenusi (${checked}). Reikia sutikrinti.`
                : detail,
            },
    });
  }
  data.connections.push(
    {
      id: "n8n",
      name: "n8n",
      purpose: "Automatizacijos",
      state: {
        kind: "disconnected",
        detail: "Integracija numatyta kitam etapui.",
      },
    },
    {
      id: "knowledge",
      name: "Markdown",
      purpose: "Patvirtintos žinios",
      state: {
        kind: "disconnected",
        detail: "Privatus žinių katalogas dar neprijungtas.",
      },
    },
  );
  return {
    data,
    runs: runs.map((r) => ({
      ...r,
      taskUrl: r.result?.identifier ? taskUrl(r.result.identifier) : null,
    })),
    error,
  };
}
