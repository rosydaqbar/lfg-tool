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
import { StatusBadge, guildStatusTone } from "@/components/status-badge";
import { useDashboardI18n } from "@/components/dashboard/dashboard-i18n";
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
  const { t } = useDashboardI18n();

  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {t("dashboard.header.eyebrow", "Voice Log Console")}
        </p>
        <h1 className="font-[var(--font-display)] text-4xl text-foreground">
          {t("dashboard.header.welcome", "Welcome back, {userName}", { userName })}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          {t(
            "dashboard.header.description",
            "Set log/LFG channels, configure Join-to-Create lobbies, and manage voice log channels."
          )}
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
                {selectedGuild?.name ??
                  t("dashboard.header.guildPicker.placeholder", "Select a server")}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
            <DialogContent
              className="sm:max-w-xl"
              closeLabel={t("common.close", "Close")}
            >
              <DialogHeader>
                <DialogTitle>
                  {t("dashboard.header.guildPicker.title", "Select a server")}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    "dashboard.header.guildPicker.description",
                    "Choose the Discord server you want to manage. The dashboard will remember this server on this device."
                  )}
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
                      {guild.status === "ready"
                        ? t("dashboard.header.guildPicker.status.ready", "Ready")
                        : guild.status === "needs_setup"
                          ? t(
                              "dashboard.header.guildPicker.status.needsSetup",
                              "Needs setup"
                            )
                          : t(
                              "dashboard.header.guildPicker.status.inviteBot",
                              "Invite bot"
                            )}
                    </StatusBadge>
                  </button>
                )) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    {t(
                      "dashboard.header.guildPicker.empty",
                      "No manageable Discord servers found for this account."
                    )}
                  </div>
                )}
              </div>
              <DialogFooter className="items-center justify-between sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {t(
                    guilds.length === 1
                      ? "dashboard.header.guildPicker.serverCount.one"
                      : "dashboard.header.guildPicker.serverCount.many",
                    guilds.length === 1
                      ? "Showing {count} server"
                      : "Showing {count} servers",
                    { count: guilds.length }
                  )}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onLoadMoreGuilds}
                  disabled={!hasMoreGuilds || loadingMoreGuilds}
                >
                  {loadingMoreGuilds
                    ? t("dashboard.header.guildPicker.loading", "Loading...")
                    : hasMoreGuilds
                      ? t("dashboard.header.guildPicker.loadMore", "Load more")
                      : t("dashboard.header.guildPicker.allLoaded", "All servers loaded")}
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
            title={t("dashboard.header.refresh.title", "Refresh bot status")}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingGuilds ? "animate-spin" : ""}`} />
            {t("dashboard.header.refresh.button", "Refresh status")}
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
          {accessLabel === "Owner"
            ? t("dashboard.header.access.owner", "Server owner")
            : t("dashboard.header.access.admin", "Server admin")}
        </Badge>
        <SignOutButton />
      </div>
    </header>
  );
}

export const HeaderSection = memo(HeaderSectionComponent);
