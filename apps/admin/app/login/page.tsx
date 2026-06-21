"use client";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/admin-api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      // Full navigation so the freshly-set cookie is visible to the (dash) server render.
      window.location.assign("/");
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError((body as { error?: string }).error ?? "Login failed");
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">SIGNEX Admin</h1>
        <p className="text-sm text-gray-500">Sign in to your account</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400
                       outline-none transition
                       focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:ring-offset-1
                       disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
            type="email"
            placeholder="you@example.com"
            value={email}
            autoComplete="username"
            required
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400
                       outline-none transition
                       focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:ring-offset-1
                       disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
            type="password"
            placeholder="••••••••"
            value={password}
            autoComplete="current-password"
            required
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white
                     outline-none transition
                     hover:bg-gray-700
                     focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2
                     disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
