"use client";

import { useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ThemeListItem } from "@/app/lib/themes";

interface ThemeSwitcherProps {
  themes: ThemeListItem[];
  activeThemeId: string | null;
}

export function ThemeSwitcher({ themes, activeThemeId }: ThemeSwitcherProps) {
  const router = useRouter();
  const activeTheme = themes.find((t) => t.id === activeThemeId);
  const label = activeTheme?.name ?? "Select theme";

  async function handleSelect(themeId: string) {
    await fetch("/admin-api/active-theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId }),
    });
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={themes.length === 0}>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <span className="max-w-[120px] truncate">{label}</span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuRadioGroup value={activeThemeId ?? ""} onValueChange={handleSelect}>
          {themes.map((theme) => (
            <DropdownMenuRadioItem key={theme.id} value={theme.id}>
              <span className="flex flex-1 items-center justify-between gap-2">
                <span className="truncate">{theme.name}</span>
                {theme.isLive && (
                  <Badge variant="default" className="ml-auto h-4 px-1 py-0 text-[10px]">
                    Live
                  </Badge>
                )}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
