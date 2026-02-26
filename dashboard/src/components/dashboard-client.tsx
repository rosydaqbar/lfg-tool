"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { ChannelConfigCards } from "@/components/dashboard/channel-config-cards";
import { HeaderSection } from "@/components/dashboard/header-section";
import { VoiceSettingsSection } from "@/components/dashboard/voice-settings-section";
import { ActiveTempChannelsCard } from "@/components/dashboard/active-temp-channels-card";
import { VoiceLogDeletedCard } from "@/components/dashboard/voice-log-deleted-card";
import type {
  ChannelsResponse,
  Channel,
  ConfigResponse,
  JoinToCreateLobby,
  Role,
  RolesResponse,
} from "@/components/dashboard/types";

const GUILD_ID = "670147766839803924";

export default function DashboardClient({ userName }: { userName: string }) {
  const selectedGuildId = GUILD_ID;
  const [activeTab, setActiveTab] = useState<
    "settings" | "active-temp" | "voice-log"
  >("settings");
  const [voiceChannels, setVoiceChannels] = useState<Channel[]>([]);
  const [textChannels, setTextChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [logChannelId, setLogChannelId] = useState("");
  const [lfgChannelId, setLfgChannelId] = useState("");
  const [enabledVoiceIds, setEnabledVoiceIds] = useState<string[]>([]);
  const [joinToCreateLobbies, setJoinToCreateLobbies] = useState<
    JoinToCreateLobby[]
  >([]);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedGuildId) return;
    let active = true;
    setLoadingConfig(true);
    setError(null);
    setVoiceChannels([]);
    setTextChannels([]);
    setRoles([]);
    setEnabledVoiceIds([]);
    setJoinToCreateLobbies([]);
    setLogChannelId("");
    setLfgChannelId("");

    Promise.all([
      fetch(`/api/guilds/${selectedGuildId}/channels`).then(async (response) => {
        if (!response.ok) throw new Error("Failed to load channels");
        return response.json() as Promise<ChannelsResponse>;
      }),
      fetch(`/api/guilds/${selectedGuildId}/config`).then(async (response) => {
        if (!response.ok) throw new Error("Failed to load config");
        return response.json() as Promise<ConfigResponse>;
      }),
      fetch(`/api/guilds/${selectedGuildId}/roles`).then(async (response) => {
        if (!response.ok) throw new Error("Failed to load roles");
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
          }))
        );
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
  }, [selectedGuildId]);

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
      return [...prev, { channelId, roleId, lfgEnabled: true }];
    });
  }, []);

  const handleToggleLobbyLfg = useCallback((channelId: string, lfgEnabled: boolean) => {
    setJoinToCreateLobbies((prev) =>
      prev.map((item) =>
        item.channelId === channelId ? { ...item, lfgEnabled } : item
      )
    );
  }, []);

  const handleRemoveLobbyChannel = useCallback((channelId: string) => {
    setJoinToCreateLobbies((prev) =>
      prev.filter((item) => item.channelId !== channelId)
    );
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
    selectedGuildId,
  ]);

  const memoVoiceChannels = useMemo(() => voiceChannels, [voiceChannels]);
  const memoTextChannels = useMemo(() => textChannels, [textChannels]);
  const memoRoles = useMemo(() => roles, [roles]);
  const memoJoinToCreateLobbies = useMemo(
    () => joinToCreateLobbies,
    [joinToCreateLobbies]
  );

  return (
    <div className="flex flex-col gap-10">
      <HeaderSection userName={userName} selectedGuildId={selectedGuildId} />

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="inline-flex w-full flex-wrap items-center gap-2 rounded-xl border border-border bg-card/70 p-2 backdrop-blur">
        <Button
          type="button"
          variant={activeTab === "settings" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("settings")}
        >
          Settings
        </Button>
        <Button
          type="button"
          variant={activeTab === "active-temp" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("active-temp")}
        >
          Active temp channels
        </Button>
        <Button
          type="button"
          variant={activeTab === "voice-log" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("voice-log")}
        >
          Voice Log
        </Button>
      </div>

      {activeTab === "settings" ? (
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
            onAddLobbyChannel={handleAddLobbyChannel}
            onToggleLobbyLfg={handleToggleLobbyLfg}
            onRemoveLobbyChannel={handleRemoveLobbyChannel}
            onSave={handleSave}
          />
        </>
      ) : null}

      {activeTab === "active-temp" ? (
        <ActiveTempChannelsCard selectedGuildId={selectedGuildId} />
      ) : null}

      {activeTab === "voice-log" ? (
        <VoiceLogDeletedCard selectedGuildId={selectedGuildId} />
      ) : null}
    </div>
  );
}
