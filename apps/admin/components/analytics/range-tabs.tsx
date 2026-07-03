// components/analytics/range-tabs.tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PRESETS = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];

export function RangeTabs({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setRange = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("range", value);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <Tabs value={current} onValueChange={setRange}>
      <TabsList className="h-8 bg-muted/60">
        {PRESETS.map((p) => (
          <TabsTrigger key={p.value} value={p.value} className="data-[state=active]:text-primary">
            {p.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
