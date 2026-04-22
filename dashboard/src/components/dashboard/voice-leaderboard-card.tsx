import { memo, useRef, useState } from "react";
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
import { useAdaptivePolling } from "./use-adaptive-polling";

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
  const [debugMode, setDebugMode] = useState(false);
  const [mutatingUserId, setMutatingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  async function loadLeaderboard(showLoader: boolean) {
    if (!selectedGuildId) return true;
    if (showLoader && !loadedOnce.current) setLoading(true);
    try {
      const response = await fetch(
        `/api/guilds/${selectedGuildId}/voice-leaderboard?limit=20&offset=${page * 20}`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("Failed to load leaderboard");
      const data = (await response.json()) as {
        leaderboard: VoiceDeleteLeaderboardEntry[];
      };
      setRows(data.leaderboard ?? []);
      setError(null);
      loadedOnce.current = true;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      return false;
    } finally {
      setLoading(false);
    }
  }

  useAdaptivePolling(
    loadLeaderboard,
    [page, selectedGuildId]
  );

  async function editEntry(row: VoiceDeleteLeaderboardEntry) {
    if (!selectedGuildId) return;

    const hoursInput = window.prompt(
      `Edit total hours for ${row.userName || row.userId}`,
      (row.totalMs / 3600000).toFixed(2)
    );
    if (hoursInput === null) return;
    const parsedHours = Number(hoursInput);
    if (!Number.isFinite(parsedHours) || parsedHours < 0) {
      setError("Invalid total hours value.");
      return;
    }

    const sessionsInput = window.prompt(
      `Edit sessions for ${row.userName || row.userId}`,
      String(row.sessions)
    );
    if (sessionsInput === null) return;
    const parsedSessions = Number(sessionsInput);
    if (!Number.isFinite(parsedSessions) || parsedSessions < 0) {
      setError("Invalid sessions value.");
      return;
    }

    setMutatingUserId(row.userId);
    try {
      const response = await fetch(`/api/guilds/${selectedGuildId}/voice-leaderboard`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: row.userId,
          totalMs: Math.floor(parsedHours * 3600000),
          sessions: Math.floor(parsedSessions),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "Failed to update leaderboard entry");
      }
      await loadLeaderboard(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update leaderboard entry"
      );
    } finally {
      setMutatingUserId(null);
    }
  }

  async function deleteEntry(userId: string) {
    if (!selectedGuildId) return;
    setMutatingUserId(userId);
    try {
      const response = await fetch(`/api/guilds/${selectedGuildId}/voice-leaderboard`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "Failed to delete leaderboard entry");
      }
      await loadLeaderboard(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete leaderboard entry"
      );
    } finally {
      setMutatingUserId(null);
    }
  }

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
          Peringkat total durasi voice dari log temp channel dan sesi manual.
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
                {debugMode ? <TableHead className="text-right">Debug Actions</TableHead> : null}
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
                  {debugMode ? (
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={mutatingUserId === item.userId}
                          onClick={() => void editEntry(item)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={mutatingUserId === item.userId}
                          onClick={() => void deleteEntry(item.userId)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-xs text-muted-foreground">Belum ada data leaderboard.</div>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant={debugMode ? "default" : "ghost"}
            size="sm"
            onClick={() => setDebugMode((prev) => !prev)}
          >
            Debug
          </Button>
          <div className="flex items-center gap-2">
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
        </div>
      </CardContent>
    </Card>
  );
}

export const VoiceLeaderboardCard = memo(VoiceLeaderboardCardComponent);
