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
  joinToCreateLobbyIds: string[];
};

type ChannelsResponse = {
  voiceChannels: Channel[];
  textChannels: Channel[];
};

type TempChannel = {
  channelId: string;
  ownerId: string;
  createdAt: string;
  lfgChannelId: string | null;
  lfgMessageId: string | null;
};

type ProcessMetric = {
  service: string;
  pid: number;
  cpuPercent: number;
  memoryRss: number;
  memoryHeapUsed: number;
  memoryHeapTotal: number;
  uptimeSeconds: number;
  updatedAt: string;
};

const GUILD_ID = "670147766839803924";

export default function DashboardClient({ userName }: { userName: string }) {
  const selectedGuildId = GUILD_ID;
  const [voiceChannels, setVoiceChannels] = useState<Channel[]>([]);
  const [textChannels, setTextChannels] = useState<Channel[]>([]);
  const [logChannelId, setLogChannelId] = useState<string>("");
  const [lfgChannelId, setLfgChannelId] = useState<string>("");
  const [enabledVoiceIds, setEnabledVoiceIds] = useState<string[]>([]);
  const [joinToCreateLobbyIds, setJoinToCreateLobbyIds] = useState<string[]>([]);
  const [logChannelOpen, setLogChannelOpen] = useState(false);
  const [lfgChannelOpen, setLfgChannelOpen] = useState(false);
  const [voiceFilter, setVoiceFilter] = useState<string>("");
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingTempChannels, setLoadingTempChannels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempChannels, setTempChannels] = useState<TempChannel[]>([]);
  const tempChannelsLoadedOnce = useRef(false);
  const [metrics, setMetrics] = useState<ProcessMetric[]>([]);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  useEffect(() => {
    if (!selectedGuildId) return;
    let active = true;
    setLoadingConfig(true);
    setError(null);
    setVoiceChannels([]);
    setTextChannels([]);
    setEnabledVoiceIds([]);
    setJoinToCreateLobbyIds([]);
    setLogChannelId("");
    setLfgChannelId("");
    setVoiceFilter("");
    setTempChannels([]);
    setLoadingTempChannels(true);

    Promise.all([
      fetch(`/api/guilds/${selectedGuildId}/channels`).then(async (response) => {
        if (!response.ok) throw new Error("Failed to load channels");
        return response.json() as Promise<ChannelsResponse>;
      }),
      fetch(`/api/guilds/${selectedGuildId}/config`).then(async (response) => {
        if (!response.ok) throw new Error("Failed to load config");
        return response.json() as Promise<ConfigResponse>;
      }),
    ])
      .then(([channels, config]) => {
        if (!active) return;
        setVoiceChannels(channels.voiceChannels);
        setTextChannels(channels.textChannels);
        setLogChannelId(config.logChannelId ?? "");
        setLfgChannelId(config.lfgChannelId ?? "");
        setEnabledVoiceIds(config.enabledVoiceChannelIds ?? []);
        setJoinToCreateLobbyIds(config.joinToCreateLobbyIds ?? []);
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
    let active = true;

    const loadMetrics = async (showLoader: boolean) => {
      if (showLoader) setMetricsLoading(true);
      try {
        const response = await fetch("/api/metrics", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load metrics");
        const data = (await response.json()) as { metrics: ProcessMetric[] };
        if (!active) return;
        setMetrics(data.metrics ?? []);
        setMetricsError(null);
      } catch (err) {
        if (!active) return;
        setMetricsError(err instanceof Error ? err.message : "Failed to load metrics");
      } finally {
        if (active) setMetricsLoading(false);
      }
    };

    loadMetrics(true);
    const interval = setInterval(() => loadMetrics(false), 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

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

  useEffect(() => {
    if (!selectedGuildId || loadingConfig) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        const isEditable =
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          tagName === "SELECT" ||
          target.isContentEditable;
        if (isEditable) return;
      }

      if (event.key === "Escape") {
        setVoiceFilter("");
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        setVoiceFilter((prev) => prev.slice(0, -1));
        return;
      }

      if (
        event.key.length === 1 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        setVoiceFilter((prev) => (prev + event.key).slice(0, 40));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedGuildId, loadingConfig]);

  const handleToggle = (channelId: string, checked: boolean) => {
    setEnabledVoiceIds((prev) => {
      if (checked) {
        return prev.includes(channelId) ? prev : [...prev, channelId];
      }
      return prev.filter((id) => id !== channelId);
    });
  };

  const handleLobbyToggle = (channelId: string, checked: boolean) => {
    setJoinToCreateLobbyIds((prev) => {
      if (checked) {
        return prev.includes(channelId) ? prev : [...prev, channelId];
      }
      return prev.filter((id) => id !== channelId);
    });
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

    const joinToCreateLobbyIdsPayload = Array.from(
      new Set(
        joinToCreateLobbyIds
          .map((id) => id.trim())
          .filter((value) => value.length > 0)
      )
    );

    try {
      const response = await fetch(`/api/guilds/${trimmedGuildId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logChannelId: trimmedLogChannelId,
          lfgChannelId: trimmedLfgChannelId.length > 0 ? trimmedLfgChannelId : null,
          enabledVoiceChannelIds,
          joinToCreateLobbyIds: joinToCreateLobbyIdsPayload,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save configuration");
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

  const enabledCount = enabledVoiceIds.length;
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
  const botMetric = metrics.find((item) => item.service === "bot") ?? null;
  const dashboardMetric =
    metrics.find((item) => item.service === "dashboard") ?? null;
  const voiceFilterValue = voiceFilter.trim().toLowerCase();
  const filteredVoiceChannels = voiceFilterValue
    ? voiceChannels.filter(
        (channel) =>
          channel.name.toLowerCase().includes(voiceFilterValue) ||
          channel.id.includes(voiceFilterValue) ||
          channel.type.includes(voiceFilterValue)
      )
    : voiceChannels;

  const formatBytes = (value: number) => {
    const mb = value / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
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
            Set a log channel and toggle which voice channels should be
            tracked.
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

      <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Resource monitor</CardTitle>
          <div className="text-xs text-muted-foreground">
            Updates every 5s
          </div>
        </CardHeader>
        <CardContent>
          {metricsError ? (
            <div className="text-xs text-destructive">{metricsError}</div>
          ) : metricsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { label: "Bot", metric: botMetric },
                { label: "Dashboard", metric: dashboardMetric },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-border bg-muted/30 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{item.label}</div>
                    <Badge variant={item.metric ? "secondary" : "outline"}>
                      {item.metric ? "Online" : "No data"}
                    </Badge>
                  </div>
                  {item.metric ? (
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div>
                        CPU: {item.metric.cpuPercent.toFixed(1)}% · RSS: {formatBytes(item.metric.memoryRss)} · Heap: {formatBytes(item.metric.memoryHeapUsed)} / {formatBytes(item.metric.memoryHeapTotal)}
                      </div>
                      <div>
                        PID: {item.metric.pid} · Uptime: {formatUptime(item.metric.uptimeSeconds)}
                      </div>
                      <div>
                        Updated: {new Date(item.metric.updatedAt).toLocaleTimeString()}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Waiting for metrics...
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
                Toggle channels for logging and Join-to-Create lobbies.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-4 py-1">
                Logging {enabledCount} / {voiceChannels.length}
              </Badge>
              <Badge variant="secondary" className="rounded-full px-4 py-1">
                Join-to-Create {joinToCreateLobbyIds.length}
              </Badge>
              {voiceFilter ? (
                <Badge variant="outline" className="gap-2 rounded-full px-3 py-1">
                  Filter: <span className="font-mono">{voiceFilter}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setVoiceFilter("")}
                    aria-label="Clear voice channel filter"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ) : null}
            </div>
          </div>
          <Separator />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Type to filter voice channels (Esc clears, Backspace deletes)
              </div>
              <div className="text-xs text-muted-foreground">
                Showing {filteredVoiceChannels.length} of {voiceChannels.length}
              </div>
            </div>
          </div>

          {loadingConfig ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : voiceChannels.length ? (
            filteredVoiceChannels.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Log joins</TableHead>
                    <TableHead className="text-right">Join-to-Create</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVoiceChannels.map((channel) => {
                    const checked = enabledVoiceIds.includes(channel.id);
                    const lobbyChecked = joinToCreateLobbyIds.includes(channel.id);
                    return (
                      <TableRow key={channel.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="uppercase">
                              {channel.type}
                            </Badge>
                            <span className="text-sm font-medium">
                              {channel.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={checked}
                            onCheckedChange={(value) =>
                              handleToggle(channel.id, value)
                            }
                            disabled={loadingConfig}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={lobbyChecked}
                            onCheckedChange={(value) =>
                              handleLobbyToggle(channel.id, value)
                            }
                            disabled={loadingConfig}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                No voice channels match your search.
              </div>
            )
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
              No voice channels were found for this guild.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              If no channels are selected, the bot will log all joins by
              default.
            </div>
            <div className="text-xs text-muted-foreground">
              Join-to-Create lobbies create a temporary channel per user.
            </div>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                loadingConfig ||
                logChannelId.trim().length === 0
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
    </div>
  );
}
