import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchButton } from "./search-button";
import { UserMenu } from "./user-menu";

interface TopbarProps {
  username: string;
  role: string;
}

export function Topbar({ username, role }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
      <Separator orientation="vertical" className="mr-1 hidden h-5 sm:block" />

      <div className="flex flex-1 items-center">
        <SearchButton />
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <UserMenu username={username} role={role} />
      </div>
    </header>
  );
}
