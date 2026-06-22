import { memo, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, ShieldAlert, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { dashboardCard } from "@/components/ui/patterns";
import { cn } from "@/lib/utils";
import type { Channel, SpamCatcherConfig } from "./types";

const DISCORD_TIMEOUT_MAX_MINUTES = 28 * 24 * 60;
const TIMEOUT_OPTIONS = [
  { value: 1, label: "1 minute" },
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 360, label: "6 hours" },
  { value: 1440, label: "1 day" },
  { value: 10080, label: "7 days" },
  { value: DISCORD_TIMEOUT_MAX_MINUTES, label: "28 days" },
];
const BAN_DELAY_MINUTE_OPTIONS = [1, 5, 10, 15, 30, 45, 60].map((value) => ({
  value,
  label: `${value} minute${value === 1 ? "" : "s"}`,
}));
const BAN_DELAY_HOUR_OPTIONS = Array.from({ length: 23 }, (_, index) => index + 2).map((value) => ({
  value,
  label: `${value} hours`,
}));
const panelClass = "rounded-xl border border-border/70 bg-muted/10 p-4";

type SpamCatcherSectionProps = {
  loadingConfig: boolean;
  loadingChannels: boolean;
  channelsLoaded: boolean;
  saving: boolean;
  textChannels: Channel[];
  value: SpamCatcherConfig;
  onChange: (next: SpamCatcherConfig) => void;
  onOpenTextChannels: () => void;
  onSave: () => void;
};

function SpamCatcherSectionComponent({
  loadingConfig,
  loadingChannels,
  channelsLoaded,
  saving,
  textChannels,
  value,
  onChange,
  onOpenTextChannels,
  onSave,
}: SpamCatcherSectionProps) {
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const channelById = useMemo(
    () => new Map(textChannels.map((channel) => [channel.id, channel])),
    [textChannels]
  );
  const selectedChannels = value.channelIds
    .map((id) => channelById.get(id) || { id, name: `ID: ${id}`, type: "text" as const })
    .filter(Boolean);
  const reviewChannel = value.reviewChannelId ? channelById.get(value.reviewChannelId) : null;
  const formDisabled = loadingConfig || !value.enabled;
  const canSave = !saving && !loadingConfig;
  const banDelayUnit = value.banDelayMinutes > 60 ? "hours" : "minutes";
  const banDelayHours = Math.max(2, Math.min(24, Math.round(value.banDelayMinutes / 60)));

  function toggleChannel(channelId: string) {
    const nextIds = value.channelIds.includes(channelId)
      ? value.channelIds.filter((id) => id !== channelId)
      : [...value.channelIds, channelId];
    onChange({ ...value, channelIds: nextIds });
  }

  return (
    <Card className={`${dashboardCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-300`}>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldAlert className="h-4 w-4" />
              Spam Catcher
            </CardTitle>
            <CardDescription>
              Automatically timeout or ban users who post in trap channels.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={value.enabled ? "default" : "secondary"} className="rounded-full px-3 py-1">
              {value.enabled ? "Enabled" : "Disabled"}
            </Badge>
            <Switch
              checked={value.enabled}
              onCheckedChange={(enabled) => onChange({ ...value, enabled })}
              aria-label="Enable Spam Catcher"
              disabled={loadingConfig}
            />
          </div>
        </div>
        <Separator />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className={`${panelClass} space-y-3`}>
            <div className="text-sm font-medium">Trap channels</div>
            <Popover
              open={channelsOpen}
              onOpenChange={(open) => {
                setChannelsOpen(open);
                if (open) onOpenTextChannels();
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={channelsOpen}
                  className="h-11 w-full justify-between"
                  disabled={formDisabled}
                >
                  <span className="truncate text-left">
                    {value.channelIds.length ? `${value.channelIds.length} channel${value.channelIds.length === 1 ? "" : "s"} selected` : "Select channels"}
                  </span>
                  {loadingChannels ? <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" /> : null}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput placeholder="Search channels..." />
                  <CommandEmpty>No channels found.</CommandEmpty>
                  <CommandList className="max-h-64 overflow-auto">
                    <CommandGroup>
                      {textChannels.map((channel) => {
                        const selected = value.channelIds.includes(channel.id);
                        return (
                          <CommandItem
                            key={channel.id}
                            value={`${channel.name} ${channel.id}`}
                            onSelect={() => toggleChannel(channel.id)}
                          >
                            <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">#{channel.name}</span>
                            <span className="ml-auto font-mono text-xs text-muted-foreground">{channel.id}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {!loadingConfig && channelsLoaded && textChannels.length === 0 ? (
              <div className="text-xs text-muted-foreground">No text channels were found for this guild.</div>
            ) : null}
            {selectedChannels.length ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedChannels.map((channel) => (
                  <Badge key={channel.id} variant="secondary" className="gap-1 rounded-full px-2.5 py-1 text-xs">
                    #{channel.name}
                    <button
                      type="button"
                      onClick={() => toggleChannel(channel.id)}
                      className="rounded-full text-muted-foreground hover:text-foreground"
                      disabled={formDisabled}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <div className={`${panelClass} space-y-3`}>
            <div className="text-sm font-medium">Timeout duration</div>
            <Select
              value={String(value.timeoutMinutes)}
              onValueChange={(timeoutMinutes) => onChange({
                ...value,
                timeoutMinutes: Math.max(1, Math.min(DISCORD_TIMEOUT_MAX_MINUTES, Number(timeoutMinutes))),
              })}
              disabled={formDisabled || (value.autoBanEnabled && value.banMode === "immediate")}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Select timeout" />
              </SelectTrigger>
              <SelectContent>
                {TIMEOUT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              Discord max is 28 days. Immediate bans skip this.
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className={`${panelClass} space-y-4`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Automatic banning</div>
                <div className="text-xs text-muted-foreground">
                  Optional. Ban caught users immediately or after an appeal window.
                </div>
              </div>
              <Switch
                checked={value.autoBanEnabled}
                onCheckedChange={(autoBanEnabled) => onChange({ ...value, autoBanEnabled })}
                disabled={formDisabled}
              />
            </div>

            <Select
              value={value.banMode}
              onValueChange={(banMode) => onChange({ ...value, banMode: banMode === "immediate" ? "immediate" : "delayed" })}
              disabled={formDisabled || !value.autoBanEnabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose ban behavior" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">Ban immediately</SelectItem>
                <SelectItem value="delayed">Ban after delay</SelectItem>
              </SelectContent>
            </Select>

            {value.autoBanEnabled && value.banMode === "delayed" ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Ban delay</div>
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={banDelayUnit}
                    onValueChange={(unit) => onChange({
                      ...value,
                      banDelayMinutes: unit === "hours" ? banDelayHours * 60 : Math.min(value.banDelayMinutes, 60),
                    })}
                    disabled={formDisabled}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={String(banDelayUnit === "hours" ? banDelayHours : value.banDelayMinutes)}
                    onValueChange={(delay) => onChange({
                      ...value,
                      banDelayMinutes: banDelayUnit === "hours" ? Number(delay) * 60 : Number(delay),
                    })}
                    disabled={formDisabled}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Select delay" />
                    </SelectTrigger>
                    <SelectContent>
                      {(banDelayUnit === "hours" ? BAN_DELAY_HOUR_OPTIONS : BAN_DELAY_MINUTE_OPTIONS).map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-xs text-muted-foreground">Allowed range is 1-60 minutes or 2-24 hours.</div>
              </div>
            ) : null}
          </div>

          <div className={`${panelClass} space-y-3`}>
            <div>
              <div className="text-sm font-medium">Admin review channel</div>
              <div className="text-xs text-muted-foreground">
                Required for timeout appeals. Administrators can remove timeouts here.
              </div>
            </div>
            <Popover
              open={reviewOpen}
              onOpenChange={(open) => {
                setReviewOpen(open);
                if (open) onOpenTextChannels();
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={reviewOpen}
                  className="h-11 w-full justify-between"
                  disabled={formDisabled || (value.autoBanEnabled && value.banMode === "immediate")}
                >
                  <span className="truncate text-left">
                    {reviewChannel ? `#${reviewChannel.name}` : value.reviewChannelId ? `ID: ${value.reviewChannelId}` : "Select review channel"}
                  </span>
                  {loadingChannels ? <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" /> : null}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput placeholder="Search channels..." />
                  <CommandEmpty>No channels found.</CommandEmpty>
                  <CommandList className="max-h-64 overflow-auto">
                    <CommandGroup>
                      {textChannels.map((channel) => (
                        <CommandItem
                          key={channel.id}
                          value={`${channel.name} ${channel.id}`}
                          onSelect={() => {
                            onChange({ ...value, reviewChannelId: channel.id });
                            setReviewOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", value.reviewChannelId === channel.id ? "opacity-100" : "opacity-0")} />
                          <span className="truncate">#{channel.name}</span>
                          <span className="ml-auto font-mono text-xs text-muted-foreground">{channel.id}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className={`${panelClass} space-y-3`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Send notice with webhook</div>
              <div className="text-xs text-muted-foreground">
                Optional. Posts one warning through the webhook&apos;s channel instead of the bot account.
              </div>
            </div>
            <Switch
              checked={value.webhookEnabled}
              onCheckedChange={(webhookEnabled) => onChange({ ...value, webhookEnabled })}
              disabled={formDisabled}
            />
          </div>
          {value.webhookEnabled ? (
            <label className="space-y-2 text-sm font-medium">
              Discord webhook URL
              <Input
                type="url"
                value={value.webhookUrl ?? ""}
                onChange={(event) => onChange({ ...value, webhookUrl: event.target.value })}
                placeholder="https://discord.com/api/webhooks/..."
                disabled={formDisabled}
              />
            </label>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
          <div className="text-xs text-muted-foreground">
            Admins are exempt. Messages are left in place for review.
          </div>
          <Button onClick={onSave} disabled={!canSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const SpamCatcherSection = memo(SpamCatcherSectionComponent);
