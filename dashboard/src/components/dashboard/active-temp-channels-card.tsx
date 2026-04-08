import { memo, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
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
import type { TempChannel } from "./types";
import { useAdaptivePolling } from "./use-adaptive-polling";

type ActiveTempChannelsCardProps = {
  selectedGuildId: string;
};

function ActiveTempChannelsCardComponent({
  selectedGuildId,
}: ActiveTempChannelsCardProps) {
  const [loadingTempChannels, setLoadingTempChannels] = useState(false);
  const [tempChannels, setTempChannels] = useState<TempChannel[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);
  const tempChannelsLoadedOnce = useRef(false);

  async function loadTempChannels(showLoader: boolean) {
    if (!selectedGuildId) return true;
    if (showLoader && !tempChannelsLoadedOnce.current) setLoadingTempChannels(true);
    try {
      const response = await fetch(`/api/guilds/${selectedGuildId}/temp-channels`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load temp channels");
      const data = (await response.json()) as { tempChannels: TempChannel[] };
      setTempChannels(data.tempChannels ?? []);
      setLoadError(null);
      tempChannelsLoadedOnce.current = true;
      return true;
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to load temp channels"
      );
      return false;
    } finally {
      setLoadingTempChannels(false);
    }
  }

  async function deleteDormantChannel(channelId: string) {
    if (!selectedGuildId) return;
    setDeletingChannelId(channelId);
    try {
      const response = await fetch(`/api/guilds/${selectedGuildId}/temp-channels`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channelId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Failed to delete channel");
      }
      await loadTempChannels(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete channel");
    } finally {
      setDeletingChannelId(null);
    }
  }

  useAdaptivePolling(
    loadTempChannels,
    [selectedGuildId]
  );

  return (
    <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Volume2 className="h-4 w-4" />
          Active temp channels
        </CardTitle>
        <CardDescription>
          Read-only view of Join-to-Create channels currently tracked, validated against Discord state.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : null}

        {loadingTempChannels ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : tempChannels.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Aktif saat ini</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>LFG message</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tempChannels.map((item) => {
                const channelLink = `https://discordapp.com/channels/${selectedGuildId}/${item.channelId}`;
                const messageLink =
                  item.lfgChannelId && item.lfgMessageId
                    ? `https://discordapp.com/channels/${selectedGuildId}/${item.lfgChannelId}/${item.lfgMessageId}`
                    : null;
                const status =
                  item.existsInDiscord === false
                    ? "not_found"
                    : item.existsInDiscord === null
                      ? "unknown"
                      : (item.activeCount ?? item.activeUsers?.length ?? 0) === 0
                        ? "empty"
                        : "exists";
                const canDelete = status === "not_found" || status === "empty";
                return (
                  <TableRow key={item.channelId}>
                    <TableCell>
                      <a
                        href={channelLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground transition hover:bg-muted"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                        <span className="font-mono">{item.channelId}</span>
                      </a>
                    </TableCell>
                    <TableCell>
                      {item.existsInDiscord === false ? (
                        <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                          Not found
                        </span>
                      ) : item.existsInDiscord === null ? (
                        <span className="rounded-full border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                          Unknown
                        </span>
                      ) : (item.activeCount ?? item.activeUsers?.length ?? 0) === 0 ? (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
                          Empty
                        </span>
                      ) : (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
                          Exists
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {item.ownerName || item.ownerId}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {item.ownerId}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.existsInDiscord === false ? (
                        <span className="text-xs text-muted-foreground">
                          Channel tidak ada di Discord
                        </span>
                      ) : item.activeUsers?.length ? (
                        <div className="space-y-1 text-xs">
                          {item.activeUsers.slice(0, 3).map((user) => (
                            <div key={`active-${item.channelId}-${user.userId}`}>
                              <span className="font-medium text-foreground">
                                {user.userName || user.userId}
                              </span>
                              {user.joinedAt ? (
                                <span className="text-muted-foreground">
                                  {" "}
                                  • masuk {new Date(user.joinedAt).toLocaleTimeString()}
                                </span>
                              ) : null}
                            </div>
                          ))}
                          {item.activeUsers.length > 3 ? (
                            <div className="text-muted-foreground">
                              +{item.activeUsers.length - 3} lainnya
                            </div>
                          ) : null}
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                            sumber: {item.activeSource === "discord" ? "Discord" : "DB fallback"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Tidak ada user aktif
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      {messageLink ? (
                        <a
                          href={messageLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary underline-offset-4 hover:underline"
                        >
                          Open post
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Not posted
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canDelete ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void deleteDormantChannel(item.channelId)}
                          disabled={deletingChannelId === item.channelId}
                        >
                          {deletingChannelId === item.channelId ? "Deleting..." : "Delete"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
            No active temp channels found.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const ActiveTempChannelsCard = memo(ActiveTempChannelsCardComponent);
