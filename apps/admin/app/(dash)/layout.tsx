import { cookies } from "next/headers";
import { atLeast } from "@signex/shared";
import { requireSession } from "@/app/lib/session";
import { ACTIVE_THEME_COOKIE, listThemes } from "@/app/lib/themes";
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
  const activeThemeId = cookieStore.get(ACTIVE_THEME_COOKIE)?.value ?? null;
  const themes = await listThemes();

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar canManageUsers={canManageUsers} />
      <SidebarInset className="bg-background">
        <Topbar email={user.email} role={user.role} themes={themes} activeThemeId={activeThemeId} />
        <DashContent>{children}</DashContent>
      </SidebarInset>
    </SidebarProvider>
  );
}
