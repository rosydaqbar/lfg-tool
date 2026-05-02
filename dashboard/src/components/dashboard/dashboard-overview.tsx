import { memo, useRef, useState } from "react";
import { AlertTriangle, Clock3, ShieldCheck, Trophy, Volume2 } from "lucide-react";
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

function formatDuration(totalMs: number) {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatActiveDuration(value: string) {
  const startedAt = new Date(value).getTime();
  if (!Number.isFinite(startedAt)) return "-";
  const totalMinutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatRuleKey(ruleKey: string) {
  const [condition, hours, roleId] = ruleKey.split(":");
  const conditionLabel =
    condition === "more_than"
      ? "More than"
      : condition === "less_than"
        ? "Less than"
        : condition === "equal_to"
          ? "Equal to"
          : condition;
  if (!hours) return ruleKey;
  if (!roleId) return `${conditionLabel} ${hours}h`;
  return `${conditionLabel} ${hours}h -> ${roleId}`;
}

function statusBadge(status: AutoRoleRequest["status"]) {
  if (status === "pending") {
    return <Badge className="rounded-full bg-amber-500 text-white">Need action</Badge>;
  }
  if (status === "approved") {
    return <Badge className="rounded-full bg-emerald-600 text-white">Approved</Badge>;
  }
  return <Badge variant="destructive" className="rounded-full">Denied</Badge>;
}

function DashboardOverviewComponent({
  selectedGuildId,
  onOpenDetail,
}: DashboardOverviewProps) {
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
      if (!response.ok) throw new Error("Failed to load dashboard summary");

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
      setError(err instanceof Error ? err.message : "Failed to load dashboard summary");
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
        throw new Error(payload?.error || "Failed to process auto-role request");
      }
      await loadDashboard(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process auto-role request");
    } finally {
      setActingRequestId(null);
    }
  }

  useAdaptivePolling(loadDashboard, [selectedGuildId]);

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {counts.pending > 0 ? (
        <Card className="border-amber-500/40 bg-amber-500/10 shadow-lg shadow-black/5 animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-100">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-amber-900 dark:text-amber-100">
                <AlertTriangle className="h-4 w-4" />
                Take Action
              </CardTitle>
              <CardDescription className="text-amber-800/80 dark:text-amber-100/80">
                {counts.pending} auto-role request{counts.pending === 1 ? "" : "s"} waiting for approval.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetail("auto-role")}>
              Full Log
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
                        Role <span className="font-mono">{request.roleId}</span> • Voice {formatDuration(request.totalMs)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatRuleKey(request.ruleKey)} • Requested {formatDate(request.createdAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={actingRequestId === request.id}
                        onClick={() => void handleRequestAction(request.id, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={actingRequestId === request.id}
                        onClick={() => void handleRequestAction(request.id, "deny")}
                      >
                        Deny
                      </Button>
                    </div>
                  </div>
                </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Loading the pending queue...</div>
            )}
            {counts.pending > pendingRequests.length ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenDetail("auto-role")}>
                Review {counts.pending - pendingRequests.length} more pending request{counts.pending - pendingRequests.length === 1 ? "" : "s"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-100">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Volume2 className="h-4 w-4" />
                Active Temp Channels
              </CardTitle>
              <CardDescription>{tempChannelCount} currently tracked channel{tempChannelCount === 1 ? "" : "s"}.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetail("active-temp")}>
              Open Details
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && !loadedOnce.current ? <Skeleton className="h-24 w-full" /> : null}
            {!loading && tempChannels.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                No active temp channels found.
              </div>
            ) : null}
            {tempChannels.length ? (
              <div className="divide-y divide-border">
                {tempChannels.slice(0, 3).map((item) => (
                  <div key={item.channelId} className="flex items-center justify-between gap-4 py-3 text-sm first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {item.channelName || "Unknown voice channel"}
                      </div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {item.channelId}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        Owner: {item.ownerName || item.ownerId}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-sm">{formatActiveDuration(item.createdAt)}</div>
                      <div className="text-xs text-muted-foreground">active</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-150">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock3 className="h-4 w-4" />
                Voice Log
              </CardTitle>
              <CardDescription>{todayVoiceCount} session{todayVoiceCount === 1 ? "" : "s"} today, GMT+7.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetail("voice-log")}>
              Open Details
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && !loadedOnce.current ? <Skeleton className="h-24 w-full" /> : null}
            {!loading && voiceLogs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                No voice log data yet.
              </div>
            ) : null}
            {voiceLogs.length ? (
              <div className="divide-y divide-border">
                {voiceLogs.map((log) => (
                <div key={log.id} className="py-3 text-sm first:pt-0 last:pb-0">
                  <div className="font-medium">{log.channelName || log.channelId}</div>
                  <div className="text-xs text-muted-foreground">
                    Owner {log.ownerName || log.ownerId} • Created {formatDate(log.joinedAt)} • Removed {formatDate(log.eventAt)}
                  </div>
                </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-200">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trophy className="h-4 w-4" />
                Voice Leaderboard
              </CardTitle>
              <CardDescription>Total voice activity across all tracked users.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetail("leaderboard")}>
              Open Details
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Users</div>
                <div className="text-xl font-semibold">{leaderboard.totalUsers}</div>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Hours</div>
                <div className="text-xl font-semibold">{Math.floor(leaderboard.totalMs / 3600000)}</div>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Sessions</div>
                <div className="text-xl font-semibold">{leaderboard.totalSessions}</div>
              </div>
            </div>
            <div className="divide-y divide-border">
              {leaderboard.top.length ? leaderboard.top.map((item, index) => (
                <div key={item.userId} className="flex items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                  <span>{index + 1}. {item.userName || item.userId}</span>
                  <span className="font-mono text-xs text-muted-foreground">{formatDuration(item.totalMs)}</span>
                </div>
              )) : <div className="text-sm text-muted-foreground">No leaderboard data yet.</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-300">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-4 w-4" />
                Auto Role Requests Log
              </CardTitle>
              <CardDescription>{counts.pending} pending • {counts.denied} denied</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetail("auto-role")}>
              Open Details
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.length ? (
              <div className="divide-y divide-border">
                {requests.map((request) => (
                <div key={request.id} className="py-3 text-sm first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{request.userName || request.userId}</span>
                    {statusBadge(request.status)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatDate(request.createdAt)} • {formatRuleKey(request.ruleKey)}
                  </div>
                </div>
                ))}
              </div>
            ) : <div className="text-sm text-muted-foreground">No auto-role requests found.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const DashboardOverview = memo(DashboardOverviewComponent);
