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
import { useDashboardI18n } from "@/components/dashboard/dashboard-i18n";
import { cn } from "@/lib/utils";
import type { Channel, SpamCatcherConfig } from "./types";

const DISCORD_TIMEOUT_MAX_MINUTES = 28 * 24 * 60;
const TIMEOUT_OPTIONS = [
  { value: 1, key: "settings.spamCatcher.duration.oneMinute", fallback: "1 minute" },
  { value: 5, key: "settings.spamCatcher.duration.fiveMinutes", fallback: "5 minutes" },
  { value: 10, key: "settings.spamCatcher.duration.tenMinutes", fallback: "10 minutes" },
  { value: 30, key: "settings.spamCatcher.duration.thirtyMinutes", fallback: "30 minutes" },
  { value: 60, key: "settings.spamCatcher.duration.oneHour", fallback: "1 hour" },
  { value: 360, key: "settings.spamCatcher.duration.sixHours", fallback: "6 hours" },
  { value: 1440, key: "settings.spamCatcher.duration.oneDay", fallback: "1 day" },
  { value: 10080, key: "settings.spamCatcher.duration.sevenDays", fallback: "7 days" },
  { value: DISCORD_TIMEOUT_MAX_MINUTES, key: "settings.spamCatcher.duration.twentyEightDays", fallback: "28 days" },
];
const BAN_DELAY_MINUTE_OPTIONS = [1, 5, 10, 15, 30, 45, 60];
const BAN_DELAY_HOUR_OPTIONS = Array.from({ length: 23 }, (_, index) => index + 2);
const panelClass = "rounded-xl border border-border/70 bg-muted/10 p-4";

type SpamCatcherSectionProps = {
  loadingConfig: boolean;
  loadingChannels: boolean;
  channelsLoaded: boolean;
  saving: boolean;
  textChannels: Channel[];
  value: SpamCatcherConfig;
  webhookDestinationChecks: Record<string, {
    status: "idle" | "invalid" | "checking" | "valid" | "error";
    message?: string;
    channelId?: string;
    channelName?: string | null;
  }>;
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
  webhookDestinationChecks,
  onChange,
  onOpenTextChannels,
  onSave,
}: SpamCatcherSectionProps) {
  const { t } = useDashboardI18n();
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const channelById = useMemo(
    () => new Map(textChannels.map((channel) => [channel.id, channel])),
    [textChannels]
  );
  const selectedChannels = value.channelIds
    .map((id) => channelById.get(id) || {
      id,
      name: t("settings.spamCatcher.channelId", "ID: {id}", { id }),
      type: "text" as const,
    })
    .filter(Boolean);
  const reviewChannel = value.reviewChannelId ? channelById.get(value.reviewChannelId) : null;
  const formDisabled = loadingConfig || !value.enabled;
  const canSave = !saving && !loadingConfig;
  const banDelayUnit = value.banDelayMinutes > 60 ? "hours" : "minutes";
  const banDelayHours = Math.max(2, Math.min(24, Math.round(value.banDelayMinutes / 60)));
  const configuredWebhookChannelIds = new Set(value.webhookUrls.map((item) => item.channelId));
  const availableWebhookChannels = selectedChannels.filter((channel) => !configuredWebhookChannelIds.has(channel.id));

  function addWebhookRow() {
    const channelId = availableWebhookChannels[0]?.id;
    if (!channelId) return;
    onChange({
      ...value,
      webhookUrls: [...value.webhookUrls, { channelId, webhookUrl: "" }],
    });
  }

  function updateWebhookRow(index: number, next: { channelId?: string; webhookUrl?: string }) {
    onChange({
      ...value,
      webhookUrls: value.webhookUrls.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...next } : item
      ),
    });
  }

  function removeWebhookRow(index: number) {
    onChange({
      ...value,
      webhookUrls: value.webhookUrls.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function toggleChannel(channelId: string) {
    const nextIds = value.channelIds.includes(channelId)
      ? value.channelIds.filter((id) => id !== channelId)
      : [...value.channelIds, channelId];
    onChange({
      ...value,
      channelIds: nextIds,
      webhookUrls: value.webhookUrls.filter((item) => nextIds.includes(item.channelId)),
    });
  }

  return (
    <Card className={`${dashboardCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-300`}>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldAlert className="h-4 w-4" />
              {t("settings.spamCatcher.title", "Spam Catcher")}
            </CardTitle>
            <CardDescription>
              {t(
                "settings.spamCatcher.description",
                "Automatically timeout or ban users who post in trap channels."
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={value.enabled ? "default" : "secondary"} className="rounded-full px-3 py-1">
              {value.enabled
                ? t("common.enabled", "Enabled")
                : t("common.disabled", "Disabled")}
            </Badge>
            <Switch
              checked={value.enabled}
              onCheckedChange={(enabled) => onChange({ ...value, enabled })}
              aria-label={t("settings.spamCatcher.enableAria", "Enable Spam Catcher")}
              disabled={loadingConfig}
            />
          </div>
        </div>
        <Separator />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className={`${panelClass} space-y-3`}>
            <div className="text-sm font-medium">
              {t("settings.spamCatcher.channels.title", "Trap channels")}
            </div>
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
                    {value.channelIds.length
                      ? value.channelIds.length === 1
                        ? t(
                            "settings.spamCatcher.channels.oneSelected",
                            "{count} channel selected",
                            { count: value.channelIds.length }
                          )
                        : t(
                            "settings.spamCatcher.channels.manySelected",
                            "{count} channels selected",
                            { count: value.channelIds.length }
                          )
                      : t(
                          "settings.spamCatcher.channels.placeholder",
                          "Select channels"
                        )}
                  </span>
                  {loadingChannels ? <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" /> : null}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput
                    placeholder={t(
                      "settings.spamCatcher.channels.searchPlaceholder",
                      "Search channels..."
                    )}
                  />
                  <CommandEmpty>
                    {t("settings.spamCatcher.channels.noneFound", "No channels found.")}
                  </CommandEmpty>
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
              <div className="text-xs text-muted-foreground">
                {t(
                  "settings.spamCatcher.channels.noGuildChannels",
                  "No text channels were found for this guild."
                )}
              </div>
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
            <div className="text-sm font-medium">
              {t("settings.spamCatcher.timeout.title", "Timeout duration")}
            </div>
            <Select
              value={String(value.timeoutMinutes)}
              onValueChange={(timeoutMinutes) => onChange({
                ...value,
                timeoutMinutes: Math.max(1, Math.min(DISCORD_TIMEOUT_MAX_MINUTES, Number(timeoutMinutes))),
              })}
              disabled={formDisabled || (value.autoBanEnabled && value.banMode === "immediate")}
            >
              <SelectTrigger className="h-11">
                <SelectValue
                  placeholder={t(
                    "settings.spamCatcher.timeout.placeholder",
                    "Select timeout"
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {TIMEOUT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {t(option.key, option.fallback)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              {t(
                "settings.spamCatcher.timeout.help",
                "Discord max is 28 days. Immediate bans skip this; timeout-end bans use this as the ban timer."
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className={`${panelClass} space-y-4`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium">
                  {t("settings.spamCatcher.ban.title", "Automatic banning")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t(
                    "settings.spamCatcher.ban.description",
                    "Optional. Ban caught users immediately, when timeout ends, or after an appeal window during timeout."
                  )}
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
              onValueChange={(banMode) => onChange({
                ...value,
                banMode:
                  banMode === "immediate" || banMode === "after_timeout"
                    ? banMode
                    : "delayed",
              })}
              disabled={formDisabled || !value.autoBanEnabled}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={t(
                    "settings.spamCatcher.ban.placeholder",
                    "Choose ban behavior"
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">
                  {t("settings.spamCatcher.ban.immediate", "Ban immediately")}
                </SelectItem>
                <SelectItem value="after_timeout">
                  {t("settings.spamCatcher.ban.afterTimeout", "Ban after timeout ends")}
                </SelectItem>
                <SelectItem value="delayed">
                  {t("settings.spamCatcher.ban.delayed", "Ban after appeal window")}
                </SelectItem>
              </SelectContent>
            </Select>

            {value.autoBanEnabled && value.banMode === "delayed" ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {t("settings.spamCatcher.ban.appealWindow", "Appeal window")}
                </div>
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
                      <SelectValue
                        placeholder={t(
                          "settings.spamCatcher.ban.unitPlaceholder",
                          "Select unit"
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">
                        {t("common.minutes", "Minutes")}
                      </SelectItem>
                      <SelectItem value="hours">{t("common.hours", "Hours")}</SelectItem>
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
                      <SelectValue
                        placeholder={t(
                          "settings.spamCatcher.ban.windowPlaceholder",
                          "Select window"
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(banDelayUnit === "hours" ? BAN_DELAY_HOUR_OPTIONS : BAN_DELAY_MINUTE_OPTIONS).map((option) => (
                        <SelectItem key={option} value={String(option)}>
                          {banDelayUnit === "hours"
                            ? t("settings.spamCatcher.duration.hours", "{count} hours", {
                                count: option,
                              })
                            : option === 1
                              ? t("settings.spamCatcher.duration.oneMinute", "1 minute")
                              : t(
                                  "settings.spamCatcher.duration.minutes",
                                  "{count} minutes",
                                  { count: option }
                                )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-xs text-muted-foreground">
                  {t(
                    "settings.spamCatcher.ban.appealHelp",
                    "Allowed range is 1-60 minutes or 2-24 hours. Appeal instructions are sent to the user during the timeout period; if no admin removes the timeout before this window ends, the user is banned."
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className={`${panelClass} space-y-3`}>
            <div>
              <div className="text-sm font-medium">
                {t("settings.spamCatcher.review.title", "Admin review channel")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(
                  "settings.spamCatcher.review.description",
                  "Required. Sends caught-user review cards here with ban and timeout controls."
                )}
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
                  disabled={formDisabled}
                >
                  <span className="truncate text-left">
                    {reviewChannel
                      ? `#${reviewChannel.name}`
                      : value.reviewChannelId
                        ? t("settings.spamCatcher.channelId", "ID: {id}", {
                            id: value.reviewChannelId,
                          })
                        : t(
                            "settings.spamCatcher.review.placeholder",
                            "Select review channel"
                          )}
                  </span>
                  {loadingChannels ? <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" /> : null}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput
                    placeholder={t(
                      "settings.spamCatcher.channels.searchPlaceholder",
                      "Search channels..."
                    )}
                  />
                  <CommandEmpty>
                    {t("settings.spamCatcher.channels.noneFound", "No channels found.")}
                  </CommandEmpty>
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
              <div className="text-sm font-medium">
                {t("settings.spamCatcher.integrity.title", "Integrity Checked")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(
                  "settings.spamCatcher.integrity.description",
                  "It's a fun button to add integrity who reads this message."
                )}
              </div>
            </div>
            <Switch
              checked={value.integrityCheckEnabled}
              onCheckedChange={(integrityCheckEnabled) => onChange({ ...value, integrityCheckEnabled })}
              disabled={formDisabled}
            />
          </div>
          <Separator />

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">
                {t("settings.spamCatcher.webhook.title", "Send notice with webhook")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(
                  "settings.spamCatcher.webhook.description",
                  "Optional. Posts one warning through the webhook's channel instead of the bot account."
                )}
              </div>
            </div>
            <Switch
              checked={value.webhookEnabled}
              onCheckedChange={(webhookEnabled) => onChange({ ...value, webhookEnabled })}
              disabled={formDisabled || value.integrityCheckEnabled}
            />
          </div>
          {value.integrityCheckEnabled ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              {t(
                "settings.spamCatcher.integrity.webhookWarning",
                "Integrity Checked uses bot-delivered notices so button clicks can be counted. Webhook delivery is temporarily disabled, and your webhook settings are kept but read-only until Integrity Checked is turned off."
              )}
            </div>
          ) : null}
          {value.webhookEnabled ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  {t("settings.spamCatcher.webhook.channelsTitle", "Trap channel webhooks")}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addWebhookRow}
                  disabled={formDisabled || value.integrityCheckEnabled || availableWebhookChannels.length === 0}
                >
                  {t("settings.spamCatcher.webhook.add", "Add webhook")}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {t(
                  "settings.spamCatcher.webhook.channelHelp",
                  "Each webhook must be created in the same trap channel selected for that row."
                )}
              </div>

              {value.webhookUrls.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
                  {t(
                    "settings.spamCatcher.webhook.empty",
                    "Add one webhook for each selected trap channel."
                  )}
                </div>
              ) : null}

              {value.webhookUrls.map((item, index) => {
                const check = webhookDestinationChecks[item.channelId];
                const checkMessage = !check
                  ? undefined
                  : check.status === "invalid"
                    ? t(
                        "settings.spamCatcher.webhook.invalidUrl",
                        "Enter a valid Discord webhook URL before checking."
                      )
                    : check.status === "checking"
                      ? t(
                          "settings.spamCatcher.webhook.checking",
                          "Checking webhook destination..."
                        )
                      : check.status === "valid"
                        ? check.channelName
                          ? t(
                              "settings.spamCatcher.webhook.matchesChannelName",
                              "Webhook matches #{channel}.",
                              { channel: check.channelName }
                            )
                          : t(
                              "settings.spamCatcher.webhook.matchesChannelId",
                              "Webhook matches channel ID {channelId}.",
                              { channelId: check.channelId ?? item.channelId }
                            )
                        : check.message === "Failed to check webhook destination."
                          ? t(
                              "settings.spamCatcher.webhook.checkFailed",
                              "Failed to check webhook destination."
                            )
                          : check.message;
                return (
                  <div key={`${item.channelId}-${index}`} className="space-y-2 rounded-lg border border-border/70 p-3">
                    <div className="grid gap-2 lg:grid-cols-[220px_1fr_auto]">
                      <Select
                        value={item.channelId}
                        onValueChange={(channelId) => updateWebhookRow(index, { channelId })}
                        disabled={formDisabled || value.integrityCheckEnabled}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t(
                              "settings.spamCatcher.webhook.channelPlaceholder",
                              "Trap channel"
                            )}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedChannels.map((channel) => (
                            <SelectItem
                              key={channel.id}
                              value={channel.id}
                              disabled={value.webhookUrls.some((row, rowIndex) => rowIndex !== index && row.channelId === channel.id)}
                            >
                              #{channel.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="url"
                        value={item.webhookUrl}
                        onChange={(event) => updateWebhookRow(index, { webhookUrl: event.target.value })}
                        placeholder="https://discord.com/api/webhooks/..."
                        disabled={formDisabled || value.integrityCheckEnabled}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeWebhookRow(index)}
                        disabled={formDisabled || value.integrityCheckEnabled}
                        aria-label={t(
                          "settings.spamCatcher.webhook.removeAria",
                          "Remove webhook"
                        )}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {checkMessage ? (
                      <div
                        className={cn(
                          "text-xs",
                          check.status === "valid"
                            ? "text-emerald-400"
                            : check.status === "checking"
                              ? "text-muted-foreground"
                              : "text-destructive"
                        )}
                      >
                        {check.status === "checking" ? (
                          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                        ) : null}
                        {checkMessage}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
          <div className="text-xs text-muted-foreground">
            {t(
              "settings.spamCatcher.footerHelp",
              "Admins are exempt. Messages are left in place for review."
            )}
          </div>
          <Button onClick={onSave} disabled={!canSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("common.saveConfiguration", "Save configuration")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const SpamCatcherSection = memo(SpamCatcherSectionComponent);
