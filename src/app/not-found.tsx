import Link from "next/link";
export default function NotFound() {
  return (
    <main className="setup-page">
      <h1>Puslapis nerastas</h1>
      <p className="muted my-5">Šio adreso darbo erdvėje nėra.</p>
      <Link className="button" href="/">
        Grįžti į apžvalgą
      </Link>
    </main>
  );
}
