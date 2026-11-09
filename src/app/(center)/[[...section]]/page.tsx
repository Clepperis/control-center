import { notFound } from "next/navigation";
import { requireOwner } from "@/server/auth/session";
import { getDashboard } from "@/data/provider";
import { Overview } from "@/components/dashboard";
import { DemoChat, Projects, Agents, Automations, Knowledge, Improve, Settings } from "@/components/secondary-pages";
export default async function Page({params}:{params:Promise<{section?:string[]}>}) {
  // Guard data access too: layouts alone do not protect nested server rendering.
  let session; try { session=await requireOwner(); } catch { return null; }
  const {section=[]}=await params;
  if(section.length>1) notFound();
  const data=await getDashboard();
  switch(section[0] ?? "") {
    case "": return <Overview data={data}/>;
    case "chat": return <DemoChat/>;
    case "projects": return <Projects data={data}/>;
    case "agents": return <Agents data={data}/>;
    case "automations": return <Automations/>;
    case "knowledge": return <Knowledge demo={data.mode==="demo"}/>;
    case "improve": return <Improve demo={data.mode==="demo"}/>;
    case "settings": return <Settings data={data} authMode={session.mode}/>;
    default: notFound();
  }
}
