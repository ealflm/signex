"use client";

import * as React from "react";
import { Search } from "lucide-react";

/**
 * Command-style search affordance. Looks like a search field; wired as a
 * non-blocking stub for now (focus ring + ⌘K hint). Cmd/Ctrl-K focuses it.
 */
export function SearchButton() {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative hidden w-full max-w-sm sm:block">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={inputRef}
        type="search"
        placeholder="Search…"
        aria-label="Search"
        className="h-9 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-12 text-sm text-foreground outline-none transition-[background-color,box-shadow,border-color] duration-150 placeholder:text-muted-foreground hover:bg-muted/60 focus-visible:border-ring focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring"
      />
      <kbd
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 select-none items-center gap-0.5 rounded border border-border bg-card px-1.5 font-mono text-[10px] font-medium text-muted-foreground md:inline-flex"
      >
        ⌘K
      </kbd>
    </div>
  );
}
