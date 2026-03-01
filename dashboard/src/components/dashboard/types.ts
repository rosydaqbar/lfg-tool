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

export type JoinToCreateLobby = {
  channelId: string;
  roleId: string | null;
  lfgEnabled: boolean;
};

export type TempChannel = {
  channelId: string;
  ownerId: string;
  ownerName?: string | null;
  createdAt: string;
  lfgChannelId: string | null;
  lfgMessageId: string | null;
};

export type TempVoiceDeleteLog = {
  id: string;
  channelId: string;
  channelName: string | null;
  ownerId: string;
  ownerName?: string | null;
  deletedAt: string;
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
};

export type ChannelsResponse = {
  voiceChannels: Channel[];
  textChannels: Channel[];
};

export type RolesResponse = {
  roles: Role[];
};
