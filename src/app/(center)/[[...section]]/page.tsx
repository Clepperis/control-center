import { notFound } from "next/navigation";
import { requireOwner } from "@/server/auth/session";
import { getDashboard, getLiveWorkspace } from "@/data/provider";
import {
  LiveChat,
  LiveOverview,
  LiveAgents,
  RunFeed,
} from "@/components/live-workspace";
import { setupStatus } from "@/server/runtime";
import { AutomationWorkspace } from "@/components/automations";
import {
  KnowledgeWorkspace,
  ProjectKnowledgeLinks,
} from "@/components/knowledge";
import { PageHeading } from "@/components/dashboard";
import { Overview } from "@/components/dashboard";
import {
  DemoChat,
  Projects,
  Agents,
  Knowledge,
  Improve,
  Settings,
} from "@/components/secondary-pages";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  // Guard data access too: layouts alone do not protect nested server rendering.
  let session;
  try {
    session = await requireOwner();
  } catch {
    return null;
  }
  const { section = [] } = await params;
  if (section.length > 1) notFound();
  const live =
    process.env.DATA_MODE !== "demo" ? await getLiveWorkspace() : null;
  const data = live?.data ?? (await getDashboard());
  if (live) {
    if (!section[0]) return <LiveOverview {...live} />;
    if (section[0] === "chat") return <LiveChat setup={setupStatus()} />;
    if (section[0] === "agents") return <LiveAgents />;
    if (section[0] === "knowledge") return <KnowledgeWorkspace />;
    if (section[0] === "projects")
      return (
        <>
          <PageHeading
            eyebrow="Projektai ir užduotys"
            title="Deleguotų darbų peržiūra"
            description="Čia rodomi programos planai ir susietos Paperclip užduotys. Išorinio darbo būseną valdo Paperclip."
          />
          <ProjectKnowledgeLinks />
          {live.error && <p className="notice mb-5">{live.error}</p>}
          <RunFeed runs={live.runs} />
          {!live.runs.length && (
            <p className="muted">
              Išsaugotų planų nėra. Pirmą užduotį apibrėžkite pokalbyje.
            </p>
          )}
        </>
      );
  }
  switch (section[0] ?? "") {
    case "":
      return <Overview data={data} />;
    case "chat":
      return <DemoChat />;
    case "projects":
      return <Projects data={data} />;
    case "agents":
      return <Agents data={data} />;
    case "automations":
      return <AutomationWorkspace live={data.mode === "live"} />;
    case "knowledge":
      return <Knowledge demo={data.mode === "demo"} />;
    case "improve":
      return <Improve demo={data.mode === "demo"} />;
    case "settings":
      return <Settings data={data} authMode={session.mode} />;
    default:
      notFound();
  }
}
