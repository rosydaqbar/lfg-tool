import { memo, useEffect, useRef, useState } from "react";
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
import type { TempChannel } from "./types";

type ActiveTempChannelsCardProps = {
  selectedGuildId: string;
};

function ActiveTempChannelsCardComponent({
  selectedGuildId,
}: ActiveTempChannelsCardProps) {
  const [loadingTempChannels, setLoadingTempChannels] = useState(false);
  const [tempChannels, setTempChannels] = useState<TempChannel[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tempChannelsLoadedOnce = useRef(false);

  useEffect(() => {
    if (!selectedGuildId) return;
    let active = true;

    const loadTempChannels = async (showLoader: boolean) => {
      if (showLoader) setLoadingTempChannels(true);
      try {
        const response = await fetch(
          `/api/guilds/${selectedGuildId}/temp-channels`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("Failed to load temp channels");
        const data = (await response.json()) as { tempChannels: TempChannel[] };
        if (!active) return;
        setTempChannels(data.tempChannels ?? []);
        setLoadError(null);
        tempChannelsLoadedOnce.current = true;
      } catch (err) {
        if (!active) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load temp channels"
        );
      } finally {
        if (active) setLoadingTempChannels(false);
      }
    };

    loadTempChannels(!tempChannelsLoadedOnce.current);
    const interval = setInterval(() => loadTempChannels(false), 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedGuildId]);

  return (
    <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Volume2 className="h-4 w-4" />
          Active temp channels
        </CardTitle>
        <CardDescription>
          Read-only view of Join-to-Create channels currently tracked. Refreshes every 15s.
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
                <TableHead>Owner</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>LFG message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tempChannels.map((item) => {
                const channelLink = `https://discordapp.com/channels/${selectedGuildId}/${item.channelId}`;
                const messageLink =
                  item.lfgChannelId && item.lfgMessageId
                    ? `https://discordapp.com/channels/${selectedGuildId}/${item.lfgChannelId}/${item.lfgMessageId}`
                    : null;
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
                      <div className="text-sm font-medium">
                        {item.ownerName || item.ownerId}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {item.ownerId}
                      </div>
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
