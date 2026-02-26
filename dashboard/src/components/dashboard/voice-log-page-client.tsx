"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TempVoiceDeleteLog } from "@/components/dashboard/types";

const PAGE_SIZE = 25;

function formatDuration(totalMs: number) {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function VoiceLogPageClient({ selectedGuildId }: { selectedGuildId: string }) {
  const [page, setPage] = useState(0);
  const [deleteLogs, setDeleteLogs] = useState<TempVoiceDeleteLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const offset = page * PAGE_SIZE;
    fetch(
      `/api/guilds/${selectedGuildId}/voice-delete-logs?limit=${PAGE_SIZE}&offset=${offset}`,
      { cache: "no-store" }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load voice log data");
        return response.json() as Promise<{ deleteLogs: TempVoiceDeleteLog[] }>;
      })
      .then((data) => {
        if (!active) return;
        setDeleteLogs(data.deleteLogs ?? []);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load voice log data");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, selectedGuildId]);

  const canGoPrev = page > 0;
  const canGoNext = useMemo(
    () => deleteLogs.length === PAGE_SIZE,
    [deleteLogs.length]
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[var(--font-display)] text-3xl text-foreground">Voice Log</h1>
          <p className="text-sm text-muted-foreground">
            Riwayat permanen temp channel yang terhapus karena kosong.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Dashboard
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Volume2 className="h-4 w-4" />
            Temp Voice Channel Deleted Logs
          </CardTitle>
          <CardDescription>
            Halaman {page + 1} • Menampilkan sampai {PAGE_SIZE} item per halaman.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : deleteLogs.length ? (
            <div className="space-y-4">
              {deleteLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-border bg-muted/30 p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <Badge variant="secondary" className="rounded-full px-3 py-1">
                      Channel: {log.channelName || "(unknown)"}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground">
                      {log.channelId}
                    </span>
                    <Badge variant="secondary" className="rounded-full px-3 py-1">
                      Owner: {log.ownerId}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Deleted: {new Date(log.deletedAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">History</div>
                    {log.history.length ? (
                      <div className="space-y-1">
                        {log.history.map((item) => (
                          <div
                            key={`delete-history-full-${log.id}-${item.userId}`}
                            className="text-xs text-muted-foreground"
                          >
                            <span className="font-mono text-foreground">{item.userId}</span>
                            {" "}• total:{" "}
                            <span className="font-mono">{formatDuration(item.totalMs)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Tidak ada riwayat user</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
              Tidak ada data untuk halaman ini.
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.max(0, prev - 1))}
              disabled={!canGoPrev || loading}
            >
              Sebelumnya
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={!canGoNext || loading}
            >
              Berikutnya
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
