// components/analytics/tables.tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/app/lib/format";
import type { AttributionRow, CampaignStat } from "@signex/shared";

export function CampaignsTable({ rows }: { rows: CampaignStat[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Campaign</TableHead>
          <TableHead className="text-right">Sessions</TableHead>
          <TableHead className="text-right">Leads</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((r) => (
            <TableRow key={r.campaign}>
              <TableCell className="text-foreground">{r.campaign}</TableCell>
              <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                {formatNumber(r.sessions)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                {formatNumber(r.leads)}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
              No data yet
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export function AttributionTable({ rows }: { rows: AttributionRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Channel</TableHead>
          <TableHead className="text-right">Leads</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="text-foreground">{r.key}</TableCell>
              <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                {formatNumber(r.leads)}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={2} className="py-6 text-center text-sm text-muted-foreground">
              No data yet
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
