import { memo, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, ShieldCheck, X } from "lucide-react";
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
  CommandSeparator,
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
import { cn } from "@/lib/utils";
import type { AutoRoleCondition, AutoRoleConfig, Channel, Role } from "./types";

type AutoRoleSectionProps = {
  loadingConfig: boolean;
  saving: boolean;
  roles: Role[];
  textChannels: Channel[];
  value: AutoRoleConfig;
  onChange: (next: AutoRoleConfig) => void;
  onSave: () => void;
};

const CONDITION_OPTIONS: { value: AutoRoleCondition; label: string }[] = [
  { value: "more_than", label: "More than" },
  { value: "less_than", label: "Less than" },
  { value: "equal_to", label: "Equal to" },
];

function createRuleId() {
  return `rule_${Math.random().toString(36).slice(2, 10)}`;
}

type SearchableOption = {
  value: string;
  label: string;
  sublabel?: string;
  search?: string;
};

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder: string;
  disabled?: boolean;
  emptyText?: string;
};

function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  emptyText = "No options found.",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.value === value) || null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-14 w-full justify-between"
          disabled={disabled}
        >
          {selected ? (
            <span className="min-w-0 text-left">
              <span className="block truncate">{selected.label}</span>
              {selected.sublabel ? (
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {selected.sublabel}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="truncate text-left text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandEmpty>{emptyText}</CommandEmpty>
          <CommandList className="max-h-64 overflow-auto">
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.search || option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.sublabel ? (
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">
                        {option.sublabel}
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AutoRoleSectionComponent({
  loadingConfig,
  saving,
  roles,
  textChannels,
  value,
  onChange,
  onSave,
}: AutoRoleSectionProps) {
  const [requiredRolePickerOpen, setRequiredRolePickerOpen] = useState(false);

  const roleById = useMemo(
    () => new Map(roles.map((role) => [role.id, role])),
    [roles]
  );

  const formDisabled = loadingConfig || !value.enabled;
  const selectedRequiredRoleIds = value.requiredRoleMode === "selected_roles"
    ? value.requiredRoleIds
    : [];
  const requiredRoleButtonLabel = selectedRequiredRoleIds.length
    ? `${selectedRequiredRoleIds.length} role${selectedRequiredRoleIds.length === 1 ? "" : "s"} selected`
    : "All roles";
  const roleOptions = useMemo(
    () =>
      roles.map((role) => ({
        value: role.id,
        label: role.name,
        sublabel: role.id,
        search: `${role.name} ${role.id}`,
      })),
    [roles]
  );
  const requiredRoleRuleOptions = useMemo(
    () => [
      { value: "__any_role__", label: "Any role", search: "any role" },
      ...roles.map((role) => ({
        value: role.id,
        label: role.name,
        sublabel: role.id,
        search: `${role.name} ${role.id}`,
      })),
    ],
    [roles]
  );
  const approvalChannelOptions = useMemo(
    () =>
      textChannels.map((channel) => ({
        value: channel.id,
        label: `#${channel.name} (${channel.id})`,
        search: `${channel.name} ${channel.id}`,
      })),
    [textChannels]
  );

  const hasInvalidRules = value.rules.some(
    (rule) =>
      Number.isNaN(rule.hours) ||
      rule.hours < 0 ||
      !rule.roleId ||
      (rule.requiredRoleMode === "specific_role" && !rule.requiredRoleId)
  );
  const needsApprovalChannel = value.requireAdminApproval && !value.approvalChannelId;

  return (
    <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-300">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-4 w-4" />
              Auto role by voice time
            </CardTitle>
            <CardDescription>
              Assign server roles based on total voice time in JTC and Voice Log channels.
            </CardDescription>
          </div>
          <Badge variant={value.enabled ? "default" : "secondary"} className="rounded-full px-3 py-1">
            {value.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
        <Separator />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 p-4">
          <div>
            <div className="text-sm font-medium">Enable auto role</div>
            <div className="text-xs text-muted-foreground">
              When enabled, the bot evaluates time-based role rules automatically.
            </div>
          </div>
          <Switch
            checked={value.enabled}
            onCheckedChange={(enabled) => onChange({ ...value, enabled })}
            aria-label="Enable auto role"
            disabled={loadingConfig}
          />
        </div>

        <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
          <div>
            <div className="text-sm font-medium">Global role required to apply</div>
            <div className="text-xs text-muted-foreground">
              Choose who can be evaluated by auto-role rules. Pick All roles, or select one or more required guild roles.
            </div>
          </div>

          <Popover
            open={requiredRolePickerOpen}
            onOpenChange={setRequiredRolePickerOpen}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={requiredRolePickerOpen}
                className="w-full justify-between"
                disabled={formDisabled}
              >
                <span className="truncate text-left">{requiredRoleButtonLabel}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
              <Command>
                <CommandInput placeholder="Search roles..." />
                <CommandEmpty>No roles found.</CommandEmpty>
                <CommandList className="max-h-72 overflow-auto">
                  <CommandGroup>
                    <CommandItem
                      value="all roles everyone no requirement"
                      onSelect={() => {
                        onChange({
                          ...value,
                          requiredRoleMode: "all_roles",
                          requiredRoleIds: [],
                        });
                        setRequiredRolePickerOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value.requiredRoleMode === "all_roles" ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block truncate">All roles</span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          Everyone can be evaluated by auto-role rules.
                        </span>
                      </span>
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                  <CommandGroup heading="Guild roles">
                    {roles.map((role) => {
                      const selected = selectedRequiredRoleIds.includes(role.id);
                      return (
                        <CommandItem
                          key={role.id}
                          value={`${role.name} ${role.id}`}
                          onSelect={() => {
                            const nextIds = selected
                              ? selectedRequiredRoleIds.filter((id) => id !== role.id)
                              : [...selectedRequiredRoleIds, role.id];
                            onChange({
                              ...value,
                              requiredRoleMode: nextIds.length ? "selected_roles" : "all_roles",
                              requiredRoleIds: nextIds,
                            });
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selected ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="min-w-0">
                            <span className="block truncate">{role.name}</span>
                            <span className="block truncate font-mono text-[10px] text-muted-foreground">
                              {role.id}
                            </span>
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedRequiredRoleIds.length ? (
            <div className="flex flex-wrap gap-2">
              {selectedRequiredRoleIds.map((roleId) => {
                const role = roleById.get(roleId);
                return (
                  <Badge
                    key={roleId}
                    variant="secondary"
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1"
                  >
                    <span>{role?.name ?? roleId}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {roleId}
                    </span>
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-muted"
                      disabled={formDisabled}
                      onClick={() => {
                        const nextIds = selectedRequiredRoleIds.filter(
                          (id) => id !== roleId
                        );
                        onChange({
                          ...value,
                          requiredRoleMode: nextIds.length ? "selected_roles" : "all_roles",
                          requiredRoleIds: nextIds,
                        });
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Time logic rules</div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={formDisabled}
              onClick={() =>
                onChange({
                  ...value,
                  rules: [
                    ...value.rules,
                    {
                      id: createRuleId(),
                      condition: "more_than",
                      hours: 1,
                      roleId: "",
                      requiredRoleMode: "any_role",
                      requiredRoleId: null,
                    },
                  ],
                })
              }
            >
              <Plus className="h-4 w-4" />
              Add rule
            </Button>
          </div>

          <div className="hidden md:grid md:grid-cols-[1fr_170px_120px_1fr_auto] gap-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
            <span>Required role</span>
            <span>Condition</span>
            <span>Hours</span>
            <span>Role given</span>
            <span />
          </div>

          {value.rules.length ? (
            <div className="space-y-3">
              {value.rules.map((rule) => (
                <div
                  key={rule.id}
                  className="grid gap-2 rounded-lg border border-border/70 bg-background/60 p-3 md:grid-cols-[1fr_170px_120px_1fr_auto]"
                >
                  <SearchableSelect
                    value={
                      rule.requiredRoleMode === "specific_role" && rule.requiredRoleId
                        ? rule.requiredRoleId
                        : "__any_role__"
                    }
                    disabled={formDisabled}
                    options={requiredRoleRuleOptions}
                    placeholder="Any role"
                    emptyText="No roles found."
                    onChange={(selectedValue) =>
                      onChange({
                        ...value,
                        rules: value.rules.map((item) =>
                          item.id === rule.id
                            ? {
                                ...item,
                                requiredRoleMode:
                                  selectedValue === "__any_role__"
                                    ? "any_role"
                                    : "specific_role",
                                requiredRoleId:
                                  selectedValue === "__any_role__"
                                    ? null
                                    : selectedValue,
                              }
                            : item
                        ),
                      })
                    }
                  />

                  <Select
                    value={rule.condition}
                    disabled={formDisabled}
                    onValueChange={(condition: AutoRoleCondition) =>
                      onChange({
                        ...value,
                        rules: value.rules.map((item) =>
                          item.id === rule.id ? { ...item, condition } : item
                        ),
                      })
                    }
                  >
                    <SelectTrigger className="h-14 w-full data-[size=default]:h-14">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 overflow-auto">
                      {CONDITION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    type="number"
                    min={0}
                    step={1}
                    className="h-14"
                    disabled={formDisabled}
                    value={Number.isFinite(rule.hours) ? String(rule.hours) : "0"}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      onChange({
                        ...value,
                        rules: value.rules.map((item) =>
                          item.id === rule.id
                            ? {
                                ...item,
                                hours: Number.isFinite(parsed)
                                  ? Math.max(0, Math.floor(parsed))
                                  : 0,
                              }
                            : item
                        ),
                      });
                    }}
                    placeholder="Hours"
                  />

                  <SearchableSelect
                    value={rule.roleId}
                    disabled={formDisabled}
                    options={roleOptions}
                    placeholder="Select role to give"
                    emptyText="No roles found."
                    onChange={(roleId) =>
                      onChange({
                        ...value,
                        rules: value.rules.map((item) =>
                          item.id === rule.id ? { ...item, roleId } : item
                        ),
                      })
                    }
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="h-14 w-10"
                    disabled={formDisabled}
                    onClick={() =>
                      onChange({
                        ...value,
                        rules: value.rules.filter((item) => item.id !== rule.id),
                      })
                    }
                    aria-label="Remove rule"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              No rules yet. Add at least one rule to assign roles by voice time.
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Require admin permission</div>
              <div className="text-xs text-muted-foreground">
                If enabled, matched users will wait for admin approval before receiving roles.
              </div>
            </div>
            <Switch
              checked={value.requireAdminApproval}
              onCheckedChange={(requireAdminApproval) =>
                onChange({
                  ...value,
                  requireAdminApproval,
                  approvalChannelId: requireAdminApproval
                    ? value.approvalChannelId
                    : null,
                })
              }
              aria-label="Require admin approval"
              disabled={formDisabled}
            />
          </div>

          {value.requireAdminApproval ? (
            <SearchableSelect
              value={value.approvalChannelId ?? ""}
              disabled={formDisabled}
              options={approvalChannelOptions}
              placeholder="Select approval channel"
              emptyText="No text channels found."
              onChange={(channelId) =>
                onChange({
                  ...value,
                  approvalChannelId: channelId || null,
                })
              }
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className={cn(
              "text-xs",
              value.enabled && (hasInvalidRules || needsApprovalChannel)
                ? "text-destructive"
                : "text-muted-foreground"
            )}
          >
            {!value.enabled
              ? "Auto role is disabled. Enable it to edit role logic and approval settings."
              : hasInvalidRules
              ? "Each rule needs valid hours, role to give, and required role (when enabled)."
              : needsApprovalChannel
                ? "Approval channel is required when admin approval is enabled."
                : "Changes are saved with the dashboard configuration."}
          </div>
          <Button
            onClick={onSave}
            disabled={
              loadingConfig ||
              saving ||
              (value.enabled &&
                (hasInvalidRules ||
                  needsApprovalChannel ||
                  (value.requiredRoleMode === "selected_roles" &&
                    value.requiredRoleIds.length === 0)))
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

export const AutoRoleSection = memo(AutoRoleSectionComponent);
