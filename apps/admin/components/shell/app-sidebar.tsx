"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Rocket,
  Package,
  FileText,
  Image as ImageIcon,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Prefix used to compute the active state (so child routes light up the parent). */
  match: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, match: "/" },
  { href: "/releases", label: "Releases", icon: Rocket, match: "/releases" },
  { href: "/catalog", label: "Catalog", icon: Package, match: "/catalog" },
  { href: "/content/hero", label: "Content", icon: FileText, match: "/content" },
  { href: "/media", label: "Media", icon: ImageIcon, match: "/media" },
];

const ADMIN_ITEM: NavItem = {
  href: "/users",
  label: "Users",
  icon: Users,
  match: "/users",
};

function isActive(pathname: string, match: string): boolean {
  if (match === "/") return pathname === "/";
  return pathname === match || pathname.startsWith(`${match}/`);
}

export function AppSidebar({ canManageUsers }: { canManageUsers: boolean }) {
  const pathname = usePathname();
  const items = canManageUsers ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

  return (
    <Sidebar collapsible="icon" className="border-border">
      <SidebarHeader className="h-14 justify-center px-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md px-1 py-1 outline-none transition-opacity duration-150 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="SIGNEX Admin home"
        >
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm"
          >
            <BrandMark />
          </span>
          <span className="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
              SIGNEX
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Admin
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup>
          <SidebarGroupLabel className="uppercase tracking-[0.1em] text-muted-foreground/80">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label="Primary">
              <SidebarMenu className="gap-0.5">
                {items.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(pathname, item.match)} />
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const { setOpenMobile, isMobile } = useSidebar();
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.label}
        className={
          // Active: subtle accent tint + accent text + a left indicator bar — not a loud fill.
          "relative h-9 font-medium text-sidebar-foreground/75 transition-colors duration-150 " +
          "data-[active=true]:bg-primary/8 data-[active=true]:font-medium data-[active=true]:text-primary " +
          "data-[active=true]:before:absolute data-[active=true]:before:inset-y-1.5 data-[active=true]:before:left-0 " +
          "data-[active=true]:before:w-0.5 data-[active=true]:before:rounded-full data-[active=true]:before:bg-primary " +
          "[&_svg]:data-[active=true]:text-primary"
        }
      >
        <Link href={item.href} onClick={() => isMobile && setOpenMobile(false)}>
          <Icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Tiny geometric "S" mark — two interlocking strokes, drawn in currentColor. */
function BrandMark() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="text-primary-foreground"
    >
      <path
        d="M11.5 4.2C10.7 3.3 9.5 3 8.2 3 6 3 4.6 4.1 4.6 5.7c0 1.5 1.2 2.2 3.2 2.6 2 .4 2.6.8 2.6 1.6 0 .8-.8 1.4-2.2 1.4-1.4 0-2.5-.5-3.3-1.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
