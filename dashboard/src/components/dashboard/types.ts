export type Channel = {
  id: string;
  name: string;
  type: "voice" | "stage" | "text" | "announcement";
};

export type Role = {
  id: string;
  name: string;
  color: number;
};

export type ManageableGuild = {
  id: string;
  name: string;
  icon: string | null;
  accessLabel: "Owner" | "Admin";
  botInstalled: boolean;
  configured: boolean;
  status: "ready" | "needs_setup" | "invite_bot";
  inviteUrl: string | null;
};

export type GuildsResponse = {
  guilds: ManageableGuild[];
  selectedGuild?: ManageableGuild | null;
  hasMore?: boolean;
  nextOffset?: number;
};

export type JoinToCreateLobby = {
  channelId: string;
  roleId: string | null;
  lfgEnabled: boolean;
  lfgReminderEnabled: boolean;
  lfgReminderSeconds: number;
};

export type AutoRoleCondition = "more_than" | "less_than" | "equal_to";

export type AutoRoleRule = {
  id: string;
  condition: AutoRoleCondition;
  hours: number;
  roleId: string;
  requiredRoleMode: "any_role" | "specific_role";
  requiredRoleId: string | null;
};

export type AutoRoleConfig = {
  enabled: boolean;
  requiredRoleMode: "all_roles" | "selected_roles";
  requiredRoleIds: string[];
  rules: AutoRoleRule[];
  requireAdminApproval: boolean;
  approvalChannelId: string | null;
};

export type SpamCatcherConfig = {
  enabled: boolean;
  channelIds: string[];
  timeoutMinutes: number;
  autoBanEnabled: boolean;
  banMode: "immediate" | "after_timeout" | "delayed";
  banDelayMinutes: number;
  reviewChannelId: string | null;
  webhookEnabled: boolean;
  webhookUrl: string | null;
  webhookUrls: { channelId: string; webhookUrl: string }[];
  integrityCheckEnabled: boolean;
};

export type AutoRoleRequestStatus = "pending" | "approved" | "denied";

export type AutoRoleRequest = {
  id: number;
  guildId: string;
  userId: string;
  userName?: string | null;
  roleId: string;
  ruleKey: string;
  status: AutoRoleRequestStatus;
  totalMs: number;
  messageChannelId: string | null;
  messageId: string | null;
  decidedBy: string | null;
  decidedByName?: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TempChannel = {
  existsInDiscord?: boolean | null;
  channelId: string;
  ownerId: string;
  ownerName?: string | null;
  createdAt: string;
  lfgChannelId: string | null;
  lfgMessageId: string | null;
  activeSource?: "discord" | "db";
  availabilitySource?: "discord_api" | "unknown";
  activeUsers: {
    userId: string;
    userName?: string | null;
    joinedAt?: string | null;
  }[];
  activeCount?: number;
};

export type TempVoiceDeleteLog = {
  id: string;
  sourceType: "temp_deleted" | "manual_session";
  label: "Temp Deleted" | "Manual Voice Session";
  channelId: string;
  channelName: string | null;
  ownerId: string;
  eventAt: string;
  joinedAt?: string | null;
  leftAt?: string | null;
  ownerName?: string | null;
  history: { userId: string; userName?: string | null; totalMs: number }[];
};

export type VoiceDeleteLeaderboardEntry = {
  userId: string;
  userName?: string | null;
  totalMs: number;
  sessions: number;
};

export type ConfigResponse = {
  logChannelId: string | null;
  lfgChannelId: string | null;
  enabledVoiceChannelIds: string[];
  joinToCreateLobbies: JoinToCreateLobby[];
  autoRoleConfig: AutoRoleConfig;
  spamCatcherConfig: SpamCatcherConfig;
};

export type ChannelsResponse = {
  voiceChannels: Channel[];
  textChannels: Channel[];
};

export type RolesResponse = {
  roles: Role[];
};
