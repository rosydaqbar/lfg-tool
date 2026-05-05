import { memo } from "react";
import { BadgeCheck, RefreshCw } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignOutButton } from "@/components/sign-out-button";
import type { ManageableGuild } from "@/components/dashboard/types";

type HeaderSectionProps = {
  userName: string;
  selectedGuildId: string;
  guilds: ManageableGuild[];
  accessLabel: "Owner" | "Admin";
  refreshingGuilds: boolean;
  onGuildChange: (guildId: string) => void;
  onRefreshGuilds: () => void;
};

function HeaderSectionComponent({
  userName,
  selectedGuildId,
  guilds,
  accessLabel,
  refreshingGuilds,
  onGuildChange,
  onRefreshGuilds,
}: HeaderSectionProps) {
  const selectedGuild = guilds.find((guild) => guild.id === selectedGuildId);
  const statusLabel = (status: ManageableGuild["status"]) =>
    status === "ready" ? "Ready" : status === "needs_setup" ? "Needs setup" : "Invite bot";

  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Voice Log Console
        </p>
        <h1 className="font-[var(--font-display)] text-4xl text-foreground">
          Welcome back, {userName}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Set log/LFG channels, configure Join-to-Create lobbies, and manage voice log channels.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedGuildId} onValueChange={onGuildChange}>
            <SelectTrigger className="h-11 w-[360px] max-w-full data-[size=default]:h-11">
              <SelectValue placeholder="Select guild" />
            </SelectTrigger>
            <SelectContent className="max-h-72 min-w-[360px] overflow-auto">
              {guilds.map((guild) => (
                <SelectItem key={guild.id} value={guild.id}>
                  <span className="flex w-full items-center justify-between gap-4">
                    <span className="truncate">{guild.name}</span>
                    <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                      {statusLabel(guild.status)}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedGuild ? (
            <Badge variant={selectedGuild.configured ? "secondary" : "outline"} className="rounded-full px-3 py-1">
              {statusLabel(selectedGuild.status)}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            onClick={onRefreshGuilds}
            disabled={refreshingGuilds}
            title="Refresh bot status"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingGuilds ? "animate-spin" : ""}`} />
            Refresh status
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            {selectedGuildId}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ThemeToggle />
        <Badge variant="secondary" className="gap-2 rounded-full px-4 py-1">
          <BadgeCheck className="h-3.5 w-3.5" />
          {accessLabel}
        </Badge>
        <SignOutButton />
      </div>
    </header>
  );
}

export const HeaderSection = memo(HeaderSectionComponent);
