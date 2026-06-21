import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import type { RoleName } from "@signex/shared";
import { createUser } from "./actions";
import { UpdateRoleForm, DeactivateForm } from "./user-forms";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: RoleName;
  isActive: boolean;
  lastLoginAt: string | null;
}

const ROLES: RoleName[] = ["EDITOR", "PUBLISHER", "ADMIN"];

export default async function UsersPage() {
  await requireRole("ADMIN");

  // GET /api/users — may be absent (endpoint not yet implemented in the API);
  // handle gracefully so the page still renders the Create form.
  const res = await apiServer<UserRow[]>("/api/users");
  const users = res.ok ? res.data : [];
  const listUnavailable = !res.ok;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500">
          Manage admin panel users. Only admins can access this page.
        </p>
      </div>

      {/*
        FLAG: GET /api/users is NOT implemented in the API.
        apps/api/src/users/users.controller.ts only has @Post(), @Patch(':id'),
        and @Delete(':id'). A @Get() list route + UsersService.findAll() must be
        added before this table can render live data.
      */}
      {listUnavailable && (
        <p
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          User list unavailable —{" "}
          <code className="font-mono">GET /api/users</code> is not yet
          implemented in the API. Add a{" "}
          <code className="font-mono">@Get()</code> list route to{" "}
          <code className="font-mono">UsersController</code> to enable the
          table.
        </p>
      )}

      {/* User list table */}
      {users.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.email}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.name}</td>

                  {/* Role selector — client component for pending/confirm UX */}
                  <td className="px-4 py-3">
                    <UpdateRoleForm userId={u.id} currentRole={u.role} />
                  </td>

                  {/* Active status badge */}
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.isActive
                          ? "inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20"
                          : "inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
                      }
                    >
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>

                  {/* Last login */}
                  <td className="px-4 py-3 text-gray-500">
                    {u.lastLoginAt ? (
                      new Date(u.lastLoginAt).toLocaleString()
                    ) : (
                      <span className="text-gray-400">Never</span>
                    )}
                  </td>

                  {/* Deactivate — client component for window.confirm */}
                  <td className="px-4 py-3">
                    {u.isActive && (
                      <DeactivateForm userId={u.id} email={u.email} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !listUnavailable && (
          <p className="rounded-lg border border-gray-100 bg-white px-6 py-8 text-center text-sm text-gray-400 shadow-sm">
            No users found.
          </p>
        )
      )}

      {/* Create user form — server action, pure server component */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">
          Add new user
        </h2>
        <form
          action={createUser}
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto_auto]"
        >
          <div className="flex flex-col gap-1">
            <label
              htmlFor="new-email"
              className="text-xs font-medium text-gray-700"
            >
              Email
            </label>
            <input
              id="new-email"
              name="email"
              type="email"
              placeholder="user@example.com"
              required
              className="rounded border border-gray-300 px-2 py-1.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="new-name"
              className="text-xs font-medium text-gray-700"
            >
              Name
            </label>
            <input
              id="new-name"
              name="name"
              type="text"
              placeholder="Full name"
              required
              className="rounded border border-gray-300 px-2 py-1.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="new-role"
              className="text-xs font-medium text-gray-700"
            >
              Role
            </label>
            <select
              id="new-role"
              name="role"
              defaultValue="EDITOR"
              className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="new-password"
              className="text-xs font-medium text-gray-700"
            >
              Password{" "}
              <span className="font-normal text-gray-400">(min 8 chars)</span>
            </label>
            <input
              id="new-password"
              name="password"
              type="password"
              placeholder="Min 8 characters"
              required
              minLength={8}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white
                         transition-colors hover:bg-gray-700
                         focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1"
            >
              Add user
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
