import { redirect } from "next/navigation";
import { requireOwner } from "@/server/auth/session";
import { PasswordLogin } from "@/components/password-login";
import { safeDestination } from "@/server/auth/password-http";
import { getPasswordRuntime } from "@/server/auth/password-runtime";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  let signedIn = false;
  try {
    await requireOwner();
    signedIn = true;
  } catch {}
  if (signedIn) redirect("/");
  let configured = false;
  try {
    getPasswordRuntime();
    configured = true;
  } catch {}
  return (
    <main
      className="setup-page"
      style={{ maxWidth: 440, margin: "10vh auto", padding: "24px" }}
    >
      <div className="overline">Control Center</div>
      <h1 className="mt-5 text-xl font-semibold">Savininko prisijungimas</h1>
      <p className="muted mt-4">Privati darbo erdvė. Registracija išjungta.</p>
      {configured ? (
        <PasswordLogin
          destination={safeDestination((await searchParams).next)}
        />
      ) : (
        <p role="alert" className="notice mt-6">
          Prisijungimas nesukonfigūruotas. Kreipkitės į serverio operatorių.
        </p>
      )}
      <p className="muted text-xs mt-6">
        Pamiršus slaptažodį, prieigą atkuria serverio operatorius. Slaptažodžio
        pokalbyje nesiųskite.
      </p>
    </main>
  );
}
