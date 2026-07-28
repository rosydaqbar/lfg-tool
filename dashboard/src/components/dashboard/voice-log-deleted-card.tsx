import { memo, useRef, useState } from "react";
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
import { dashboardCard, dashboardEmpty, dashboardError, dashboardInset } from "@/components/ui/patterns";
import { useDashboardI18n } from "@/components/dashboard/dashboard-i18n";
import type { TempVoiceDeleteLog } from "./types";
import { useAdaptivePolling } from "./use-adaptive-polling";

type VoiceLogDeletedCardProps = {
  selectedGuildId: string;
};

type DashboardTranslate = ReturnType<typeof useDashboardI18n>["t"];

function formatDuration(totalMs: number, t: DashboardTranslate) {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return t("common.duration.minutes", "{minutes}m", { minutes });
  }
  return t("common.duration.hoursMinutes", "{hours}h {minutes}m", {
    hours,
    minutes,
  });
}

function VoiceLogDeletedCardComponent({
  selectedGuildId,
}: VoiceLogDeletedCardProps) {
  const { locale, t } = useDashboardI18n();
  const dateLocale = locale === "id" ? "id-ID" : "en-US";
  const [deleteLogs, setDeleteLogs] = useState<TempVoiceDeleteLog[]>([]);
  const [loadingDeleteLogs, setLoadingDeleteLogs] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const deleteLogsLoadedOnce = useRef(false);

  useAdaptivePolling(
    async (showLoader) => {
      if (!selectedGuildId) return true;
      if (showLoader && !deleteLogsLoadedOnce.current) setLoadingDeleteLogs(true);
      try {
        const response = await fetch(
          `/api/guilds/${selectedGuildId}/voice-delete-logs?limit=5&offset=0`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          throw new Error(
            t("detail.voiceLog.errors.load", "Failed to load delete logs")
          );
        }
        const data = (await response.json()) as { deleteLogs: TempVoiceDeleteLog[] };
        setDeleteLogs(data.deleteLogs ?? []);
        setLoadError(null);
        deleteLogsLoadedOnce.current = true;
        return true;
      } catch (err) {
        setLoadError(
          err instanceof Error
            ? err.message
            : t("detail.voiceLog.errors.load", "Failed to load delete logs")
        );
        return false;
      } finally {
        setLoadingDeleteLogs(false);
      }
    },
    [selectedGuildId]
  );

  return (
    <Card className={`${dashboardCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-[400ms]`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Volume2 className="h-4 w-4" />
          {t("detail.voiceLog.title", "Voice Log")}
        </CardTitle>
        <CardDescription>
          {t(
            "detail.voiceLog.cardDescription",
            "Combined log for deleted temp channels and manual voice channel sessions."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <div className={dashboardError}>
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
                className={dashboardInset}
              >
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {log.sourceType === "manual_session"
                      ? t(
                          "detail.voiceLog.types.manualSession",
                          "Manual Voice Session"
                        )
                      : t("detail.voiceLog.types.tempDeleted", "Temp Deleted")}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    {t("detail.voiceLog.labels.channel", "Channel: {channel}", {
                      channel:
                        log.channelName || t("common.status.unknownParenthetical", "(unknown)"),
                    })}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">
                    {log.channelId}
                  </span>
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    {t("detail.voiceLog.labels.owner", "Owner: {owner}", {
                      owner:
                        log.ownerId === "server_owned"
                          ? t("detail.voiceLog.labels.serverOwned", "server owned")
                          : log.ownerName || log.ownerId,
                    })}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {t("detail.voiceLog.labels.eventAt", "{event}: {date}", {
                      event:
                        log.sourceType === "manual_session"
                          ? t("detail.voiceLog.events.ended", "Ended")
                          : t("detail.voiceLog.events.deleted", "Deleted"),
                      date: new Date(log.eventAt).toLocaleString(dateLocale),
                    })}
                  </span>
                  {log.sourceType === "manual_session" && log.joinedAt ? (
                    <span className="text-xs text-muted-foreground">
                      {t("detail.voiceLog.labels.joinedAt", "Joined: {date}", {
                        date: new Date(log.joinedAt).toLocaleString(dateLocale),
                      })}
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {t("detail.voiceLog.history.title", "History")}
                  </div>
                  {log.history.length ? (
                    <div className="space-y-1">
                        {log.history.slice(0, 15).map((item) => (
                          <div
                            key={`delete-history-${log.id}-${item.userId}`}
                            className="text-xs text-muted-foreground"
                          >
                            <span className="text-foreground">
                              {item.userName || item.userId}
                            </span>
                            <span className="font-mono text-muted-foreground"> ({item.userId})</span>
                            {" "}
                            {t("detail.voiceLog.history.totalLabel", "• total:")}{" "}
                            <span className="font-mono">
                              {formatDuration(item.totalMs, t)}
                            </span>
                          </div>
                        ))}
                      {log.history.length > 15 ? (
                        <div className="text-xs text-muted-foreground">
                          {t(
                            "detail.voiceLog.history.more",
                            "...and {count} more",
                            { count: log.history.length - 15 }
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {t("detail.voiceLog.history.empty", "No user history")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={dashboardEmpty}>
            {t("detail.voiceLog.empty", "No voice log data yet.")}
          </div>
        )}

        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link href="/voice-log">
              {t("detail.voiceLog.actions.viewAll", "View all voice logs")}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const VoiceLogDeletedCard = memo(VoiceLogDeletedCardComponent);
