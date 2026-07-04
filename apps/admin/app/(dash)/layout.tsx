import { cookies } from "next/headers";
import { atLeast } from "@signex/shared";
import { requireSession } from "@/app/lib/session";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { Topbar } from "@/components/shell/topbar";
import { DashContent } from "@/components/shell/dash-content";

export default async function DashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  const canManageUsers = atLeast(user.role, "ADMIN");

  // Honour the persisted collapse state so the sidebar renders correctly on first paint.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar canManageUsers={canManageUsers} />
      <SidebarInset className="bg-background">
        <Topbar username={user.username} role={user.role} />
        <DashContent>{children}</DashContent>
      </SidebarInset>
    </SidebarProvider>
  );
}
