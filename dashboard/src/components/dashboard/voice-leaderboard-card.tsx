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
import { dashboardCard, dashboardEmpty, dashboardError } from "@/components/ui/patterns";
import { useDashboardI18n } from "@/components/dashboard/dashboard-i18n";
import type { VoiceDeleteLeaderboardEntry } from "./types";
import { useAdaptivePolling } from "./use-adaptive-polling";

type VoiceLeaderboardCardProps = {
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

function VoiceLeaderboardCardComponent({ selectedGuildId }: VoiceLeaderboardCardProps) {
  const { t } = useDashboardI18n();
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
      if (!response.ok) {
        throw new Error(
          t("detail.leaderboard.errors.load", "Failed to load leaderboard")
        );
      }
      const data = (await response.json()) as {
        leaderboard: VoiceDeleteLeaderboardEntry[];
      };
      setRows(data.leaderboard ?? []);
      setError(null);
      loadedOnce.current = true;
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("detail.leaderboard.errors.load", "Failed to load leaderboard")
      );
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
      t(
        "detail.leaderboard.prompts.editHours",
        "Edit total hours for {user}",
        { user: row.userName || row.userId }
      ),
      (row.totalMs / 3600000).toFixed(2)
    );
    if (hoursInput === null) return;
    const parsedHours = Number(hoursInput);
    if (!Number.isFinite(parsedHours) || parsedHours < 0) {
      setError(
        t("detail.leaderboard.errors.invalidHours", "Invalid total hours value.")
      );
      return;
    }

    const sessionsInput = window.prompt(
      t(
        "detail.leaderboard.prompts.editSessions",
        "Edit sessions for {user}",
        { user: row.userName || row.userId }
      ),
      String(row.sessions)
    );
    if (sessionsInput === null) return;
    const parsedSessions = Number(sessionsInput);
    if (!Number.isFinite(parsedSessions) || parsedSessions < 0) {
      setError(
        t("detail.leaderboard.errors.invalidSessions", "Invalid sessions value.")
      );
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
        throw new Error(
          payload?.error ||
            t(
              "detail.leaderboard.errors.update",
              "Failed to update leaderboard entry"
            )
        );
      }
      await loadLeaderboard(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t(
              "detail.leaderboard.errors.update",
              "Failed to update leaderboard entry"
            )
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
        throw new Error(
          payload?.error ||
            t(
              "detail.leaderboard.errors.delete",
              "Failed to delete leaderboard entry"
            )
        );
      }
      await loadLeaderboard(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t(
              "detail.leaderboard.errors.delete",
              "Failed to delete leaderboard entry"
            )
      );
    } finally {
      setMutatingUserId(null);
    }
  }

  const canPrev = page > 0;
  const canNext = rows.length === 20;

  return (
    <Card className={`${dashboardCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-[450ms]`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-4 w-4" />
          {t("detail.leaderboard.title", "Voice Leaderboard")}
        </CardTitle>
        <CardDescription>
          {t(
            "detail.leaderboard.description",
            "Total voice duration ranking from temp channel logs and manual sessions."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className={dashboardError}>
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
                <TableHead>{t("detail.leaderboard.columns.rank", "#")}</TableHead>
                <TableHead>{t("detail.leaderboard.columns.user", "User")}</TableHead>
                <TableHead>
                  {t("detail.leaderboard.columns.totalDuration", "Total duration")}
                </TableHead>
                <TableHead>
                  {t("detail.leaderboard.columns.sessionCount", "Session Count")}
                </TableHead>
                {debugMode ? (
                  <TableHead className="text-right">
                    {t("detail.leaderboard.columns.debugActions", "Debug Actions")}
                  </TableHead>
                ) : null}
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
                    <span className="font-mono">
                      {formatDuration(item.totalMs, t)}
                    </span>
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
                          {t("common.actions.edit", "Edit")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={mutatingUserId === item.userId}
                          onClick={() => void deleteEntry(item.userId)}
                        >
                          {t("common.actions.delete", "Delete")}
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className={dashboardEmpty}>
            {t("detail.leaderboard.empty", "No leaderboard data yet.")}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant={debugMode ? "default" : "ghost"}
            size="sm"
            onClick={() => setDebugMode((prev) => !prev)}
          >
            {t("detail.leaderboard.actions.debug", "Debug")}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.max(0, prev - 1))}
              disabled={!canPrev || loading}
            >
              {t("common.pagination.previous", "Previous")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={!canNext || loading}
            >
              {t("common.pagination.next", "Next")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export const VoiceLeaderboardCard = memo(VoiceLeaderboardCardComponent);
