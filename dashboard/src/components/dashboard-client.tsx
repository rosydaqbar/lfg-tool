"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Building2,
  Check,
  ChevronsUpDown,
  Loader2,
  MessageSquareText,
  Plus,
  Radio,
  Volume2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SignOutButton } from "@/components/sign-out-button";

type Channel = {
  id: string;
  name: string;
  type: "voice" | "stage" | "text" | "announcement";
};

type ConfigResponse = {
  logChannelId: string | null;
  lfgChannelId: string | null;
  enabledVoiceChannelIds: string[];
  joinToCreateLobbies: {
    channelId: string;
    roleId: string | null;
    lfgEnabled: boolean;
  }[];
};

type ChannelsResponse = {
  voiceChannels: Channel[];
  textChannels: Channel[];
};

type RolesResponse = {
  roles: Role[];
};

type Role = {
  id: string;
  name: string;
  color: number;
};

type JoinToCreateLobby = {
  channelId: string;
  roleId: string | null;
  lfgEnabled: boolean;
};

type TempChannel = {
  channelId: string;
  ownerId: string;
  createdAt: string;
  lfgChannelId: string | null;
  lfgMessageId: string | null;
};

type TempVoiceDeleteLog = {
  id: string;
  channelId: string;
  channelName: string | null;
  ownerId: string;
  deletedAt: string;
  history: { userId: string; totalMs: number }[];
};


const GUILD_ID = "670147766839803924";

export default function DashboardClient({ userName }: { userName: string }) {
  const selectedGuildId = GUILD_ID;
  const [voiceChannels, setVoiceChannels] = useState<Channel[]>([]);
  const [textChannels, setTextChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [logChannelId, setLogChannelId] = useState<string>("");
  const [lfgChannelId, setLfgChannelId] = useState<string>("");
  const [enabledVoiceIds, setEnabledVoiceIds] = useState<string[]>([]);
  const [joinToCreateLobbies, setJoinToCreateLobbies] = useState<
    JoinToCreateLobby[]
  >([]);
  const [logChannelOpen, setLogChannelOpen] = useState(false);
  const [lfgChannelOpen, setLfgChannelOpen] = useState(false);
  const [lobbyPickerOpen, setLobbyPickerOpen] = useState(false);
  const [selectedLobbyVoiceId, setSelectedLobbyVoiceId] = useState<string>("");
  const [lobbyRolePickerOpen, setLobbyRolePickerOpen] = useState(false);
  const [selectedLobbyRoleId, setSelectedLobbyRoleId] = useState<string>("");
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingTempChannels, setLoadingTempChannels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempChannels, setTempChannels] = useState<TempChannel[]>([]);
  const [deleteLogs, setDeleteLogs] = useState<TempVoiceDeleteLog[]>([]);
  const [loadingDeleteLogs, setLoadingDeleteLogs] = useState(false);
  const tempChannelsLoadedOnce = useRef(false);
  const deleteLogsLoadedOnce = useRef(false);

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
    setSelectedLobbyVoiceId("");
    setSelectedLobbyRoleId("");
    setTempChannels([]);
    setDeleteLogs([]);
    setLoadingTempChannels(true);
    setLoadingDeleteLogs(true);

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

  useEffect(() => {
    if (!selectedGuildId) return;
    let active = true;

    const loadDeleteLogs = async (showLoader: boolean) => {
      if (showLoader) setLoadingDeleteLogs(true);
      try {
        const response = await fetch(
          `/api/guilds/${selectedGuildId}/voice-delete-logs`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("Failed to load delete logs");
        const data = (await response.json()) as { deleteLogs: TempVoiceDeleteLog[] };
        if (!active) return;
        setDeleteLogs(data.deleteLogs ?? []);
        deleteLogsLoadedOnce.current = true;
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load delete logs");
      } finally {
        if (active) setLoadingDeleteLogs(false);
      }
    };

    loadDeleteLogs(!deleteLogsLoadedOnce.current);
    const interval = setInterval(() => loadDeleteLogs(false), 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedGuildId]);

  useEffect(() => {
    if (!selectedGuildId) return;
    let active = true;

    const loadTempChannels = async (showLoader: boolean) => {
      if (showLoader) setLoadingTempChannels(true);
      try {
        const response = await fetch(
          `/api/guilds/${selectedGuildId}/temp-channels`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("Failed to load temp channels");
        const data = (await response.json()) as { tempChannels: TempChannel[] };
        if (!active) return;
        setTempChannels(data.tempChannels ?? []);
        tempChannelsLoadedOnce.current = true;
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load temp channels");
      } finally {
        if (active) setLoadingTempChannels(false);
      }
    };

    loadTempChannels(!tempChannelsLoadedOnce.current);
    const interval = setInterval(() => loadTempChannels(false), 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedGuildId]);

  const handleAddLobbyChannel = (channelId: string, roleId: string) => {
    if (!channelId || !roleId) return;
    setJoinToCreateLobbies((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.channelId === channelId
      );
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
  };

  const handleToggleLobbyLfg = (channelId: string, lfgEnabled: boolean) => {
    setJoinToCreateLobbies((prev) =>
      prev.map((item) =>
        item.channelId === channelId ? { ...item, lfgEnabled } : item
      )
    );
  };

  const handleRemoveLobbyChannel = (channelId: string) => {
    setJoinToCreateLobbies((prev) =>
      prev.filter((item) => item.channelId !== channelId)
    );
  };

  const handleSave = async () => {
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
  };

  const selectedLogChannel = textChannels.find(
    (channel) => channel.id === logChannelId
  );
  const logChannelLabel = selectedLogChannel
    ? `#${selectedLogChannel.name}`
    : logChannelId
      ? `ID: ${logChannelId}`
      : "Pick a text channel";
  const selectedLfgChannel = textChannels.find(
    (channel) => channel.id === lfgChannelId
  );
  const lfgChannelLabel = selectedLfgChannel
    ? `#${selectedLfgChannel.name}`
    : lfgChannelId
      ? `ID: ${lfgChannelId}`
      : "Use log channel";
  const selectedLobbyVoiceChannel = voiceChannels.find(
    (channel) => channel.id === selectedLobbyVoiceId
  );
  const lobbyVoiceLabel = selectedLobbyVoiceChannel
    ? selectedLobbyVoiceChannel.name
    : selectedLobbyVoiceId
      ? `ID: ${selectedLobbyVoiceId}`
      : "Select a lobby channel";
  const selectedLobbyRole = roles.find((role) => role.id === selectedLobbyRoleId);
  const lobbyRoleLabel = selectedLobbyRole
    ? selectedLobbyRole.name
    : selectedLobbyRoleId
      ? `ID: ${selectedLobbyRoleId}`
      : "Select a role";
  const joinToCreateLobbyIds = joinToCreateLobbies.map((item) => item.channelId);
  const hasMissingLobbyRole = joinToCreateLobbies.some(
    (item) => !item.roleId
  );
  const availableLobbyChannels = voiceChannels;

  const formatDuration = (totalMs: number) => {
    const safeMs = Math.max(0, Number(totalMs) || 0);
    const totalMinutes = Math.floor(safeMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  };


  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Voice Log Console
          </p>
          <h1 className="font-[var(--font-display)] text-4xl text-foreground">
            Welcome back, {userName}
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            Set log/LFG channels and configure Join-to-Create lobbies.
          </p>
          <Badge variant="outline" className="rounded-full px-3 py-1">
            Guild ID: <span className="font-mono">{selectedGuildId}</span>
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="gap-2 rounded-full px-4 py-1">
            <BadgeCheck className="h-3.5 w-3.5" />
            Admin
          </Badge>
          <SignOutButton />
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr_0.9fr]">
        <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-4 w-4" />
              Guild (locked)
            </CardTitle>
            <CardDescription>
              This dashboard is scoped to a single server.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Locked
            </Badge>
            <div className="text-sm text-foreground">
              Guild ID: <span className="font-mono">{selectedGuildId}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Update this ID in the dashboard component if you ever migrate.
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-150">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquareText className="h-4 w-4" />
              Log channel
            </CardTitle>
            <CardDescription>
              Choose where join events should be posted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingConfig ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Popover open={logChannelOpen} onOpenChange={setLogChannelOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={logChannelOpen}
                    className="w-full justify-between"
                    disabled={textChannels.length === 0}
                  >
                    {logChannelLabel}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput placeholder="Search channels..." />
                    <CommandEmpty>No channels found.</CommandEmpty>
                    <CommandList>
                      <CommandGroup>
                        <CommandItem
                          value="Use log channel"
                          onSelect={() => {
                            setLfgChannelId("");
                            setLfgChannelOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              lfgChannelId === "" ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span>Use log channel</span>
                        </CommandItem>
                        {textChannels.map((channel) => (
                          <CommandItem
                            key={channel.id}
                            value={`${channel.name} ${channel.id}`}
                            onSelect={() => {
                              setLogChannelId(channel.id);
                              setLogChannelOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                logChannelId === channel.id
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            <span>#{channel.name}</span>
                            <span className="ml-auto text-xs text-muted-foreground font-mono">
                              {channel.id}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
            {!loadingConfig && textChannels.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No text channels were found for this guild.
              </div>
            ) : null}
            <div className="text-xs text-muted-foreground">
              This channel receives the join messages.
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquareText className="h-4 w-4" />
              LFG channel
            </CardTitle>
            <CardDescription>
              Optional. Defaults to the log channel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingConfig ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Popover open={lfgChannelOpen} onOpenChange={setLfgChannelOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={lfgChannelOpen}
                    className="w-full justify-between"
                    disabled={textChannels.length === 0}
                  >
                    {lfgChannelLabel}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput placeholder="Search channels..." />
                    <CommandEmpty>No channels found.</CommandEmpty>
                    <CommandList>
                      <CommandGroup>
                        {textChannels.map((channel) => (
                          <CommandItem
                            key={channel.id}
                            value={`${channel.name} ${channel.id}`}
                            onSelect={() => {
                              setLfgChannelId(channel.id);
                              setLfgChannelOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                lfgChannelId === channel.id
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            <span>#{channel.name}</span>
                            <span className="ml-auto text-xs text-muted-foreground font-mono">
                              {channel.id}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
            {!loadingConfig && textChannels.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No text channels were found for this guild.
              </div>
            ) : null}
            <div className="text-xs text-muted-foreground">
              LFG posts go here when set; otherwise they use the log channel.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-200">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Radio className="h-4 w-4" />
                Voice channel settings
              </CardTitle>
              <CardDescription>
                Select channels for logging and Join-to-Create lobbies.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-4 py-1">
                Join-to-Create {joinToCreateLobbyIds.length}
              </Badge>
            </div>
          </div>
          <Separator />
        </CardHeader>
        <CardContent className="space-y-6">
          {loadingConfig ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : voiceChannels.length ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Join-to-Create lobbies</div>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  Selected {joinToCreateLobbyIds.length}
                </Badge>
              </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                  <Popover open={lobbyPickerOpen} onOpenChange={setLobbyPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={lobbyPickerOpen}
                        className="w-full justify-between"
                        disabled={availableLobbyChannels.length === 0}
                      >
                        {lobbyVoiceLabel}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                      <Command>
                        <CommandInput placeholder="Search voice channels..." />
                        <CommandEmpty>No channels available.</CommandEmpty>
                        <CommandList>
                          <CommandGroup>
                            {availableLobbyChannels.map((channel) => (
                              <CommandItem
                                key={channel.id}
                                value={`${channel.name} ${channel.id}`}
                                onSelect={() => {
                                  setSelectedLobbyVoiceId(channel.id);
                                  setLobbyPickerOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedLobbyVoiceId === channel.id
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                <span>{channel.name}</span>
                                <span className="ml-auto text-xs text-muted-foreground font-mono">
                                  {channel.id}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Popover
                    open={lobbyRolePickerOpen}
                    onOpenChange={setLobbyRolePickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={lobbyRolePickerOpen}
                        className="w-full justify-between"
                        disabled={roles.length === 0}
                      >
                        {lobbyRoleLabel}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                      <Command>
                        <CommandInput placeholder="Search roles..." />
                        <CommandEmpty>No roles available.</CommandEmpty>
                        <CommandList>
                          <CommandGroup>
                            {roles.map((role) => (
                              <CommandItem
                                key={role.id}
                                value={`${role.name} ${role.id}`}
                                onSelect={() => {
                                  setSelectedLobbyRoleId(role.id);
                                  setLobbyRolePickerOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedLobbyRoleId === role.id
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                <span>{role.name}</span>
                                <span className="ml-auto text-xs text-muted-foreground font-mono">
                                  {role.id}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button
                    type="button"
                    onClick={() => {
                      handleAddLobbyChannel(selectedLobbyVoiceId, selectedLobbyRoleId);
                      setSelectedLobbyVoiceId("");
                      setSelectedLobbyRoleId("");
                    }}
                    disabled={
                      !selectedLobbyVoiceId ||
                      !selectedLobbyRoleId
                    }
                    className="sm:shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
                {joinToCreateLobbies.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lobby channel</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Enable LFG</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {joinToCreateLobbies.map((lobby) => {
                        const channel = voiceChannels.find(
                          (item) => item.id === lobby.channelId
                        );
                        const role = roles.find((item) => item.id === lobby.roleId);
                        return (
                          <TableRow key={lobby.channelId}>
                            <TableCell>
                              <div className="text-sm font-medium">
                                {channel?.name ?? lobby.channelId}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {lobby.channelId}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">
                                {role?.name ?? lobby.roleId ?? "Missing role"}
                              </div>
                              {lobby.roleId ? (
                                <div className="text-xs text-muted-foreground font-mono">
                                  {lobby.roleId}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={lobby.lfgEnabled}
                                  onCheckedChange={(checked) =>
                                    handleToggleLobbyLfg(lobby.channelId, checked)
                                  }
                                  aria-label={`Enable LFG for ${channel?.name ?? lobby.channelId}`}
                                />
                                <span className="text-xs text-muted-foreground">
                                  {lobby.lfgEnabled ? "Enabled" : "Disabled"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => handleRemoveLobbyChannel(lobby.channelId)}
                                aria-label={`Remove ${channel?.name ?? lobby.channelId}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    No lobbies selected yet. Users will need a lobby to create
                    squads.
                  </div>
                )}
                {roles.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    No roles were found. The bot token needs permission to read
                    roles.
                  </div>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  Join-to-Create lobbies create a temporary channel per user.
                </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
              No voice channels were found for this guild.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              Add channels and roles with the dropdowns, then save.
            </div>
            {hasMissingLobbyRole ? (
              <div className="text-xs text-destructive">
                Each Join-to-Create lobby requires a role.
              </div>
            ) : null}
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                loadingConfig ||
                logChannelId.trim().length === 0 ||
                hasMissingLobbyRole
              }
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving
                </span>
              ) : (
                "Save configuration"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Volume2 className="h-4 w-4" />
            Active temp channels
          </CardTitle>
          <CardDescription>
            Read-only view of Join-to-Create channels currently tracked. Refreshes every 15s.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingTempChannels ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : tempChannels.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>LFG message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tempChannels.map((item) => {
                  const channelLink = `https://discordapp.com/channels/${selectedGuildId}/${item.channelId}`;
                  const messageLink =
                    item.lfgChannelId && item.lfgMessageId
                      ? `https://discordapp.com/channels/${selectedGuildId}/${item.lfgChannelId}/${item.lfgMessageId}`
                      : null;
                  return (
                    <TableRow key={item.channelId}>
                      <TableCell>
                        <a
                          href={channelLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground transition hover:bg-muted"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                          <span className="font-mono">{item.channelId}</span>
                        </a>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono">{item.ownerId}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        {messageLink ? (
                          <a
                            href={messageLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary underline-offset-4 hover:underline"
                          >
                            Open post
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Not posted
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
              No active temp channels found.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-[400ms]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Volume2 className="h-4 w-4" />
            Voice Log
          </CardTitle>
          <CardDescription>
            Log permanen channel temp yang sudah terhapus karena kosong, termasuk history durasi user.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingDeleteLogs ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : deleteLogs.length ? (
            <div className="space-y-4">
              {deleteLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-border bg-muted/30 p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <Badge variant="secondary" className="rounded-full px-3 py-1">
                      Channel: {log.channelName || "(unknown)"}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground">
                      {log.channelId}
                    </span>
                    <Badge variant="secondary" className="rounded-full px-3 py-1">
                      Owner: {log.ownerId}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Deleted: {new Date(log.deletedAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">History</div>
                    {log.history.length ? (
                      <div className="space-y-1">
                        {log.history.slice(0, 15).map((item) => (
                          <div
                            key={`delete-history-${log.id}-${item.userId}`}
                            className="text-xs text-muted-foreground"
                          >
                            <span className="font-mono text-foreground">{item.userId}</span>
                            {" "}• total: <span className="font-mono">{formatDuration(item.totalMs)}</span>
                          </div>
                        ))}
                        {log.history.length > 15 ? (
                          <div className="text-xs text-muted-foreground">
                            ...dan {log.history.length - 15} lainnya
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Tidak ada riwayat user</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
              Belum ada log penghapusan temp channel.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
