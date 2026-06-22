import Link from "next/link";
import { requireSession } from "@/app/lib/session";
import { atLeast } from "@signex/shared";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top navigation bar */}
      <header className="border-b border-gray-200 bg-white">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex max-w-screen-xl items-center gap-1 px-4 py-0 text-sm"
        >
          {/* Brand */}
          <Link
            href="/"
            className="mr-4 py-3 font-semibold text-gray-900 outline-none
                       focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 rounded"
          >
            SIGNEX Admin
          </Link>

          {/* Nav links */}
          {(
            [
              { href: "/releases", label: "Releases" },
              { href: "/catalog", label: "Catalog" },
              { href: "/content/hero", label: "Content" },
              { href: "/media", label: "Media" },
            ] as { href: string; label: string }[]
          ).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded px-3 py-3 font-medium text-gray-600 transition-colors
                         hover:bg-gray-50 hover:text-gray-900
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1"
            >
              {label}
            </Link>
          ))}

          {atLeast(user.role, "ADMIN") && (
            <Link
              href="/users"
              className="rounded px-3 py-3 font-medium text-gray-600 transition-colors
                         hover:bg-gray-50 hover:text-gray-900
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1"
            >
              Users
            </Link>
          )}

          {/* Right-side: user info + logout */}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-gray-500" aria-label={`Signed in as ${user.email}, role ${user.role}`}>
              <span className="font-medium text-gray-700">{user.email}</span>
              <span className="mx-1 text-gray-300">·</span>
              <span className="uppercase tracking-wide text-gray-400">{user.role}</span>
            </span>

            {/* POST to the logout handler — form ensures real HTTP POST; handler clears cookie */}
            <form action="/admin-api/auth/logout" method="post">
              <button
                type="submit"
                aria-label="Sign out"
                className="rounded px-2 py-1.5 text-xs font-medium text-red-600 transition-colors
                           hover:bg-red-50
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1"
              >
                Logout
              </button>
            </form>
          </div>
        </nav>
      </header>

      {/* Page content */}
      <main className="mx-auto w-full max-w-screen-xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
