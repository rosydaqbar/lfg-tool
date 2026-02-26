import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Volume2 } from "lucide-react";
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
import type { TempVoiceDeleteLog } from "./types";

type VoiceLogDeletedCardProps = {
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

function VoiceLogDeletedCardComponent({
  selectedGuildId,
}: VoiceLogDeletedCardProps) {
  const [deleteLogs, setDeleteLogs] = useState<TempVoiceDeleteLog[]>([]);
  const [loadingDeleteLogs, setLoadingDeleteLogs] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const deleteLogsLoadedOnce = useRef(false);

  useEffect(() => {
    if (!selectedGuildId) return;
    let active = true;

    const loadDeleteLogs = async (showLoader: boolean) => {
      if (showLoader) setLoadingDeleteLogs(true);
      try {
        const response = await fetch(
          `/api/guilds/${selectedGuildId}/voice-delete-logs?limit=5&offset=0`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("Failed to load delete logs");
        const data = (await response.json()) as { deleteLogs: TempVoiceDeleteLog[] };
        if (!active) return;
        setDeleteLogs(data.deleteLogs ?? []);
        setLoadError(null);
        deleteLogsLoadedOnce.current = true;
      } catch (err) {
        if (!active) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load delete logs"
        );
      } finally {
        if (active) setLoadingDeleteLogs(false);
      }
    };

    loadDeleteLogs(!deleteLogsLoadedOnce.current);
    const interval = setInterval(() => loadDeleteLogs(false), 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedGuildId]);

  return (
    <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-[400ms]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Volume2 className="h-4 w-4" />
          Voice Log
        </CardTitle>
        <CardDescription>
          Log permanen channel temp yang sudah terhapus karena kosong, termasuk history durasi user.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : null}

        {loadingDeleteLogs ? (
          <div className="space-y-2">
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
                      {log.history.slice(0, 15).map((item) => (
                        <div
                          key={`delete-history-${log.id}-${item.userId}`}
                          className="text-xs text-muted-foreground"
                        >
                          <span className="font-mono text-foreground">{item.userId}</span>
                          {" "}• total:{" "}
                          <span className="font-mono">{formatDuration(item.totalMs)}</span>
                        </div>
                      ))}
                      {log.history.length > 15 ? (
                        <div className="text-xs text-muted-foreground">
                          ...dan {log.history.length - 15} lainnya
                        </div>
                      ) : null}
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
            Belum ada log penghapusan temp channel.
          </div>
        )}

        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link href="/voice-log">Lihat semua Voice Log</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const VoiceLogDeletedCard = memo(VoiceLogDeletedCardComponent);
