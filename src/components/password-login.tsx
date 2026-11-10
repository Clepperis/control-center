"use client";
import { useState, type FormEvent } from "react";

export function PasswordLogin({ destination }: { destination: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const fields = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fields.get("email"),
          password: fields.get("password"),
        }),
      });
      if (!response.ok) throw new Error("login");
      // Destination was reduced to a fixed local allowlist on the server.
      window.location.replace(
        new URL(destination, window.location.origin).href,
      );
    } catch {
      setError(
        "Prisijungti nepavyko. Patikrinkite duomenis arba bandykite vėliau.",
      );
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-5 mt-8">
      <label className="grid gap-2">
        El. paštas
        <input
          className="input"
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          maxLength={254}
          required
        />
      </label>
      <label className="grid gap-2">
        Slaptažodis
        <input
          className="input"
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={10}
          maxLength={1024}
          required
        />
      </label>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <button type="submit" className="button button-primary" disabled={busy}>
        {busy ? "Jungiamasi…" : "Prisijungti"}
      </button>
    </form>
  );
}
export function PasswordLogout() {
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <button
        className="text-link text-xs"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(false);
          try {
            const response = await fetch("/api/auth/sign-out", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            if (!response.ok) throw new Error("logout");
            window.location.replace(
              new URL("/login", window.location.origin).href,
            );
          } catch {
            setError(true);
            setBusy(false);
          }
        }}
      >
        {busy ? "Atsijungiama…" : "Atsijungti"}
      </button>
      {error && (
        <span role="alert">Atsijungti nepavyko. Bandykite dar kartą.</span>
      )}
    </div>
  );
}
