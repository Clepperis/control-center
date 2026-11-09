import { requireOwner } from "@/server/auth/session";
import { Shell } from "@/components/shell";
import { DemoWorkspace } from "@/components/demo-workspace";
export const dynamic = "force-dynamic";
export default async function CenterLayout({children}:{children:React.ReactNode}) {
  let session;
  try { session=await requireOwner(); } catch { return <main className="setup-page"><div className="overline">Control Center</div><h1 className="mt-5">Reikia sukonfigūruoti prieigą</h1><p className="muted mt-5">Ši erdvė skirta vienam savininkui. Prisijunkite per patikimą OIDC prieigos tarpininką.</p><p className="muted mt-4">Vietiniam kūrimui: nukopijuokite .env.example į .env.local ir paleiskite npm run dev. Kūrimo režimas produkcijoje neveikia.</p></main>; }
  return <Shell mode={process.env.DATA_MODE==="demo" ? "demo" : "live"} authMode={session.mode}><DemoWorkspace>{children}</DemoWorkspace></Shell>;
}
