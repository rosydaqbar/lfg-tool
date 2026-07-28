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
import { StatusBadge } from "@/components/status-badge";
import { dashboardCard, dashboardEmpty, dashboardError } from "@/components/ui/patterns";
import { useDashboardI18n } from "@/components/dashboard/dashboard-i18n";
import type { TempChannel } from "./types";
import { useAdaptivePolling } from "./use-adaptive-polling";

type ActiveTempChannelsCardProps = {
  selectedGuildId: string;
};

function ActiveTempChannelsCardComponent({
  selectedGuildId,
}: ActiveTempChannelsCardProps) {
  const { locale, t } = useDashboardI18n();
  const dateLocale = locale === "id" ? "id-ID" : "en-US";
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
      if (!response.ok) {
        throw new Error(
          t("detail.activeTemp.errors.load", "Failed to load temp channels")
        );
      }
      const data = (await response.json()) as { tempChannels: TempChannel[] };
      setTempChannels(data.tempChannels ?? []);
      setLoadError(null);
      tempChannelsLoadedOnce.current = true;
      return true;
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : t("detail.activeTemp.errors.load", "Failed to load temp channels")
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
        throw new Error(
          payload?.error ||
            t("detail.activeTemp.errors.delete", "Failed to delete channel")
        );
      }
      await loadTempChannels(false);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : t("detail.activeTemp.errors.delete", "Failed to delete channel")
      );
    } finally {
      setDeletingChannelId(null);
    }
  }

  useAdaptivePolling(
    loadTempChannels,
    [selectedGuildId]
  );

  return (
    <Card className={`${dashboardCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-300`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Volume2 className="h-4 w-4" />
          {t("detail.activeTemp.title", "Active temp channels")}
        </CardTitle>
        <CardDescription>
          {t(
            "detail.activeTemp.description",
            "Read-only view of Join-to-Create channels currently tracked, validated against Discord state."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <div className={dashboardError}>
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
                <TableHead>{t("detail.activeTemp.columns.channel", "Channel")}</TableHead>
                <TableHead>{t("detail.activeTemp.columns.status", "Status")}</TableHead>
                <TableHead>{t("detail.activeTemp.columns.owner", "Owner")}</TableHead>
                <TableHead>
                  {t("detail.activeTemp.columns.currentlyActive", "Currently active")}
                </TableHead>
                <TableHead>{t("detail.activeTemp.columns.created", "Created")}</TableHead>
                <TableHead>{t("detail.activeTemp.columns.lfgMessage", "LFG message")}</TableHead>
                <TableHead className="text-right">
                  {t("common.columns.action", "Action")}
                </TableHead>
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
                        <StatusBadge tone="danger">
                          {t("detail.activeTemp.status.notFound", "Not found")}
                        </StatusBadge>
                      ) : item.existsInDiscord === null ? (
                        <StatusBadge tone="muted">
                          {t("common.status.unknown", "Unknown")}
                        </StatusBadge>
                      ) : (item.activeCount ?? item.activeUsers?.length ?? 0) === 0 ? (
                        <StatusBadge tone="warning">
                          {t("detail.activeTemp.status.empty", "Empty")}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="success">
                          {t("detail.activeTemp.status.exists", "Exists")}
                        </StatusBadge>
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
                          {t(
                            "detail.activeTemp.active.channelNotFound",
                            "Channel not found in Discord"
                          )}
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
                                  {t(
                                    "detail.activeTemp.active.joinedAt",
                                    "• joined {time}",
                                    { time: new Date(user.joinedAt).toLocaleTimeString(dateLocale) }
                                  )}
                                </span>
                              ) : null}
                            </div>
                          ))}
                          {item.activeUsers.length > 3 ? (
                            <div className="text-muted-foreground">
                              {t(
                                "detail.activeTemp.active.moreUsers",
                                "+{count} more",
                                { count: item.activeUsers.length - 3 }
                              )}
                            </div>
                          ) : null}
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                            {t(
                              "detail.activeTemp.active.source",
                              "source: {source}",
                              {
                                source:
                                  item.activeSource === "discord"
                                    ? t("detail.activeTemp.active.sourceDiscord", "Discord")
                                    : t("detail.activeTemp.active.sourceDatabase", "DB fallback"),
                              }
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t("detail.activeTemp.active.noUsers", "No active users")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString(dateLocale)}
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
                          {t("detail.activeTemp.actions.openPost", "Open post")}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t("detail.activeTemp.lfg.notPosted", "Not posted")}
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
                          {deletingChannelId === item.channelId
                            ? t("common.actions.deleting", "Deleting...")
                            : t("common.actions.delete", "Delete")}
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
          <div className={dashboardEmpty}>
            {t(
              "detail.activeTemp.empty",
              "No active temp channels found."
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const ActiveTempChannelsCard = memo(ActiveTempChannelsCardComponent);
