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
import { dashboardCard, dashboardEmpty, dashboardError, dashboardInset } from "@/components/ui/patterns";
import { useDashboardI18n } from "@/components/dashboard/dashboard-i18n";
import type { TempVoiceDeleteLog } from "@/components/dashboard/types";

const PAGE_SIZE = 25;

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

export function VoiceLogPageClient({
  selectedGuildId,
  embedded = false,
}: {
  selectedGuildId: string;
  embedded?: boolean;
}) {
  const { locale, t } = useDashboardI18n();
  const dateLocale = locale === "id" ? "id-ID" : "en-US";
  const [page, setPage] = useState(0);
  const [deleteLogs, setDeleteLogs] = useState<TempVoiceDeleteLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const offset = page * PAGE_SIZE;
    fetch(
      `/api/guilds/${selectedGuildId}/voice-delete-logs?limit=${PAGE_SIZE}&offset=${offset}`,
      { cache: "no-store" }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error();
        }
        return response.json() as Promise<{ deleteLogs: TempVoiceDeleteLog[] }>;
      })
      .then((data) => {
        if (!active) return;
        setDeleteLogs(data.deleteLogs ?? []);
        setLoadError(null);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : "");
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
      {!embedded ? (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-[var(--font-display)] text-3xl text-foreground">
              {t("detail.voiceLog.title", "Voice Log")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "detail.voiceLog.pageDescription",
                "Combined history of deleted temp channels and manual voice channel sessions."
              )}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              {t("common.navigation.backToDashboard", "Back to dashboard")}
            </Link>
          </Button>
        </div>
      ) : null}

      {loadError !== null ? (
        <div className={dashboardError}>
          {loadError ||
            t("detail.voiceLog.errors.loadPage", "Failed to load voice log data")}
        </div>
      ) : null}

      <Card className={dashboardCard}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Volume2 className="h-4 w-4" />
            {t("detail.voiceLog.mixedTitle", "Voice Logs (Mixed)")}
          </CardTitle>
          <CardDescription>
            {t(
              "detail.voiceLog.pagination.summary",
              "Page {page} • Showing up to {pageSize} items per page.",
              { page: page + 1, pageSize: PAGE_SIZE }
            )}
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
                          log.channelName ||
                          t("common.status.unknownParenthetical", "(unknown)"),
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
                        {log.history.map((item) => (
                          <div
                            key={`delete-history-full-${log.id}-${item.userId}`}
                            className="text-xs text-muted-foreground"
                          >
                            <span className="text-foreground">{item.userName || item.userId}</span>
                            <span className="font-mono text-muted-foreground"> ({item.userId})</span>
                            {" "}
                            {t("detail.voiceLog.history.totalLabel", "• total:")}{" "}
                            <span className="font-mono">
                              {formatDuration(item.totalMs, t)}
                            </span>
                          </div>
                        ))}
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
              {t("detail.voiceLog.pageEmpty", "No data for this page.")}
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
              {t("common.pagination.previous", "Previous")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={!canGoNext || loading}
            >
              {t("common.pagination.next", "Next")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
