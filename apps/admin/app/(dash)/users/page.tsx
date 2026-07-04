import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import type { RoleName } from "@signex/shared";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/app/lib/format";
import { InviteUserDialog } from "./user-invite-dialog";
import { UserRowMenu } from "./user-controls";
import { countActiveAdmins, isLastActiveAdmin } from "./user-policy";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  username: string;
  name: string;
  role: RoleName;
  isActive: boolean;
  lastLoginAt: string | null;
}

const ROLE_LABEL: Record<RoleName, string> = {
  EDITOR: "Editor",
  PUBLISHER: "Publisher",
  ADMIN: "Admin",
};

// Signature: the avatar is tinted by access level, so the roster reads at a glance — more access,
// more colour (Editor neutral → Publisher tinted → Admin filled). Semantic tokens only.
const ROLE_AVATAR: Record<RoleName, string> = {
  ADMIN: "bg-primary text-primary-foreground",
  PUBLISHER: "bg-primary/10 text-primary",
  EDITOR: "bg-muted text-muted-foreground",
};

function initials(name: string, username: string): string {
  const base = (name || username).trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0]! + parts[1][0]!).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

const TH = "h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground";

export default async function UsersPage() {
  const me = await requireRole("ADMIN");

  const res = await apiServer<UserRow[]>("/api/users");
  const users = res.ok ? res.data : [];
  const listUnavailable = !res.ok;
  const activeAdminCount = countActiveAdmins(users);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        subtitle="People who can sign in to this admin and what they're allowed to do."
        actions={<InviteUserDialog />}
      />

      {listUnavailable && (
        <p
          role="alert"
          className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          Couldn&apos;t load the user list — the API may be unavailable. You can still add a user.
        </p>
      )}

      {users.length > 0 ? (
        <SectionCard bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className={TH}>
                  Member
                </TableHead>
                <TableHead scope="col" className={TH}>
                  Role
                </TableHead>
                <TableHead scope="col" className={TH}>
                  Status
                </TableHead>
                <TableHead scope="col" className={TH}>
                  Last seen
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
                  className={cn(
                    "border-b border-border transition-colors duration-150 last:border-0 hover:bg-muted/50",
                    !u.isActive && "opacity-60",
                  )}
                >
                  {/* Member — avatar (role-tinted) + name + username */}
                  <TableCell className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar>
                        <AvatarFallback className={cn("font-medium", ROLE_AVATAR[u.role])}>
                          {initials(u.name, u.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">
                          {u.name || "—"}
                        </span>
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {u.username}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  {/* Role label (changed via the ⋯ menu) */}
                  <TableCell className="px-4 py-3">
                    <Badge variant="outline" className="font-normal">
                      {ROLE_LABEL[u.role]}
                    </Badge>
                  </TableCell>

                  {/* Status */}
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

                  {/* Last seen — relative, full date on hover */}
                  <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                    {u.lastLoginAt ? (
                      <span title={new Date(u.lastLoginAt).toLocaleString()}>
                        {formatRelativeTime(u.lastLoginAt)}
                      </span>
                    ) : (
                      "Never"
                    )}
                  </TableCell>

                  {/* Row actions */}
                  <TableCell className="px-4 py-3 text-right">
                    <UserRowMenu
                      userId={u.id}
                      username={u.username}
                      role={u.role}
                      isActive={u.isActive}
                      isSelf={u.id === me.id}
                      isLastActiveAdmin={isLastActiveAdmin(u, activeAdminCount)}
                    />
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
              title="No users yet"
              description="Add someone with the “Add user” button to get started."
            />
          </SectionCard>
        )
      )}
    </section>
  );
}
