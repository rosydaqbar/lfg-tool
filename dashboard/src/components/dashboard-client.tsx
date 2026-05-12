"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LayoutDashboard, RefreshCw, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dashboardCard, dashboardError, dashboardInset, dashboardWarning } from "@/components/ui/patterns";

import { ChannelConfigCards } from "@/components/dashboard/channel-config-cards";
import { HeaderSection } from "@/components/dashboard/header-section";
import { VoiceSettingsSection } from "@/components/dashboard/voice-settings-section";
import { AutoRoleSection } from "@/components/dashboard/auto-role-section";
import { AutoRoleRequestsCard } from "@/components/dashboard/auto-role-requests-card";
import { ActiveTempChannelsCard } from "@/components/dashboard/active-temp-channels-card";
import { VoiceLeaderboardCard } from "@/components/dashboard/voice-leaderboard-card";
import { ResetSettingsSection } from "@/components/dashboard/reset-settings-section";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { VoiceLogPageClient } from "@/components/dashboard/voice-log-page-client";
import type {
  ChannelsResponse,
  Channel,
  ConfigResponse,
  JoinToCreateLobby,
  AutoRoleConfig,
  Role,
  RolesResponse,
  GuildsResponse,
  ManageableGuild,
} from "@/components/dashboard/types";

const DEFAULT_AUTO_ROLE_CONFIG: AutoRoleConfig = {
  enabled: false,
  requiredRoleMode: "all_roles",
  requiredRoleIds: [],
  rules: [],
  requireAdminApproval: false,
  approvalChannelId: null,
};

const SELECTED_GUILD_STORAGE_KEY = "lfg-tool:selected-guild-id";

function mergeGuilds(current: ManageableGuild[], incoming: ManageableGuild[]) {
  const guildsById = new Map(current.map((guild) => [guild.id, guild]));
  for (const guild of incoming) {
    guildsById.set(guild.id, guild);
  }
  return Array.from(guildsById.values());
}

function normalizeAutoRoleConfig(
  value: Partial<AutoRoleConfig> | null | undefined
): AutoRoleConfig {
  if (!value || typeof value !== "object") return DEFAULT_AUTO_ROLE_CONFIG;

  const rules = Array.isArray(value.rules)
    ? value.rules
        .filter((rule) => rule && typeof rule === "object")
        .map((rule, index) => {
          const requiredRoleMode: "any_role" | "specific_role" =
            rule.requiredRoleMode === "specific_role"
              ? "specific_role"
              : "any_role";
          return {
            requiredRoleMode,
          id:
            typeof rule.id === "string" && rule.id.trim().length > 0
              ? rule.id
              : `rule_${index + 1}`,
          condition:
            rule.condition === "more_than" ||
            rule.condition === "less_than" ||
            rule.condition === "equal_to"
              ? rule.condition
              : "more_than",
          hours: Math.max(0, Number.isFinite(Number(rule.hours)) ? Math.floor(Number(rule.hours)) : 0),
          roleId: typeof rule.roleId === "string" ? rule.roleId : "",
          requiredRoleId:
            typeof rule.requiredRoleId === "string" && rule.requiredRoleId.trim().length > 0
              ? rule.requiredRoleId
              : null,
          };
        })
    : [];

  return {
    enabled: value.enabled === true,
    requiredRoleMode:
      value.requiredRoleMode === "selected_roles" ? "selected_roles" : "all_roles",
    requiredRoleIds: Array.isArray(value.requiredRoleIds)
      ? value.requiredRoleIds.filter((id): id is string => typeof id === "string")
      : [],
    rules,
    requireAdminApproval: value.requireAdminApproval === true,
    approvalChannelId:
      typeof value.approvalChannelId === "string" && value.approvalChannelId.trim().length > 0
        ? value.approvalChannelId
        : null,
  };
}

export default function DashboardClient({
  userName,
}: {
  userName: string;
}) {
  const router = useRouter();
  const [guilds, setGuilds] = useState<ManageableGuild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings">("dashboard");
  const [detailView, setDetailView] = useState<
    "active-temp" | "voice-log" | "leaderboard" | "auto-role" | null
  >(null);
  const [voiceChannels, setVoiceChannels] = useState<Channel[]>([]);
  const [textChannels, setTextChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [logChannelId, setLogChannelId] = useState("");
  const [lfgChannelId, setLfgChannelId] = useState("");
  const [enabledVoiceIds, setEnabledVoiceIds] = useState<string[]>([]);
  const [joinToCreateLobbies, setJoinToCreateLobbies] = useState<
    JoinToCreateLobby[]
  >([]);
  const [autoRoleConfig, setAutoRoleConfig] = useState<AutoRoleConfig>(
    DEFAULT_AUTO_ROLE_CONFIG
  );
  const [loadingGuilds, setLoadingGuilds] = useState(true);
  const [refreshingGuilds, setRefreshingGuilds] = useState(false);
  const [loadingMoreGuilds, setLoadingMoreGuilds] = useState(false);
  const [hasMoreGuilds, setHasMoreGuilds] = useState(false);
  const [nextGuildOffset, setNextGuildOffset] = useState(0);
  const [guildPickerOpen, setGuildPickerOpen] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGuildPage = useCallback(async ({
    offset,
    reset,
    selectedGuildId: selectedGuildIdForRequest,
  }: {
    offset: number;
    reset: boolean;
    selectedGuildId?: string;
  }) => {
    const params = new URLSearchParams({
      limit: "10",
      offset: String(offset),
    });
    if (selectedGuildIdForRequest) {
      params.set("selectedGuildId", selectedGuildIdForRequest);
    }

    const response = await fetch(`/api/guilds?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || "Failed to load guilds");
    }

    const payload = (await response.json()) as GuildsResponse;
    const nextGuilds = payload.guilds ?? [];
    const guildsWithSelected = payload.selectedGuild
      ? mergeGuilds(nextGuilds, [payload.selectedGuild])
      : nextGuilds;

    setGuilds((current) => reset ? guildsWithSelected : mergeGuilds(current, guildsWithSelected));
    setHasMoreGuilds(payload.hasMore === true);
    setNextGuildOffset(payload.nextOffset ?? offset + 10);

    if (selectedGuildIdForRequest && !payload.selectedGuild) {
      localStorage.removeItem(SELECTED_GUILD_STORAGE_KEY);
      setSelectedGuildId("");
      setGuildPickerOpen(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const storedGuildId = localStorage.getItem(SELECTED_GUILD_STORAGE_KEY)?.trim() ?? "";
    setSelectedGuildId(storedGuildId);
    setGuildPickerOpen(!storedGuildId);
    setLoadingGuilds(true);

    loadGuildPage({ offset: 0, reset: true, selectedGuildId: storedGuildId })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load guilds");
      })
      .finally(() => {
        if (active) setLoadingGuilds(false);
      });

    return () => {
      active = false;
    };
  }, [loadGuildPage]);

  useEffect(() => {
    if (!selectedGuildId) {
      if (!loadingGuilds && guilds.length === 0) {
        setError("No manageable Discord guilds found for this account.");
      } else {
        setError(null);
      }
      return;
    }
    const selectedGuild = guilds.find((guild) => guild.id === selectedGuildId);
    if (selectedGuild && selectedGuild.status === "invite_bot") {
      setError(null);
      setVoiceChannels([]);
      setTextChannels([]);
      setRoles([]);
      setEnabledVoiceIds([]);
      setJoinToCreateLobbies([]);
      setAutoRoleConfig(DEFAULT_AUTO_ROLE_CONFIG);
      setLogChannelId("");
      setLfgChannelId("");
      setLoadingConfig(false);
      return;
    }
    if (activeTab !== "settings") {
      setLoadingConfig(false);
      return;
    }
    let active = true;
    setLoadingConfig(true);
    setError(null);
    setVoiceChannels([]);
    setTextChannels([]);
    setRoles([]);
    setEnabledVoiceIds([]);
    setJoinToCreateLobbies([]);
    setAutoRoleConfig(DEFAULT_AUTO_ROLE_CONFIG);
    setLogChannelId("");
    setLfgChannelId("");

    Promise.all([
      fetch(`/api/guilds/${selectedGuildId}/channels`).then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "Failed to load channels");
        }
        return response.json() as Promise<ChannelsResponse>;
      }),
      fetch(`/api/guilds/${selectedGuildId}/config`).then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "Failed to load config");
        }
        return response.json() as Promise<ConfigResponse>;
      }),
      fetch(`/api/guilds/${selectedGuildId}/roles`).then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "Failed to load roles");
        }
        return response.json() as Promise<RolesResponse>;
      }),
    ])
      .then(([channels, config, rolesResponse]) => {
        if (!active) return;
        setVoiceChannels(channels.voiceChannels);
        setTextChannels(channels.textChannels);
        setRoles(rolesResponse.roles ?? []);
        setLogChannelId(config.logChannelId ?? "");
        setLfgChannelId(config.lfgChannelId ?? "");
        setEnabledVoiceIds(config.enabledVoiceChannelIds ?? []);
        setJoinToCreateLobbies(
          (config.joinToCreateLobbies ?? []).map((item) => ({
            channelId: item.channelId,
            roleId: item.roleId,
            lfgEnabled: item.lfgEnabled ?? true,
            lfgReminderEnabled: item.lfgReminderEnabled ?? false,
            lfgReminderSeconds: item.lfgReminderSeconds ?? 30,
          }))
        );
        setAutoRoleConfig(normalizeAutoRoleConfig(config.autoRoleConfig));
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message ?? "Failed to load dashboard data");
      })
      .finally(() => {
        if (active) setLoadingConfig(false);
      });

    return () => {
      active = false;
    };
  }, [activeTab, guilds, loadingGuilds, selectedGuildId]);

  const handleAddLobbyChannel = useCallback((channelId: string, roleId: string) => {
    if (!channelId || !roleId) return;
    setJoinToCreateLobbies((prev) => {
      const existingIndex = prev.findIndex((item) => item.channelId === channelId);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          channelId,
          roleId,
        };
        return next;
      }
      return [...prev, { channelId, roleId, lfgEnabled: true, lfgReminderEnabled: false, lfgReminderSeconds: 30 }];
    });
  }, []);

  const handleToggleLobbyLfg = useCallback((channelId: string, lfgEnabled: boolean) => {
    setJoinToCreateLobbies((prev) =>
      prev.map((item) =>
        item.channelId === channelId ? { ...item, lfgEnabled } : item
      )
    );
  }, []);

  const handleToggleLobbyReminder = useCallback((channelId: string, lfgReminderEnabled: boolean) => {
    setJoinToCreateLobbies((prev) =>
      prev.map((item) =>
        item.channelId === channelId ? { ...item, lfgReminderEnabled } : item
      )
    );
  }, []);

  const handleLobbyReminderSecondsChange = useCallback((channelId: string, lfgReminderSeconds: number) => {
    const safeSeconds = Number.isFinite(lfgReminderSeconds)
      ? Math.max(5, Math.min(3600, Math.floor(lfgReminderSeconds)))
      : 30;
    setJoinToCreateLobbies((prev) =>
      prev.map((item) =>
        item.channelId === channelId ? { ...item, lfgReminderSeconds: safeSeconds } : item
      )
    );
  }, []);

  const handleRemoveLobbyChannel = useCallback((channelId: string) => {
    setJoinToCreateLobbies((prev) =>
      prev.filter((item) => item.channelId !== channelId)
    );
  }, []);

  const handleAddEnabledVoiceChannel = useCallback((channelId: string) => {
    const trimmed = channelId.trim();
    if (!trimmed) return;
    setEnabledVoiceIds((prev) => {
      if (prev.includes(trimmed)) return prev;
      return [...prev, trimmed];
    });
  }, []);

  const handleRemoveEnabledVoiceChannel = useCallback((channelId: string) => {
    setEnabledVoiceIds((prev) => prev.filter((id) => id !== channelId));
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedGuildId = selectedGuildId.trim();
    const trimmedLogChannelId = logChannelId.trim();
    const trimmedLfgChannelId = lfgChannelId.trim();
    if (!trimmedGuildId || !trimmedLogChannelId) return;
    setSaving(true);

    const enabledVoiceChannelIds = Array.from(
      new Set(
        enabledVoiceIds
          .map((id) => id.trim())
          .filter((value) => value.length > 0)
      )
    );

    if (joinToCreateLobbies.some((item) => !item.roleId)) {
      toast.error("Save failed", {
        description: "Each Join-to-Create lobby requires a role.",
      });
      setSaving(false);
      return;
    }

    const joinToCreateLobbiesPayload = Array.from(
      new Map(
        joinToCreateLobbies
          .filter((item) => item.channelId)
          .map((item) => [item.channelId, item])
      ).values()
    ).map((item) => ({
      channelId: item.channelId.trim(),
      roleId: (item.roleId ?? "").trim(),
      lfgEnabled: item.lfgEnabled ?? true,
      lfgReminderEnabled: item.lfgReminderEnabled ?? false,
      lfgReminderSeconds: Math.max(5, Math.min(3600, Math.floor(item.lfgReminderSeconds ?? 30))),
    }));

    try {
      const response = await fetch(`/api/guilds/${trimmedGuildId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logChannelId: trimmedLogChannelId,
          lfgChannelId: trimmedLfgChannelId.length > 0 ? trimmedLfgChannelId : null,
          enabledVoiceChannelIds,
          joinToCreateLobbies: joinToCreateLobbiesPayload,
          autoRoleConfig,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "Failed to save configuration");
      }

      toast.success("Configuration saved", {
        description: "The bot will pick up the new settings shortly.",
      });
      setGuilds((prev) =>
        prev.map((guild) =>
          guild.id === trimmedGuildId
            ? { ...guild, configured: true, status: "ready" as const }
            : guild
        )
      );
    } catch (err) {
      toast.error("Save failed", {
        description:
          err instanceof Error ? err.message : "Unexpected error occurred",
      });
    } finally {
      setSaving(false);
    }
  }, [
    enabledVoiceIds,
    joinToCreateLobbies,
    lfgChannelId,
    logChannelId,
    autoRoleConfig,
    selectedGuildId,
  ]);

  const handleRefreshGuilds = useCallback(async () => {
    setRefreshingGuilds(true);
    setError(null);
    try {
      await loadGuildPage({ offset: 0, reset: true, selectedGuildId });
      toast.success("Bot status refreshed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to refresh guild status";
      setError(message);
      toast.error("Refresh failed", { description: message });
    } finally {
      setRefreshingGuilds(false);
    }
  }, [loadGuildPage, selectedGuildId]);

  const handleLoadMoreGuilds = useCallback(async () => {
    if (!hasMoreGuilds || loadingMoreGuilds) return;
    setLoadingMoreGuilds(true);
    setError(null);
    try {
      await loadGuildPage({ offset: nextGuildOffset, reset: false, selectedGuildId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load more guilds";
      setError(message);
      toast.error("Load more failed", { description: message });
    } finally {
      setLoadingMoreGuilds(false);
    }
  }, [hasMoreGuilds, loadingMoreGuilds, loadGuildPage, nextGuildOffset, selectedGuildId]);

  const handleGuildChange = useCallback((guildId: string) => {
    localStorage.setItem(SELECTED_GUILD_STORAGE_KEY, guildId);
    setSelectedGuildId(guildId);
    setActiveTab("dashboard");
    setDetailView(null);
    setGuildPickerOpen(false);
  }, []);

  const memoVoiceChannels = useMemo(() => voiceChannels, [voiceChannels]);
  const memoTextChannels = useMemo(() => textChannels, [textChannels]);
  const memoRoles = useMemo(() => roles, [roles]);
  const memoJoinToCreateLobbies = useMemo(
    () => joinToCreateLobbies,
    [joinToCreateLobbies]
  );

  const handleResetComplete = useCallback(() => {
    router.push("/setup");
    router.refresh();
  }, [router]);

  const selectedGuild = guilds.find((guild) => guild.id === selectedGuildId) ?? null;
  const accessLabel = selectedGuild?.accessLabel ?? "Admin";
  const canOpenGuildDashboard = selectedGuild?.status === "ready";
  const canOpenGuildSettings = selectedGuild?.status === "ready" || selectedGuild?.status === "needs_setup";

  return (
    <div className="flex flex-col gap-10">
      <HeaderSection
        userName={userName}
        selectedGuildId={selectedGuildId}
        selectedGuild={selectedGuild}
        guilds={guilds}
        hasMoreGuilds={hasMoreGuilds}
        loadingMoreGuilds={loadingMoreGuilds}
        guildPickerOpen={guildPickerOpen}
        requireGuildSelection={!selectedGuildId}
        accessLabel={accessLabel}
        refreshingGuilds={loadingGuilds || refreshingGuilds}
        onGuildPickerOpenChange={(open) => setGuildPickerOpen(!selectedGuildId || open)}
        onGuildChange={handleGuildChange}
        onLoadMoreGuilds={handleLoadMoreGuilds}
        onRefreshGuilds={handleRefreshGuilds}
      />

      {loadingGuilds ? (
        <div className={`${dashboardInset} text-sm text-muted-foreground`}>
          Loading your manageable Discord servers...
        </div>
      ) : null}

      {error ? (
        <div className={dashboardError}>
          {error}
        </div>
      ) : null}

      {selectedGuild?.status === "invite_bot" ? (
        <div className={`${dashboardCard} rounded-lg p-6`}>
          <h2 className="text-lg font-semibold text-foreground">Invite the bot to {selectedGuild.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You can manage this Discord server, but the bot is not installed there yet. Invite the bot before opening logs or settings for this guild.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {selectedGuild.inviteUrl ? (
              <Button asChild>
                <a href={selectedGuild.inviteUrl} target="_blank" rel="noreferrer">
                  Invite Bot
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={handleRefreshGuilds}
              disabled={refreshingGuilds}
            >
              <RefreshCw className={`h-4 w-4 ${refreshingGuilds ? "animate-spin" : ""}`} />
              Refresh Status
            </Button>
          </div>
        </div>
      ) : null}

      {selectedGuild?.status === "needs_setup" ? (
        <div className={`${dashboardWarning} p-6`}>
          <h2 className="text-lg font-semibold text-foreground">Finish guild setup for {selectedGuild.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick a log channel in Settings, then save. After that, this guild dashboard can show logs, stats, and live activity.
          </p>
          <Button type="button" className="mt-4" onClick={() => setActiveTab("settings")}>
            Open Settings
          </Button>
        </div>
      ) : null}

      {!selectedGuildId && !loadingGuilds ? (
        <div className={`${dashboardCard} rounded-lg p-6`}>
          <h2 className="text-lg font-semibold text-foreground">Select a server to continue</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick one Discord server first. The dashboard will save it on this device and only load data for that server.
          </p>
          <Button type="button" className="mt-4" onClick={() => setGuildPickerOpen(true)}>
            Choose Server
          </Button>
        </div>
      ) : null}

      {selectedGuildId ? (
        <>
      <div className="inline-flex w-full flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card/80 p-2 backdrop-blur">
        <Button
          type="button"
          variant={activeTab === "dashboard" ? "default" : "ghost"}
          size="lg"
          onClick={() => {
            setActiveTab("dashboard");
            setDetailView(null);
          }}
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Button>
        <Button
          type="button"
          variant={activeTab === "settings" ? "default" : "ghost"}
          size="lg"
          onClick={() => {
            setActiveTab("settings");
            setDetailView(null);
          }}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </div>

      {activeTab === "dashboard" && !detailView && canOpenGuildDashboard ? (
        <DashboardOverview selectedGuildId={selectedGuildId} onOpenDetail={setDetailView} />
      ) : null}

      {activeTab === "dashboard" && detailView && canOpenGuildDashboard ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDetailView(null)}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </div>

          {detailView === "active-temp" ? (
            <ActiveTempChannelsCard selectedGuildId={selectedGuildId} />
          ) : null}

          {detailView === "voice-log" ? (
            <VoiceLogPageClient selectedGuildId={selectedGuildId} embedded />
          ) : null}

          {detailView === "leaderboard" ? (
            <VoiceLeaderboardCard selectedGuildId={selectedGuildId} />
          ) : null}

          {detailView === "auto-role" ? (
            <AutoRoleRequestsCard selectedGuildId={selectedGuildId} />
          ) : null}
        </div>
      ) : null}

      {activeTab === "settings" && canOpenGuildSettings ? (
        <>
          <ChannelConfigCards
            loadingConfig={loadingConfig}
            textChannels={memoTextChannels}
            logChannelId={logChannelId}
            lfgChannelId={lfgChannelId}
            selectedGuildId={selectedGuildId}
            onLogChannelChange={setLogChannelId}
            onLfgChannelChange={setLfgChannelId}
          />

          <VoiceSettingsSection
            loadingConfig={loadingConfig}
            logChannelId={logChannelId}
            saving={saving}
            voiceChannels={memoVoiceChannels}
            roles={memoRoles}
            joinToCreateLobbies={memoJoinToCreateLobbies}
            enabledVoiceChannelIds={enabledVoiceIds}
            onAddLobbyChannel={handleAddLobbyChannel}
            onToggleLobbyLfg={handleToggleLobbyLfg}
            onToggleLobbyReminder={handleToggleLobbyReminder}
            onLobbyReminderSecondsChange={handleLobbyReminderSecondsChange}
            onRemoveLobbyChannel={handleRemoveLobbyChannel}
            onAddEnabledVoiceChannel={handleAddEnabledVoiceChannel}
            onRemoveEnabledVoiceChannel={handleRemoveEnabledVoiceChannel}
            onSave={handleSave}
          />

          <AutoRoleSection
            loadingConfig={loadingConfig}
            saving={saving}
            roles={memoRoles}
            textChannels={memoTextChannels}
            value={autoRoleConfig}
            onChange={setAutoRoleConfig}
            onSave={handleSave}
          />

          <ResetSettingsSection
            selectedGuildId={selectedGuildId}
            onResetComplete={handleResetComplete}
          />
        </>
      ) : null}
        </>
      ) : null}

    </div>
  );
}
