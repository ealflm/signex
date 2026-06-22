import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import type { RoleName } from "@signex/shared";
import { createUser } from "./actions";
import { UpdateRoleForm, DeactivateForm } from "./user-forms";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Field } from "@/components/admin/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Users } from "lucide-react";

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
      <PageHeader
        title="Users"
        subtitle="Manage admin panel users. Only admins can access this page."
      />

      {/*
        FLAG: GET /api/users is NOT implemented in the API.
        apps/api/src/users/users.controller.ts only has @Post(), @Patch(':id'),
        and @Delete(':id'). A @Get() list route + UsersService.findAll() must be
        added before this table can render live data.
      */}
      {listUnavailable && (
        <p
          role="alert"
          className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
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
        <SectionCard bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  scope="col"
                  className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Email
                </TableHead>
                <TableHead
                  scope="col"
                  className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Name
                </TableHead>
                <TableHead
                  scope="col"
                  className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Role
                </TableHead>
                <TableHead
                  scope="col"
                  className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Active
                </TableHead>
                <TableHead
                  scope="col"
                  className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Last login
                </TableHead>
                <TableHead scope="col" className="h-10 px-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow
                  key={u.id}
                  className="border-b border-border last:border-0 transition-colors duration-150 hover:bg-muted/50"
                >
                  <TableCell className="px-4 py-3 font-medium text-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {u.name}
                  </TableCell>

                  {/* Role selector — client component for pending/confirm UX */}
                  <TableCell className="px-4 py-3">
                    <UpdateRoleForm userId={u.id} currentRole={u.role} />
                  </TableCell>

                  {/* Active status badge */}
                  <TableCell className="px-4 py-3">
                    {u.isActive ? (
                      <StatusBadge tone="success">
                        <span className="size-1.5 rounded-full bg-current" aria-hidden />
                        Active
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">
                        <span className="size-1.5 rounded-full bg-current" aria-hidden />
                        Inactive
                      </StatusBadge>
                    )}
                  </TableCell>

                  {/* Last login */}
                  <TableCell className="px-4 py-3">
                    {u.lastLoginAt ? (
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {new Date(u.lastLoginAt).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Deactivate — client component for window.confirm */}
                  <TableCell className="px-4 py-3">
                    {u.isActive && (
                      <DeactivateForm userId={u.id} email={u.email} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      ) : (
        !listUnavailable && (
          <SectionCard bodyClassName="p-0">
            <EmptyState
              icon={Users}
              title="No users found."
              description="Add a user below to get started."
            />
          </SectionCard>
        )
      )}

      {/* Create user form — server action, pure server component */}
      <SectionCard title="Add new user">
        <form
          action={createUser}
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto_auto]"
        >
          <Field label="Email" htmlFor="new-email" required>
            <Input
              id="new-email"
              name="email"
              type="email"
              placeholder="user@example.com"
              required
            />
          </Field>

          <Field label="Name" htmlFor="new-name" required>
            <Input
              id="new-name"
              name="name"
              type="text"
              placeholder="Full name"
              required
            />
          </Field>

          <Field label="Role" htmlFor="new-role">
            <select
              id="new-role"
              name="role"
              defaultValue="EDITOR"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Password"
            htmlFor="new-password"
            hint="Min 8 characters"
            required
          >
            <Input
              id="new-password"
              name="password"
              type="password"
              placeholder="Min 8 characters"
              required
              minLength={8}
            />
          </Field>

          <div className="flex items-end">
            <Button type="submit">Add user</Button>
          </div>
        </form>
      </SectionCard>
    </section>
  );
}
