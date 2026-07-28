import { memo, useRef, useState } from "react";
import { AlertTriangle, Clock3, ShieldCheck, Trophy, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { useDashboardI18n } from "@/components/dashboard/dashboard-i18n";
import { dashboardCard, dashboardEmptyCompact, dashboardError, dashboardInset, dashboardWarningCard } from "@/components/ui/patterns";
import type {
  AutoRoleRequest,
  TempVoiceDeleteLog,
  VoiceDeleteLeaderboardEntry,
} from "./types";
import { useAdaptivePolling } from "./use-adaptive-polling";

type DetailView = "active-temp" | "voice-log" | "leaderboard" | "auto-role";

type Counts = {
  pending: number;
  approved: number;
  denied: number;
};

type VoiceLeaderboardSummary = {
  totalUsers: number;
  totalMs: number;
  totalSessions: number;
  top: VoiceDeleteLeaderboardEntry[];
};

type SummaryTempChannel = {
  channelId: string;
  channelName: string | null;
  ownerId: string;
  ownerName?: string | null;
  createdAt: string;
  activeCount: number;
};

type DashboardSummaryResponse = {
  tempChannels: SummaryTempChannel[];
  tempChannelCount: number;
  voiceLogs: TempVoiceDeleteLog[];
  voiceLogSummary?: { todayCount?: number };
  leaderboard: VoiceLeaderboardSummary;
  requests: AutoRoleRequest[];
  pendingRequests: AutoRoleRequest[];
  counts: Counts;
};

type DashboardOverviewProps = {
  selectedGuildId: string;
  onOpenDetail: (view: DetailView) => void;
};

type DashboardTranslate = ReturnType<typeof useDashboardI18n>["t"];
type DashboardLocale = ReturnType<typeof useDashboardI18n>["locale"];

function formatDuration(totalMs: number, t: DashboardTranslate) {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return t("dashboard.overview.duration.minutes", "{minutes}m", { minutes });
  }
  return t(
    "dashboard.overview.duration.hoursMinutes",
    "{hours}h {minutes}m",
    { hours, minutes }
  );
}

function formatDate(
  value: string | null | undefined,
  t: DashboardTranslate,
  locale: DashboardLocale
) {
  if (!value) return t("dashboard.overview.common.notAvailable", "-");
  return new Date(value).toLocaleString(locale === "id" ? "id-ID" : "en-US");
}

function formatActiveDuration(value: string, t: DashboardTranslate) {
  const startedAt = new Date(value).getTime();
  if (!Number.isFinite(startedAt)) {
    return t("dashboard.overview.common.notAvailable", "-");
  }
  const totalMinutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return t("dashboard.overview.duration.daysHours", "{days}d {hours}h", {
      days,
      hours,
    });
  }
  if (hours > 0) {
    return t(
      "dashboard.overview.duration.hoursMinutes",
      "{hours}h {minutes}m",
      { hours, minutes }
    );
  }
  return t("dashboard.overview.duration.minutes", "{minutes}m", { minutes });
}

function formatRuleKey(ruleKey: string, t: DashboardTranslate) {
  const [condition, hours, roleId] = ruleKey.split(":");
  const conditionLabel =
    condition === "more_than"
      ? t("dashboard.overview.rule.moreThan", "More than")
      : condition === "less_than"
        ? t("dashboard.overview.rule.lessThan", "Less than")
        : condition === "equal_to"
          ? t("dashboard.overview.rule.equalTo", "Equal to")
          : condition;
  if (!hours) return ruleKey;
  if (!roleId) {
    return t("dashboard.overview.rule.withHours", "{condition} {hours}h", {
      condition: conditionLabel,
      hours,
    });
  }
  return t(
    "dashboard.overview.rule.withHoursAndRole",
    "{condition} {hours}h -> {roleId}",
    { condition: conditionLabel, hours, roleId }
  );
}

function statusBadge(status: AutoRoleRequest["status"], t: DashboardTranslate) {
  if (status === "pending") {
    return (
      <StatusBadge tone="warning">
        {t("dashboard.overview.requestStatus.pending", "Needs action")}
      </StatusBadge>
    );
  }
  if (status === "approved") {
    return (
      <StatusBadge tone="success">
        {t("dashboard.overview.requestStatus.approved", "Approved")}
      </StatusBadge>
    );
  }
  return (
    <StatusBadge tone="danger">
      {t("dashboard.overview.requestStatus.denied", "Denied")}
    </StatusBadge>
  );
}

function DashboardOverviewComponent({
  selectedGuildId,
  onOpenDetail,
}: DashboardOverviewProps) {
  const { locale, t } = useDashboardI18n();
  const [tempChannels, setTempChannels] = useState<SummaryTempChannel[]>([]);
  const [tempChannelCount, setTempChannelCount] = useState(0);
  const [voiceLogs, setVoiceLogs] = useState<TempVoiceDeleteLog[]>([]);
  const [todayVoiceCount, setTodayVoiceCount] = useState(0);
  const [leaderboard, setLeaderboard] = useState<VoiceLeaderboardSummary>({
    totalUsers: 0,
    totalMs: 0,
    totalSessions: 0,
    top: [],
  });
  const [requests, setRequests] = useState<AutoRoleRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<AutoRoleRequest[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, denied: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingRequestId, setActingRequestId] = useState<number | null>(null);
  const loadedOnce = useRef(false);

  async function loadDashboard(showLoader: boolean) {
    if (!selectedGuildId) return true;
    if (showLoader && !loadedOnce.current) setLoading(true);
    try {
      const response = await fetch(`/api/guilds/${selectedGuildId}/dashboard-summary`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(
          t(
            "dashboard.overview.errors.loadSummary",
            "Failed to load dashboard summary"
          )
        );
      }

      const data = (await response.json()) as DashboardSummaryResponse;

      setTempChannels(data.tempChannels ?? []);
      setTempChannelCount(Number(data.tempChannelCount ?? 0));
      setVoiceLogs(data.voiceLogs ?? []);
      setTodayVoiceCount(Number(data.voiceLogSummary?.todayCount ?? 0));
      setLeaderboard(
        data.leaderboard ?? {
          totalUsers: 0,
          totalMs: 0,
          totalSessions: 0,
          top: [],
        }
      );
      setRequests(data.requests ?? []);
      setPendingRequests(data.pendingRequests ?? []);
      setCounts(data.counts ?? { pending: 0, approved: 0, denied: 0 });
      setError(null);
      loadedOnce.current = true;
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t(
              "dashboard.overview.errors.loadSummary",
              "Failed to load dashboard summary"
            )
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestAction(requestId: number, action: "approve" | "deny") {
    if (!selectedGuildId) return;
    setActingRequestId(requestId);
    try {
      const response = await fetch(`/api/guilds/${selectedGuildId}/auto-role-requests`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(
          payload?.error ||
            t(
              "dashboard.overview.errors.processAutoRoleRequest",
              "Failed to process auto-role request"
            )
        );
      }
      await loadDashboard(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t(
              "dashboard.overview.errors.processAutoRoleRequest",
              "Failed to process auto-role request"
            )
      );
    } finally {
      setActingRequestId(null);
    }
  }

  useAdaptivePolling(loadDashboard, [selectedGuildId]);

  return (
    <div className="space-y-6">
      {error ? (
        <div className={dashboardError}>
          {error}
        </div>
      ) : null}

      {counts.pending > 0 ? (
        <Card className={`${dashboardWarningCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-100`}>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-amber-900 dark:text-amber-100">
                <AlertTriangle className="h-4 w-4" />
                {t("dashboard.overview.pending.title", "Take Action")}
              </CardTitle>
              <CardDescription className="text-amber-800/80 dark:text-amber-100/80">
                {t(
                  counts.pending === 1
                    ? "dashboard.overview.pending.description.one"
                    : "dashboard.overview.pending.description.many",
                  counts.pending === 1
                    ? "{count} auto-role request waiting for approval."
                    : "{count} auto-role requests waiting for approval.",
                  { count: counts.pending }
                )}
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetail("auto-role")}>
              {t("dashboard.overview.actions.fullLog", "Full Log")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.length ? (
              <div className="divide-y divide-amber-500/25">
                {pendingRequests.map((request) => (
                <div key={request.id} className="py-4 text-sm first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="font-medium">{request.userName || request.userId}</div>
                      <div className="text-xs text-muted-foreground">
                        {t("dashboard.overview.labels.role", "Role")} <span className="font-mono">{request.roleId}</span> • {t("dashboard.overview.labels.voice", "Voice")} {formatDuration(request.totalMs, t)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                         {formatRuleKey(request.ruleKey, t)} • {t("dashboard.overview.labels.requested", "Requested")} {formatDate(request.createdAt, t, locale)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={actingRequestId === request.id}
                        onClick={() => void handleRequestAction(request.id, "approve")}
                      >
                        {t("dashboard.overview.actions.approve", "Approve")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={actingRequestId === request.id}
                        onClick={() => void handleRequestAction(request.id, "deny")}
                      >
                        {t("dashboard.overview.actions.deny", "Deny")}
                      </Button>
                    </div>
                  </div>
                </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {t(
                  "dashboard.overview.pending.loading",
                  "Loading the pending queue..."
                )}
              </div>
            )}
            {counts.pending > pendingRequests.length ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenDetail("auto-role")}>
                {t(
                  counts.pending - pendingRequests.length === 1
                    ? "dashboard.overview.pending.reviewMore.one"
                    : "dashboard.overview.pending.reviewMore.many",
                  counts.pending - pendingRequests.length === 1
                    ? "Review {count} more pending request"
                    : "Review {count} more pending requests",
                  { count: counts.pending - pendingRequests.length }
                )}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className={`${dashboardCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-100`}>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Volume2 className="h-4 w-4" />
                {t("dashboard.overview.tempChannels.title", "Active Temp Channels")}
              </CardTitle>
              <CardDescription>
                {t(
                  tempChannelCount === 1
                    ? "dashboard.overview.tempChannels.description.one"
                    : "dashboard.overview.tempChannels.description.many",
                  tempChannelCount === 1
                    ? "{count} currently tracked channel."
                    : "{count} currently tracked channels.",
                  { count: tempChannelCount }
                )}
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetail("active-temp")}>
              {t("dashboard.overview.actions.openDetails", "Open Details")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && !loadedOnce.current ? <Skeleton className="h-24 w-full" /> : null}
            {!loading && tempChannels.length === 0 ? (
              <div className={dashboardEmptyCompact}>
                {t(
                  "dashboard.overview.tempChannels.empty",
                  "No active temp channels found."
                )}
              </div>
            ) : null}
            {tempChannels.length ? (
              <div className="divide-y divide-border">
                {tempChannels.slice(0, 3).map((item) => (
                  <div key={item.channelId} className="flex items-center justify-between gap-4 py-3 text-sm first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {item.channelName ||
                          t(
                            "dashboard.overview.tempChannels.unknownChannel",
                            "Unknown voice channel"
                          )}
                      </div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {item.channelId}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {t("dashboard.overview.labels.ownerWithColon", "Owner:")} {item.ownerName || item.ownerId}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-sm">{formatActiveDuration(item.createdAt, t)}</div>
                      <div className="text-xs text-muted-foreground">
                        {t("dashboard.overview.tempChannels.active", "active")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className={`${dashboardCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-150`}>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock3 className="h-4 w-4" />
                {t("dashboard.overview.voiceLog.title", "Voice Log")}
              </CardTitle>
              <CardDescription>
                {t(
                  todayVoiceCount === 1
                    ? "dashboard.overview.voiceLog.today.one"
                    : "dashboard.overview.voiceLog.today.many",
                  todayVoiceCount === 1
                    ? "{count} session today, GMT+7."
                    : "{count} sessions today, GMT+7.",
                  { count: todayVoiceCount }
                )}
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetail("voice-log")}>
              {t("dashboard.overview.actions.openDetails", "Open Details")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && !loadedOnce.current ? <Skeleton className="h-24 w-full" /> : null}
            {!loading && voiceLogs.length === 0 ? (
              <div className={dashboardEmptyCompact}>
                {t("dashboard.overview.voiceLog.empty", "No voice log data yet.")}
              </div>
            ) : null}
            {voiceLogs.length ? (
              <div className="divide-y divide-border">
                {voiceLogs.map((log) => (
                <div key={log.id} className="py-3 text-sm first:pt-0 last:pb-0">
                  <div className="font-medium">{log.channelName || log.channelId}</div>
                  <div className="text-xs text-muted-foreground">
                     {t("dashboard.overview.labels.owner", "Owner")} {log.ownerName || log.ownerId} • {t("dashboard.overview.labels.created", "Created")} {formatDate(log.joinedAt, t, locale)} • {t("dashboard.overview.labels.removed", "Removed")} {formatDate(log.eventAt, t, locale)}
                  </div>
                </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className={`${dashboardCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-200`}>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trophy className="h-4 w-4" />
                {t("dashboard.overview.leaderboard.title", "Voice Leaderboard")}
              </CardTitle>
              <CardDescription>
                {t(
                  "dashboard.overview.leaderboard.description",
                  "Total voice activity across all tracked users."
                )}
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetail("leaderboard")}>
              {t("dashboard.overview.actions.openDetails", "Open Details")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className={dashboardInset}>
                <div className="text-xs text-muted-foreground">
                  {t("dashboard.overview.leaderboard.users", "Users")}
                </div>
                <div className="text-xl font-semibold">{leaderboard.totalUsers}</div>
              </div>
              <div className={dashboardInset}>
                <div className="text-xs text-muted-foreground">
                  {t("dashboard.overview.leaderboard.hours", "Hours")}
                </div>
                <div className="text-xl font-semibold">{Math.floor(leaderboard.totalMs / 3600000)}</div>
              </div>
              <div className={dashboardInset}>
                <div className="text-xs text-muted-foreground">
                  {t("dashboard.overview.leaderboard.sessions", "Sessions")}
                </div>
                <div className="text-xl font-semibold">{leaderboard.totalSessions}</div>
              </div>
            </div>
            <div className="divide-y divide-border">
              {leaderboard.top.length ? leaderboard.top.map((item, index) => (
                <div key={item.userId} className="flex items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                  <span>{index + 1}. {item.userName || item.userId}</span>
                  <span className="font-mono text-xs text-muted-foreground">{formatDuration(item.totalMs, t)}</span>
                </div>
              )) : (
                <div className="text-sm text-muted-foreground">
                  {t(
                    "dashboard.overview.leaderboard.empty",
                    "No leaderboard data yet."
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className={`${dashboardCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-300`}>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-4 w-4" />
                {t("dashboard.overview.autoRole.title", "Auto Role Requests Log")}
              </CardTitle>
              <CardDescription>
                {t(
                  "dashboard.overview.autoRole.summary",
                  "{pending} pending • {denied} denied",
                  { pending: counts.pending, denied: counts.denied }
                )}
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetail("auto-role")}>
              {t("dashboard.overview.actions.openDetails", "Open Details")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.length ? (
              <div className="divide-y divide-border">
                {requests.map((request) => (
                <div key={request.id} className="py-3 text-sm first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{request.userName || request.userId}</span>
                    {statusBadge(request.status, t)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                     {formatDate(request.createdAt, t, locale)} • {formatRuleKey(request.ruleKey, t)}
                  </div>
                </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {t(
                  "dashboard.overview.autoRole.empty",
                  "No auto-role requests found."
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const DashboardOverview = memo(DashboardOverviewComponent);
