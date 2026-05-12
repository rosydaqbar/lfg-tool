import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "muted" | "loading";

const toneClass: Record<StatusTone, string> = {
  success: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted/50 text-muted-foreground",
  loading: "border-border bg-secondary text-secondary-foreground",
};

const dotClass: Record<StatusTone, string> = {
  success: "bg-emerald-500 dark:bg-emerald-300",
  warning: "bg-amber-500 dark:bg-amber-300",
  danger: "bg-destructive",
  muted: "bg-muted-foreground",
  loading: "bg-muted-foreground animate-pulse",
};

type StatusBadgeProps = {
  children: ReactNode;
  tone: StatusTone;
  className?: string;
  dot?: boolean;
};

export function StatusBadge({ children, tone, className, dot = false }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", toneClass[tone], className)}
    >
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", dotClass[tone])} /> : null}
      {children}
    </Badge>
  );
}

export function guildStatusTone(status: "ready" | "needs_setup" | "invite_bot"): StatusTone {
  if (status === "ready") return "success";
  if (status === "needs_setup") return "warning";
  return "danger";
}

export function guildStatusLabel(status: "ready" | "needs_setup" | "invite_bot") {
  if (status === "ready") return "Ready";
  if (status === "needs_setup") return "Needs setup";
  return "Invite bot";
}
