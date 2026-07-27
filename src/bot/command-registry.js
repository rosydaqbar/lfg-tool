const { buildSetupCommand } = require('./setup');
const { buildStatsCommand, buildVoicecheckCommand } = require('./stats');

function buildGuildCommands() {
  return [
    buildStatsCommand(),
    buildVoicecheckCommand(),
    buildSetupCommand(),
  ];
}

async function registerGuildCommands(guild) {
  await guild.commands.set(buildGuildCommands());
}

module.exports = {
  buildGuildCommands,
  registerGuildCommands,
};
