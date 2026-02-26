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
  createdAt: string;
  lfgChannelId: string | null;
  lfgMessageId: string | null;
};

export type TempVoiceDeleteLog = {
  id: string;
  channelId: string;
  channelName: string | null;
  ownerId: string;
  deletedAt: string;
  history: { userId: string; totalMs: number }[];
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
