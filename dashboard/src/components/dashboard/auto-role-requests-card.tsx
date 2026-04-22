import { memo, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function formatDuration(totalMs: number) {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
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
    return (
      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
        Need action
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
        Approved
      </span>
    );
  }
  return (
    <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
      Denied
    </span>
  );
}

function AutoRoleRequestsCardComponent({
  selectedGuildId,
}: AutoRoleRequestsCardProps) {
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
        throw new Error("Failed to load auto role requests");
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
      setError(err instanceof Error ? err.message : "Failed to load auto role requests");
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
        throw new Error(payload?.error || "Failed to remove request");
      }
      await loadRequests(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove request");
    } finally {
      setDeletingRequestId(null);
    }
  }

  useAdaptivePolling(loadRequests, [selectedGuildId]);

  return (
    <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-4 w-4" />
          Auto role requests
        </CardTitle>
        <CardDescription>
          Review queue status for need action, approved, and denied auto-role requests.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            Need action: {counts.pending}
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            Approved: {counts.approved}
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            Denied: {counts.denied}
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
                <TableHead>Status</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Logic</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
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
                    <TableCell>{statusBadge(request.status)}</TableCell>
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
                        <div className="font-mono break-all">Role: {request.roleId}</div>
                        <div className="font-mono">Voice: {formatDuration(request.totalMs)}</div>
                        <div className="text-muted-foreground break-all">
                          Rule: {formatRuleKey(request.ruleKey)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {request.status === "pending" ? (
                        <span className="text-xs text-muted-foreground">Waiting admin</span>
                      ) : (
                        <div className="space-y-1 text-xs">
                          <div>{request.decidedByName || request.decidedBy || "-"}</div>
                          {request.decidedAt ? (
                            <div className="text-muted-foreground">
                              {new Date(request.decidedAt).toLocaleString()}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-xs text-muted-foreground min-w-40">
                        <div>{new Date(request.createdAt).toLocaleString()}</div>
                        {messageLink ? (
                          <a
                            href={messageLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            Open message
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
                        {deletingRequestId === request.id ? "Removing..." : "Remove"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
            No auto role requests found.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const AutoRoleRequestsCard = memo(AutoRoleRequestsCardComponent);
