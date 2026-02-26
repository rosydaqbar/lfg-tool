import { memo, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Radio, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  logChannelId: string;
  saving: boolean;
  voiceChannels: Channel[];
  roles: Role[];
  joinToCreateLobbies: JoinToCreateLobby[];
  onAddLobbyChannel: (channelId: string, roleId: string) => void;
  onToggleLobbyLfg: (channelId: string, lfgEnabled: boolean) => void;
  onRemoveLobbyChannel: (channelId: string) => void;
  onSave: () => void;
};

function VoiceSettingsSectionComponent({
  loadingConfig,
  logChannelId,
  saving,
  voiceChannels,
  roles,
  joinToCreateLobbies,
  onAddLobbyChannel,
  onToggleLobbyLfg,
  onRemoveLobbyChannel,
  onSave,
}: VoiceSettingsSectionProps) {
  const [lobbyPickerOpen, setLobbyPickerOpen] = useState(false);
  const [lobbyRolePickerOpen, setLobbyRolePickerOpen] = useState(false);
  const [selectedLobbyVoiceId, setSelectedLobbyVoiceId] = useState("");
  const [selectedLobbyRoleId, setSelectedLobbyRoleId] = useState("");

  const selectedLobbyVoiceChannel = useMemo(
    () => voiceChannels.find((channel) => channel.id === selectedLobbyVoiceId),
    [voiceChannels, selectedLobbyVoiceId]
  );
  const lobbyVoiceLabel = selectedLobbyVoiceChannel
    ? selectedLobbyVoiceChannel.name
    : selectedLobbyVoiceId
      ? `ID: ${selectedLobbyVoiceId}`
      : "Select a lobby channel";

  const selectedLobbyRole = useMemo(
    () => roles.find((role) => role.id === selectedLobbyRoleId),
    [roles, selectedLobbyRoleId]
  );
  const lobbyRoleLabel = selectedLobbyRole
    ? selectedLobbyRole.name
    : selectedLobbyRoleId
      ? `ID: ${selectedLobbyRoleId}`
      : "Select a role";

  const joinToCreateLobbyIds = useMemo(
    () => joinToCreateLobbies.map((item) => item.channelId),
    [joinToCreateLobbies]
  );
  const hasMissingLobbyRole = useMemo(
    () => joinToCreateLobbies.some((item) => !item.roleId),
    [joinToCreateLobbies]
  );

  const availableLobbyChannels = voiceChannels;

  return (
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
                  onAddLobbyChannel(selectedLobbyVoiceId, selectedLobbyRoleId);
                  setSelectedLobbyVoiceId("");
                  setSelectedLobbyRoleId("");
                }}
                disabled={!selectedLobbyVoiceId || !selectedLobbyRoleId}
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
                                onToggleLobbyLfg(lobby.channelId, checked)
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
                            onClick={() => onRemoveLobbyChannel(lobby.channelId)}
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
                No lobbies selected yet. Users will need a lobby to create squads.
              </div>
            )}
            {roles.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No roles were found. The bot token needs permission to read roles.
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
                Saving
              </span>
            ) : (
              "Save configuration"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const VoiceSettingsSection = memo(VoiceSettingsSectionComponent);
