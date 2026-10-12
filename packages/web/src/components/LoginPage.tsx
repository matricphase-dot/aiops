import { useState } from "react";
import { setToken } from "../auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const body = (await res.json()) as { token?: string };
        if (body.token) {
          setToken(body.token);
          window.location.reload();
          return;
        }
        setError("invalid credentials");
      } else {
        // Same message for wrong email, wrong password, even rate-limit
        // ambiguity — never broadcast which part failed.
        setError("invalid credentials");
      }
    } catch {
      setError("invalid credentials");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-950">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/70 p-8 shadow-xl shadow-black/40"
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          <span className="text-sm font-semibold tracking-wide text-zinc-200">
            aiops-cockpit
          </span>
        </div>
        <p className="text-xs text-zinc-500">Sign in to operate the cockpit.</p>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          autoComplete="email"
          className="w-full rounded-md bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none ring-1 ring-zinc-800 placeholder:text-zinc-600 focus:ring-sky-600"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoComplete="current-password"
          className="w-full rounded-md bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none ring-1 ring-zinc-800 placeholder:text-zinc-600 focus:ring-sky-600"
        />

        {error && (
          <p className="rounded-md bg-red-950/60 px-3 py-2 text-xs text-red-300 ring-1 ring-red-900/60">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !email || !password}
          className="w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
