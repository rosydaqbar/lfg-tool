require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { DISCORD_TOKEN, requireToken } = require('../src/bot/env');
const { buildStatsCommand } = require('../src/bot/stats');

requireToken();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function deployGuildCommands() {
  const command = buildStatsCommand();
  const guilds = [...client.guilds.cache.values()];

  if (!guilds.length) {
    console.log('No guilds found for this bot. Nothing to deploy.');
    return;
  }

  let successCount = 0;

  for (const guild of guilds) {
    try {
      await guild.commands.set([command]);
      successCount += 1;
      console.log(`Deployed commands to guild ${guild.name} (${guild.id})`);
    } catch (error) {
      console.error(`Failed deploying commands to guild ${guild.id}:`, error?.message || error);
    }
  }

  console.log(`Done. Command deploy success: ${successCount}/${guilds.length}`);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}. Deploying slash commands...`);
  try {
    await deployGuildCommands();
  } finally {
    await client.destroy();
    process.exit(0);
  }
});

client.login(DISCORD_TOKEN).catch((error) => {
  console.error('Failed to login bot for command deployment:', error);
  process.exit(1);
});
