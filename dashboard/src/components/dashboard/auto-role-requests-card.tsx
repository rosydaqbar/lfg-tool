import { memo, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { dashboardCard, dashboardEmpty, dashboardError } from "@/components/ui/patterns";
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
import { useDashboardI18n } from "@/components/dashboard/dashboard-i18n";
import type { AutoRoleRequest } from "./types";
import { useAdaptivePolling } from "./use-adaptive-polling";

type AutoRoleRequestsCardProps = {
  selectedGuildId: string;
};

type Counts = {
  pending: number;
  approved: number;
  denied: number;
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

function formatRuleKey(ruleKey: string, t: DashboardTranslate) {
  const [condition, hours, roleId] = ruleKey.split(":");
  const conditionLabel =
    condition === "more_than"
      ? t("detail.autoRole.rules.moreThan", "More than")
      : condition === "less_than"
        ? t("detail.autoRole.rules.lessThan", "Less than")
        : condition === "equal_to"
          ? t("detail.autoRole.rules.equalTo", "Equal to")
          : condition;
  if (!hours) return ruleKey;
  if (!roleId) {
    return t("detail.autoRole.rules.summary", "{condition} {hours}h", {
      condition: conditionLabel,
      hours,
    });
  }
  return t(
    "detail.autoRole.rules.summaryWithRole",
    "{condition} {hours}h -> {roleId}",
    { condition: conditionLabel, hours, roleId }
  );
}

function statusBadge(status: AutoRoleRequest["status"], t: DashboardTranslate) {
  if (status === "pending") {
    return (
      <StatusBadge tone="warning">
        {t("detail.autoRole.status.needsAction", "Needs action")}
      </StatusBadge>
    );
  }
  if (status === "approved") {
    return (
      <StatusBadge tone="success">
        {t("detail.autoRole.status.approved", "Approved")}
      </StatusBadge>
    );
  }
  return (
    <StatusBadge tone="danger">
      {t("detail.autoRole.status.denied", "Denied")}
    </StatusBadge>
  );
}

function AutoRoleRequestsCardComponent({
  selectedGuildId,
}: AutoRoleRequestsCardProps) {
  const { locale, t } = useDashboardI18n();
  const dateLocale = locale === "id" ? "id-ID" : "en-US";
  const [requests, setRequests] = useState<AutoRoleRequest[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, denied: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<number | null>(null);
  const loadedOnce = useRef(false);

  async function loadRequests(showLoader: boolean) {
    if (!selectedGuildId) return true;
    if (showLoader && !loadedOnce.current) setLoading(true);
    try {
      const response = await fetch(
        `/api/guilds/${selectedGuildId}/auto-role-requests?limit=100&offset=0`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        throw new Error(
          t(
            "detail.autoRole.errors.load",
            "Failed to load auto role requests"
          )
        );
      }
      const data = (await response.json()) as {
        requests: AutoRoleRequest[];
        counts?: Counts;
      };
      setRequests(data.requests ?? []);
      setCounts(
        data.counts ?? {
          pending: (data.requests ?? []).filter((item) => item.status === "pending").length,
          approved: (data.requests ?? []).filter((item) => item.status === "approved").length,
          denied: (data.requests ?? []).filter((item) => item.status === "denied").length,
        }
      );
      setError(null);
      loadedOnce.current = true;
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t(
              "detail.autoRole.errors.load",
              "Failed to load auto role requests"
            )
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function removeRequest(requestId: number) {
    if (!selectedGuildId) return;
    setDeletingRequestId(requestId);
    try {
      const response = await fetch(`/api/guilds/${selectedGuildId}/auto-role-requests`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requestId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          payload?.error ||
            t("detail.autoRole.errors.remove", "Failed to remove request")
        );
      }
      await loadRequests(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("detail.autoRole.errors.remove", "Failed to remove request")
      );
    } finally {
      setDeletingRequestId(null);
    }
  }

  useAdaptivePolling(loadRequests, [selectedGuildId]);

  return (
    <Card className={`${dashboardCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-300`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-4 w-4" />
          {t("detail.autoRole.title", "Auto role requests")}
        </CardTitle>
        <CardDescription>
          {t(
            "detail.autoRole.description",
            "Review queue status for need action, approved, and denied auto-role requests."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className={dashboardError}>
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {t("detail.autoRole.counts.needsAction", "Needs action: {count}", {
              count: counts.pending,
            })}
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {t("detail.autoRole.counts.approved", "Approved: {count}", {
              count: counts.approved,
            })}
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {t("detail.autoRole.counts.denied", "Denied: {count}", {
              count: counts.denied,
            })}
          </Badge>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : requests.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("detail.autoRole.columns.status", "Status")}</TableHead>
                <TableHead>{t("detail.autoRole.columns.user", "User")}</TableHead>
                <TableHead>{t("detail.autoRole.columns.logic", "Logic")}</TableHead>
                <TableHead>{t("detail.autoRole.columns.decision", "Decision")}</TableHead>
                <TableHead>{t("detail.autoRole.columns.created", "Created")}</TableHead>
                <TableHead className="text-right">
                  {t("common.columns.action", "Action")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => {
                const messageLink =
                  request.messageChannelId && request.messageId
                    ? `https://discordapp.com/channels/${selectedGuildId}/${request.messageChannelId}/${request.messageId}`
                    : null;
                return (
                  <TableRow key={request.id}>
                    <TableCell>{statusBadge(request.status, t)}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {request.userName || request.userId}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground break-all">
                        {request.userId}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-xs">
                        <div className="font-mono break-all">
                          {t("detail.autoRole.logic.role", "Role: {roleId}", {
                            roleId: request.roleId,
                          })}
                        </div>
                        <div className="font-mono">
                          {t("detail.autoRole.logic.voice", "Voice: {duration}", {
                            duration: formatDuration(request.totalMs, t),
                          })}
                        </div>
                        <div className="text-muted-foreground break-all">
                          {t("detail.autoRole.logic.rule", "Rule: {rule}", {
                            rule: formatRuleKey(request.ruleKey, t),
                          })}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {request.status === "pending" ? (
                        <span className="text-xs text-muted-foreground">
                          {t("detail.autoRole.decision.waitingAdmin", "Waiting admin")}
                        </span>
                      ) : (
                        <div className="space-y-1 text-xs">
                          <div>{request.decidedByName || request.decidedBy || "-"}</div>
                          {request.decidedAt ? (
                            <div className="text-muted-foreground">
                              {new Date(request.decidedAt).toLocaleString(dateLocale)}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-xs text-muted-foreground min-w-40">
                        <div>{new Date(request.createdAt).toLocaleString(dateLocale)}</div>
                        {messageLink ? (
                          <a
                            href={messageLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {t("detail.autoRole.actions.openMessage", "Open message")}
                          </a>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deletingRequestId === request.id}
                        onClick={() => void removeRequest(request.id)}
                      >
                        {deletingRequestId === request.id
                          ? t("common.actions.removing", "Removing...")
                          : t("common.actions.remove", "Remove")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className={dashboardEmpty}>
            {t(
              "detail.autoRole.empty",
              "No auto role requests found."
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const AutoRoleRequestsCard = memo(AutoRoleRequestsCardComponent);
