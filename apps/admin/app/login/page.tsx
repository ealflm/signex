"use client";
import { useState } from "react";
import { SectionCard } from "@/components/admin/section-card";
import { Field } from "@/components/admin/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/shell/brand-mark";
import { adminApi } from "@/app/lib/base-path";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(adminApi("/admin-api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
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
      {/* Brand lockup — matches the sidebar */}
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm"
        >
          <BrandMark className="w-[19px]" />
        </span>
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            SIGNEX
          </span>
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Admin
          </span>
        </span>
      </div>

      <SectionCard bodyClassName="p-6">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Sign in
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your credentials to access the admin panel.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="Username" htmlFor="username" required>
            <Input
              id="username"
              type="text"
              placeholder="admin"
              value={username}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
              disabled={busy}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>

          <Field label="Password" htmlFor="password" required>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              autoComplete="current-password"
              required
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={busy}
            className="mt-1 w-full"
          >
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </SectionCard>
    </main>
  );
}
