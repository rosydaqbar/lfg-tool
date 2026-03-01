import { memo, useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { VoiceDeleteLeaderboardEntry } from "./types";

type VoiceLeaderboardCardProps = {
  selectedGuildId: string;
};

function formatDuration(totalMs: number) {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function VoiceLeaderboardCardComponent({ selectedGuildId }: VoiceLeaderboardCardProps) {
  const [rows, setRows] = useState<VoiceDeleteLeaderboardEntry[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (!selectedGuildId) return;
    let active = true;

    const load = async (showLoader: boolean) => {
      if (showLoader) setLoading(true);
      try {
        const response = await fetch(
          `/api/guilds/${selectedGuildId}/voice-delete-logs?limit=1&offset=0&includeLeaderboard=1&leaderboardLimit=20&leaderboardOffset=${page * 20}`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("Failed to load leaderboard");
        const data = (await response.json()) as {
          leaderboard: VoiceDeleteLeaderboardEntry[];
        };
        if (!active) return;
        setRows(data.leaderboard ?? []);
        setError(null);
        loadedOnce.current = true;
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      } finally {
        if (active) setLoading(false);
      }
    };

    load(!loadedOnce.current);
    const interval = setInterval(() => load(false), 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [page, selectedGuildId]);

  const canPrev = page > 0;
  const canNext = rows.length === 20;

  return (
    <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-[450ms]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-4 w-4" />
          Voice Leaderboard
        </CardTitle>
        <CardDescription>
          Peringkat total durasi voice dari seluruh log penghapusan temp channel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {loading && !loadedOnce.current ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Total Durasi</TableHead>
                <TableHead>Jumlah Sesi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item, index) => (
                <TableRow key={`leaderboard-${item.userId}`}>
                  <TableCell>{page * 20 + index + 1}</TableCell>
                  <TableCell>
                    <div className="text-sm">{item.userName || item.userId}</div>
                    <div className="text-xs font-mono text-muted-foreground">{item.userId}</div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono">{formatDuration(item.totalMs)}</span>
                  </TableCell>
                  <TableCell>{item.sessions}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-xs text-muted-foreground">Belum ada data leaderboard.</div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.max(0, prev - 1))}
            disabled={!canPrev || loading}
          >
            Sebelumnya
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={!canNext || loading}
          >
            Berikutnya
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const VoiceLeaderboardCard = memo(VoiceLeaderboardCardComponent);
