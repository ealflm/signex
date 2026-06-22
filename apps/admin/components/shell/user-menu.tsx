"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(email: string): string {
  const handle = email.split("@")[0] ?? email;
  const parts = handle.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return handle.slice(0, 2).toUpperCase();
}

export function UserMenu({ email, role }: { email: string; role: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu — signed in as ${email}`}
          className="flex items-center rounded-full outline-none ring-offset-background transition-[box-shadow,opacity] duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Avatar className="size-8 border border-border">
            <AvatarFallback className="bg-muted text-xs font-semibold tabular-nums text-foreground">
              {initials(email)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60 shadow-elevated">
        <DropdownMenuLabel className="flex flex-col gap-1 py-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <UserIcon className="size-3.5 text-muted-foreground" />
            <span className="truncate">{email}</span>
          </span>
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {role}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Real HTTP POST → route handler clears the session cookie. */}
        <form action="/admin-api/auth/logout" method="post">
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full cursor-pointer">
              <LogOut className="size-4" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
