import { memo, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Radio, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { dashboardCard, dashboardEmpty, dashboardInset, dashboardPanel } from "@/components/ui/patterns";
import { useDashboardI18n } from "@/components/dashboard/dashboard-i18n";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Channel, JoinToCreateLobby, Role } from "./types";

type VoiceSettingsSectionProps = {
  loadingConfig: boolean;
  loadingChannels: boolean;
  loadingRoles: boolean;
  channelsLoaded: boolean;
  rolesLoaded: boolean;
  logChannelId: string;
  saving: boolean;
  voiceChannels: Channel[];
  roles: Role[];
  joinToCreateLobbies: JoinToCreateLobby[];
  enabledVoiceChannelIds: string[];
  onAddLobbyChannel: (channelId: string, roleId: string) => void;
  onToggleLobbyLfg: (channelId: string, lfgEnabled: boolean) => void;
  onToggleLobbyReminder: (channelId: string, lfgReminderEnabled: boolean) => void;
  onLobbyReminderSecondsChange: (channelId: string, lfgReminderSeconds: number) => void;
  onRemoveLobbyChannel: (channelId: string) => void;
  onAddEnabledVoiceChannel: (channelId: string) => void;
  onRemoveEnabledVoiceChannel: (channelId: string) => void;
  onOpenVoiceChannels: () => void;
  onOpenRoles: () => void;
  onSave: () => void;
};

function VoiceSettingsSectionComponent({
  loadingConfig,
  loadingChannels,
  loadingRoles,
  channelsLoaded,
  rolesLoaded,
  logChannelId,
  saving,
  voiceChannels,
  roles,
  joinToCreateLobbies,
  enabledVoiceChannelIds,
  onAddLobbyChannel,
  onToggleLobbyLfg,
  onToggleLobbyReminder,
  onLobbyReminderSecondsChange,
  onRemoveLobbyChannel,
  onAddEnabledVoiceChannel,
  onRemoveEnabledVoiceChannel,
  onOpenVoiceChannels,
  onOpenRoles,
  onSave,
}: VoiceSettingsSectionProps) {
  const { t } = useDashboardI18n();
  const [lobbyPickerOpen, setLobbyPickerOpen] = useState(false);
  const [lobbyRolePickerOpen, setLobbyRolePickerOpen] = useState(false);
  const [selectedLobbyVoiceId, setSelectedLobbyVoiceId] = useState("");
  const [selectedLobbyRoleId, setSelectedLobbyRoleId] = useState("");
  const [voiceLogPickerOpen, setVoiceLogPickerOpen] = useState(false);
  const [selectedVoiceLogId, setSelectedVoiceLogId] = useState("");

  const selectedLobbyVoiceChannel = useMemo(
    () => voiceChannels.find((channel) => channel.id === selectedLobbyVoiceId),
    [voiceChannels, selectedLobbyVoiceId]
  );
  const lobbyVoiceLabel = selectedLobbyVoiceChannel
    ? selectedLobbyVoiceChannel.name
    : selectedLobbyVoiceId
      ? t("settings.voice.channelId", "ID: {id}", { id: selectedLobbyVoiceId })
      : t("settings.voice.lobbies.channelPlaceholder", "Select a lobby channel");

  const selectedLobbyRole = useMemo(
    () => roles.find((role) => role.id === selectedLobbyRoleId),
    [roles, selectedLobbyRoleId]
  );
  const lobbyRoleLabel = selectedLobbyRole
    ? selectedLobbyRole.name
    : selectedLobbyRoleId
      ? t("settings.voice.roleId", "ID: {id}", { id: selectedLobbyRoleId })
      : t("settings.voice.lobbies.rolePlaceholder", "Select a role");

  const joinToCreateLobbyIds = useMemo(
    () => joinToCreateLobbies.map((item) => item.channelId),
    [joinToCreateLobbies]
  );
  const hasMissingLobbyRole = useMemo(
    () => joinToCreateLobbies.some((item) => !item.roleId),
    [joinToCreateLobbies]
  );

  const availableLobbyChannels = voiceChannels;
  const selectedVoiceLogChannel = useMemo(
    () => voiceChannels.find((channel) => channel.id === selectedVoiceLogId),
    [voiceChannels, selectedVoiceLogId]
  );
  const voiceLogChannelLabel = selectedVoiceLogChannel
    ? selectedVoiceLogChannel.name
    : selectedVoiceLogId
      ? t("settings.voice.channelId", "ID: {id}", { id: selectedVoiceLogId })
      : t("settings.voice.logs.channelPlaceholder", "Select a voice channel");

  const availableVoiceLogChannels = useMemo(
    () =>
      voiceChannels.filter(
        (channel) => !enabledVoiceChannelIds.includes(channel.id)
      ),
    [voiceChannels, enabledVoiceChannelIds]
  );

  return (
    <Card className={`${dashboardCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-200`}>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Radio className="h-4 w-4" />
              {t("settings.voice.title", "Voice channel settings")}
            </CardTitle>
            <CardDescription>
              {t(
                "settings.voice.description",
                "Select channels for logging and Join-to-Create lobbies."
              )}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-4 py-1">
              {t(
                "settings.voice.lobbies.countBadge",
                "Join-to-Create {count}",
                { count: joinToCreateLobbyIds.length }
              )}
            </Badge>
            <Badge variant="secondary" className="rounded-full px-4 py-1">
              {t("settings.voice.logs.countBadge", "Voice Log {count}", {
                count: enabledVoiceChannelIds.length,
              })}
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
        ) : (
          <div className="space-y-6">
            <div className={`space-y-4 ${dashboardPanel}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  {t("settings.voice.lobbies.title", "Join-to-Create lobbies")}
                </div>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {t("settings.voice.selectedCount", "Selected {count}", {
                    count: joinToCreateLobbyIds.length,
                  })}
                </Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
              <Popover
                open={lobbyPickerOpen}
                onOpenChange={(open) => {
                  setLobbyPickerOpen(open);
                  if (open) onOpenVoiceChannels();
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={lobbyPickerOpen}
                    className="w-full justify-between"
                  >
                    {lobbyVoiceLabel}
                    {loadingChannels ? <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" /> : null}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput
                      placeholder={t(
                        "settings.voice.searchChannelsPlaceholder",
                        "Search voice channels..."
                      )}
                    />
                    <CommandEmpty>
                      {t("settings.voice.noChannelsAvailable", "No channels available.")}
                    </CommandEmpty>
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
                onOpenChange={(open) => {
                  setLobbyRolePickerOpen(open);
                  if (open) onOpenRoles();
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={lobbyRolePickerOpen}
                    className="w-full justify-between"
                  >
                    {lobbyRoleLabel}
                    {loadingRoles ? <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" /> : null}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput
                      placeholder={t("settings.voice.searchRolesPlaceholder", "Search roles...")}
                    />
                    <CommandEmpty>
                      {t("settings.voice.noRolesAvailable", "No roles available.")}
                    </CommandEmpty>
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
                  onAddLobbyChannel(selectedLobbyVoiceId, selectedLobbyRoleId);
                  setSelectedLobbyVoiceId("");
                  setSelectedLobbyRoleId("");
                }}
                disabled={!selectedLobbyVoiceId || !selectedLobbyRoleId}
                className="sm:shrink-0"
              >
                <Plus className="h-4 w-4" />
                {t("common.add", "Add")}
              </Button>
              </div>
              {joinToCreateLobbies.length ? (
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("settings.voice.lobbies.channelColumn", "Lobby channel")}</TableHead>
                    <TableHead>{t("settings.voice.lobbies.roleColumn", "Role")}</TableHead>
                    <TableHead>{t("settings.voice.lobbies.lfgColumn", "Enable LFG")}</TableHead>
                    <TableHead>{t("settings.voice.lobbies.reminderColumn", "Enable Reminder")}</TableHead>
                    <TableHead>{t("settings.voice.lobbies.reminderTimeColumn", "Reminder Time")}</TableHead>
                    <TableHead className="text-right">{t("common.action", "Action")}</TableHead>
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
                            {role?.name ??
                              lobby.roleId ??
                              t("settings.voice.lobbies.missingRole", "Missing role")}
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
                                onToggleLobbyLfg(lobby.channelId, checked)
                              }
                              aria-label={t(
                                "settings.voice.lobbies.enableLfgAria",
                                "Enable LFG for {channel}",
                                { channel: channel?.name ?? lobby.channelId }
                              )}
                            />
                            <span className="text-xs text-muted-foreground">
                              {lobby.lfgEnabled
                                ? t("common.enabled", "Enabled")
                                : t("common.disabled", "Disabled")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={lobby.lfgReminderEnabled}
                              disabled={!lobby.lfgEnabled}
                              onCheckedChange={(checked) =>
                                onToggleLobbyReminder(lobby.channelId, checked)
                              }
                              aria-label={t(
                                "settings.voice.lobbies.enableReminderAria",
                                "Enable LFG reminder for {channel}",
                                { channel: channel?.name ?? lobby.channelId }
                              )}
                            />
                            <span className="text-xs text-muted-foreground">
                              {lobby.lfgReminderEnabled
                                ? t("common.enabled", "Enabled")
                                : t("common.disabled", "Disabled")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={5}
                              max={3600}
                              value={lobby.lfgReminderSeconds ?? 30}
                              disabled={!lobby.lfgEnabled || !lobby.lfgReminderEnabled}
                              onChange={(event) =>
                                onLobbyReminderSecondsChange(lobby.channelId, Number(event.target.value))
                              }
                              className="h-8 w-24"
                              aria-label={t(
                                "settings.voice.lobbies.reminderTimeAria",
                                "Reminder time for {channel}",
                                { channel: channel?.name ?? lobby.channelId }
                              )}
                            />
                            <span className="text-xs text-muted-foreground">
                              {t("common.secondsAbbreviation", "sec")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => onRemoveLobbyChannel(lobby.channelId)}
                            aria-label={t(
                              "settings.voice.removeChannelAria",
                              "Remove {channel}",
                              { channel: channel?.name ?? lobby.channelId }
                            )}
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
                  {t(
                    "settings.voice.lobbies.empty",
                    "No lobbies selected yet. Users will need a lobby to create squads."
                  )}
                </div>
              )}
              {rolesLoaded && roles.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  {t(
                    "settings.voice.lobbies.noRoles",
                    "No roles were found. The bot token needs permission to read roles."
                  )}
                </div>
              ) : null}
              <div className="text-xs text-muted-foreground">
                {t(
                  "settings.voice.lobbies.help",
                  "Join-to-Create lobbies create a temporary channel per user."
                )}
              </div>
            </div>

            <div className={`space-y-4 ${dashboardPanel}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  {t("settings.voice.logs.title", "Voice Log channels")}
                </div>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {t("settings.voice.logs.manualCount", "Manual {count}", {
                    count: enabledVoiceChannelIds.length,
                  })}
                </Badge>
              </div>
              <div className={`${dashboardInset} text-xs text-muted-foreground`}>
                {t(
                  "settings.voice.logs.description",
                  "Temp voice channels are logged automatically. Add manual channels here for log-only tracking (no voice settings panel)."
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <Popover
                open={voiceLogPickerOpen}
                onOpenChange={(open) => {
                  setVoiceLogPickerOpen(open);
                  if (open) onOpenVoiceChannels();
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={voiceLogPickerOpen}
                    className="w-full justify-between"
                  >
                    {voiceLogChannelLabel}
                    {loadingChannels ? <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" /> : null}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput
                      placeholder={t(
                        "settings.voice.searchChannelsPlaceholder",
                        "Search voice channels..."
                      )}
                    />
                    <CommandEmpty>
                      {t("settings.voice.noChannelsAvailable", "No channels available.")}
                    </CommandEmpty>
                    <CommandList>
                      <CommandGroup>
                        {availableVoiceLogChannels.map((channel) => (
                          <CommandItem
                            key={channel.id}
                            value={`${channel.name} ${channel.id}`}
                            onSelect={() => {
                              setSelectedVoiceLogId(channel.id);
                              setVoiceLogPickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedVoiceLogId === channel.id
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
              <Button
                type="button"
                onClick={() => {
                  onAddEnabledVoiceChannel(selectedVoiceLogId);
                  setSelectedVoiceLogId("");
                }}
                disabled={!selectedVoiceLogId}
                className="sm:shrink-0"
              >
                <Plus className="h-4 w-4" />
                {t("common.add", "Add")}
              </Button>
              </div>
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.voice.logs.channelColumn", "Voice channel")}</TableHead>
                  <TableHead>{t("common.type", "Type")}</TableHead>
                  <TableHead className="text-right">{t("common.action", "Action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <div className="text-sm font-medium">
                      {t("settings.voice.logs.tempChannels", "Temp voice channels")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t(
                        "settings.voice.logs.tempChannelsHelp",
                        "Automatically logged when created"
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="rounded-full px-3 py-1">
                      {t("common.auto", "Auto")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {t("common.locked", "Locked")}
                  </TableCell>
                </TableRow>
                {enabledVoiceChannelIds.map((channelId) => {
                  const channel = voiceChannels.find((item) => item.id === channelId);
                  return (
                    <TableRow key={channelId}>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {channel?.name ?? channelId}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {channelId}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-full px-3 py-1">
                          {t("common.manual", "Manual")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onRemoveEnabledVoiceChannel(channelId)}
                          aria-label={t(
                            "settings.voice.removeChannelAria",
                            "Remove {channel}",
                            { channel: channel?.name ?? channelId }
                          )}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              </Table>
              {!enabledVoiceChannelIds.length ? (
                <div className="text-xs text-muted-foreground">
                  {t(
                    "settings.voice.logs.empty",
                    "No manual voice log channels selected."
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
        {!loadingConfig && channelsLoaded && voiceChannels.length === 0 ? (
          <div className={dashboardEmpty}>
            {t(
              "settings.voice.noGuildChannels",
              "No voice channels were found for this guild."
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {t(
              "settings.voice.saveHelp",
              "Add channels and roles with the dropdowns, then save."
            )}
          </div>
          {hasMissingLobbyRole ? (
            <div className="text-xs text-destructive">
              {t(
                "settings.voice.lobbies.roleRequired",
                "Each Join-to-Create lobby requires a role."
              )}
            </div>
          ) : null}
          <Button
            onClick={onSave}
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
                {t("common.saving", "Saving")}
              </span>
            ) : (
              t("common.saveConfiguration", "Save configuration")
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const VoiceSettingsSection = memo(VoiceSettingsSectionComponent);
