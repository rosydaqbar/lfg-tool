# Discord Voice Join Logger (discord.js v14+) Plan

## Goal
Detect when a user joins any voice channel, capture `userId` and `voiceChannelId`, and post a message with that info to a chosen text channel.

## Requirements
- Node.js 18+ (20+ recommended).
- discord.js v14+.
- A bot token with access to the target guild.
- A text channel ID where the bot can send messages.

## Permissions and Intents
- **Gateway intents**: `Guilds`, `GuildVoiceStates`.
- **Bot permissions** in the logging channel: `View Channel`, `Send Messages`.

## Event Flow
1. Listen to `voiceStateUpdate`.
2. Detect a join: `oldState.channelId === null && newState.channelId !== null`.
3. Extract:
   - `userId`: `newState.id` (or `newState.member?.id`).
   - `voiceChannelId`: `newState.channelId`.
4. Format and send a message to the configured text channel.

## Message Format
Example:
"Voice Join: userId=<USER_ID> voiceChannelId=<VOICE_CHANNEL_ID>"

## Configuration
- `.env` (or another config source):
  - `DISCORD_TOKEN`
  - `LOG_CHANNEL_ID`
  - `VOICE_CHANNEL_ID` (optional, restricts logging to a single voice channel)

## Implementation Steps
1. Initialize a discord.js `Client` with `Guilds` and `GuildVoiceStates` intents.
2. On `client.on('voiceStateUpdate', ...)`, detect joins only.
3. If `VOICE_CHANNEL_ID` is set, ignore joins to other channels.
4. Fetch the logging channel via `client.channels.fetch(LOG_CHANNEL_ID)`.
5. Send the formatted message.
6. Handle errors (missing channel, permissions, or fetch failure).

## File Management (No Docker)
- Suggested layout: `src/` for bot code, `config/` for non-secret IDs, `logs/` for optional file logging.
- Keep secrets in `.env`; include `.env` in `.gitignore`, add `.env.example` to document required keys.
- If you enable file logging, create `logs/` at startup and rotate logs by date or size.
- Document run commands and config in `README.md` for handoffs.

## Pseudocode
```js
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  const joined = !oldState.channelId && newState.channelId;
  if (!joined) return;

  if (process.env.VOICE_CHANNEL_ID && newState.channelId !== process.env.VOICE_CHANNEL_ID) {
    return;
  }

  const userId = newState.id;
  const voiceChannelId = newState.channelId;
  const channel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) return;

  await channel.send(
    `Voice Join: userId=${userId} voiceChannelId=${voiceChannelId}`
  );
});

client.login(process.env.DISCORD_TOKEN);
```

## Testing Checklist
- Join a voice channel and verify one message is sent.
- Move between voice channels and verify it does not trigger a "join" message (unless desired).
- Leave a voice channel and confirm no message is sent.
- Verify behavior when the log channel is missing or permissions are insufficient.

## Edge Cases
- Ignore bot users if needed (`newState.member?.user.bot`).
- Prevent duplicate messages if reconnects happen rapidly.
- Consider stage channels if they are in scope.
