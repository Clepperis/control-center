"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="panel p-8">
      <h1>Nepavyko įkelti duomenų</h1>
      <p className="muted my-5">
        Patikrinkite vietinę konfigūraciją ir bandykite dar kartą. Joks išorinis
        darbas nebuvo pakartotas.
      </p>
      <button className="button" onClick={reset}>
        Bandyti įkelti dar kartą
      </button>
    </div>
  );
}
