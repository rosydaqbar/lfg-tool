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

  const availableRequiredRoles = useMemo(
    () => roles.filter((role) => !value.requiredRoleIds.includes(role.id)),
    [roles, value.requiredRoleIds]
  );

  const formDisabled = loadingConfig || !value.enabled;

  const hasInvalidRules = value.rules.some(
    (rule) => Number.isNaN(rule.hours) || rule.hours < 0 || !rule.roleId
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
          <div className="text-sm font-medium">Role required to apply</div>
          <Select
            value={value.requiredRoleMode}
            disabled={formDisabled}
            onValueChange={(nextValue: "all_roles" | "selected_roles") => {
              onChange({
                ...value,
                requiredRoleMode: nextValue,
                requiredRoleIds:
                  nextValue === "all_roles" ? [] : value.requiredRoleIds,
              });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select requirement mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_roles">All Roles</SelectItem>
              <SelectItem value="selected_roles">Selected Roles</SelectItem>
            </SelectContent>
          </Select>

          {value.requiredRoleMode === "selected_roles" ? (
            <div className="space-y-3">
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
                    disabled={formDisabled || availableRequiredRoles.length === 0}
                  >
                    Add required role
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput placeholder="Search roles..." />
                    <CommandEmpty>No available roles.</CommandEmpty>
                    <CommandList>
                      <CommandGroup>
                        {availableRequiredRoles.map((role) => (
                          <CommandItem
                            key={role.id}
                            value={`${role.name} ${role.id}`}
                            onSelect={() => {
                              onChange({
                                ...value,
                                requiredRoleIds: [...value.requiredRoleIds, role.id],
                              });
                              setRequiredRolePickerOpen(false);
                            }}
                          >
                            <Check className="mr-2 h-4 w-4 opacity-0" />
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

              <div className="flex flex-wrap gap-2">
                {value.requiredRoleIds.length ? (
                  value.requiredRoleIds.map((roleId) => {
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
                          onClick={() =>
                            onChange({
                              ...value,
                              requiredRoleIds: value.requiredRoleIds.filter(
                                (id) => id !== roleId
                              ),
                            })
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })
                ) : (
                  <div className="text-xs text-muted-foreground">
                    No required role selected. Pick at least one role.
                  </div>
                )}
              </div>
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
                    },
                  ],
                })
              }
            >
              <Plus className="h-4 w-4" />
              Add rule
            </Button>
          </div>

          {value.rules.length ? (
            <div className="space-y-3">
              {value.rules.map((rule) => (
                <div
                  key={rule.id}
                  className="grid gap-2 rounded-lg border border-border/70 bg-background/60 p-3 md:grid-cols-[170px_140px_1fr_auto]"
                >
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
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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

                  <Select
                    value={rule.roleId}
                    disabled={formDisabled}
                    onValueChange={(roleId) =>
                      onChange({
                        ...value,
                        rules: value.rules.map((item) =>
                          item.id === rule.id ? { ...item, roleId } : item
                        ),
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select role to give" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name} ({role.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
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
            <Select
              value={value.approvalChannelId ?? ""}
              disabled={formDisabled}
              onValueChange={(channelId) =>
                onChange({
                  ...value,
                  approvalChannelId: channelId || null,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select approval channel" />
              </SelectTrigger>
              <SelectContent>
                {textChannels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    #{channel.name} ({channel.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              ? "Each rule needs a valid role and non-negative hours."
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
