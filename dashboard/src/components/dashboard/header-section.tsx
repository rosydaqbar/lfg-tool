import { memo } from "react";
import { BadgeCheck, ChevronDown, RefreshCw } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignOutButton } from "@/components/sign-out-button";
import { StatusBadge, guildStatusLabel, guildStatusTone } from "@/components/status-badge";
import type { ManageableGuild } from "@/components/dashboard/types";

type HeaderSectionProps = {
  userName: string;
  selectedGuildId: string;
  selectedGuild: ManageableGuild | null;
  guilds: ManageableGuild[];
  hasMoreGuilds: boolean;
  loadingMoreGuilds: boolean;
  guildPickerOpen: boolean;
  accessLabel: "Owner" | "Admin";
  refreshingGuilds: boolean;
  onGuildPickerOpenChange: (open: boolean) => void;
  onGuildChange: (guildId: string) => void;
  onLoadMoreGuilds: () => void;
  onRefreshGuilds: () => void;
};

function HeaderSectionComponent({
  userName,
  selectedGuildId,
  selectedGuild,
  guilds,
  hasMoreGuilds,
  loadingMoreGuilds,
  guildPickerOpen,
  accessLabel,
  refreshingGuilds,
  onGuildPickerOpenChange,
  onGuildChange,
  onLoadMoreGuilds,
  onRefreshGuilds,
}: HeaderSectionProps) {
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
          <Dialog open={guildPickerOpen} onOpenChange={onGuildPickerOpenChange}>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-[360px] max-w-full justify-between px-4"
              onClick={() => onGuildPickerOpenChange(true)}
            >
              <span className="truncate text-left">
                {selectedGuild?.name ?? "Select a server"}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Select a server</DialogTitle>
                <DialogDescription>
                  Choose the Discord server you want to manage. The dashboard will remember this server on this device.
                </DialogDescription>
              </DialogHeader>
              <div className="grid max-h-[420px] gap-2 overflow-y-auto pr-1">
                {guilds.length > 0 ? guilds.map((guild) => (
                  <button
                    type="button"
                    key={guild.id}
                    className="flex w-full items-center justify-between gap-4 rounded-lg border border-border/70 bg-card/70 px-4 py-3 text-left transition hover:bg-accent/60"
                    onClick={() => onGuildChange(guild.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{guild.name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">{guild.id}</span>
                    </span>
                    <StatusBadge tone={guildStatusTone(guild.status)} className="shrink-0 text-[11px]" dot>
                      {guildStatusLabel(guild.status)}
                    </StatusBadge>
                  </button>
                )) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No manageable Discord servers found for this account.
                  </div>
                )}
              </div>
              <DialogFooter className="items-center justify-between sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing {guilds.length} server{guilds.length === 1 ? "" : "s"}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onLoadMoreGuilds}
                  disabled={!hasMoreGuilds || loadingMoreGuilds}
                >
                  {loadingMoreGuilds ? "Loading..." : hasMoreGuilds ? "Load more" : "All servers loaded"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
          {selectedGuildId ? (
            <span className="font-mono text-xs text-muted-foreground">
              {selectedGuildId}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-nowrap items-center justify-end gap-3">
        <ThemeToggle />
        <Badge variant="secondary" className="gap-2 rounded-full px-4 py-1">
          <BadgeCheck className="h-3.5 w-3.5" />
          {accessLabel === "Owner" ? "Server owner" : "Server admin"}
        </Badge>
        <SignOutButton />
      </div>
    </header>
  );
}

export const HeaderSection = memo(HeaderSectionComponent);
