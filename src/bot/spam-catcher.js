const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const {
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require('@discordjs/builders');

const APPEAL_PREFIX = 'spamcatcher_appeal';
const APPEAL_MODAL_PREFIX = 'spamcatcher_appeal_modal';
const REMOVE_TIMEOUT_PREFIX = 'spamcatcher_remove_timeout';
const DELAYED_BAN_INTERVAL_MS = 30 * 1000;
const CONFIG_CACHE_TTL_MS = 5000;
const DISCORD_TIMEOUT_MAX_MS = 28 * 24 * 60 * 60 * 1000;

function createSpamCatcherManager({ client, configStore }) {
  const configCache = new Map();
  let banInterval = null;
  let delayedBanRunning = false;

  async function getConfig(guildId) {
    const cached = configCache.get(guildId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await configStore.getSpamCatcherConfig(guildId);
    configCache.set(guildId, { value, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS });
    return value;
  }

  function appealButton(eventId) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${APPEAL_PREFIX}:${eventId}`)
        .setLabel('It was a mistake')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  async function dmUser(userId, payload) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return false;
    return user.send(payload).then(() => true).catch(() => false);
  }

  async function createDmChannel(userId) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return null;
    return user.createDM().catch(() => null);
  }

  async function getLogChannel(guildId) {
    const config = await configStore.getGuildConfig(guildId).catch(() => null);
    if (!config?.logChannelId) return null;
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return null;
    const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);
    return channel?.isTextBased() ? channel : null;
  }

  function formatNoticeMinutes(minutes) {
    const safeMinutes = Math.max(1, Math.floor(Number(minutes) || 1));
    if (safeMinutes % 1440 === 0) {
      const days = safeMinutes / 1440;
      return `${days} day${days === 1 ? '' : 's'}`;
    }
    if (safeMinutes % 60 === 0) {
      const hours = safeMinutes / 60;
      return `${hours} hour${hours === 1 ? '' : 's'}`;
    }
    return `${safeMinutes} minute${safeMinutes === 1 ? '' : 's'}`;
  }

  function buildTrapNoticePayload(caughtCount, config) {
    const safeCount = Math.max(0, Math.floor(Number(caughtCount) || 0));
    const timeoutText = formatNoticeMinutes(config.timeoutMinutes);
    const banDelayText = formatNoticeMinutes(config.banDelayMinutes);
    const actionId = config.autoBanEnabled
      ? config.banMode === 'immediate'
        ? 'kamu akan langsung terkena `ban`.'
        : `kamu akan terkena \`timeout\` selama ${timeoutText}, lalu terkena \`ban\` setelah ${banDelayText}.`
      : `kamu akan terkena \`timeout\` selama ${timeoutText}.`;
    const appealId = config.autoBanEnabled && config.banMode === 'immediate'
      ? 'Jika ini adalah kesalahan, silakan hubungi admin server.'
      : 'Jika kamu terkena timeout, silakan kirim private message ke salah satu admin yang sedang online atau gunakan tombol appeal jika tersedia.';
    const actionEn = config.autoBanEnabled
      ? config.banMode === 'immediate'
        ? 'you will be `banned` immediately.'
        : `you will receive a \`timeout\` for ${timeoutText}, then be \`banned\` after ${banDelayText}.`
      : `you will receive a \`timeout\` for ${timeoutText}.`;
    const appealEn = config.autoBanEnabled && config.banMode === 'immediate'
      ? 'If this was a mistake, please contact a server admin.'
      : 'If you are timed out, please send a private message to one of the online admins or use the appeal button if available.';

    return {
      flags: MessageFlags.IsComponentsV2,
      components: [
        new ContainerBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                '# 🚫 Dilarang Mengirim Pesan di Channel Ini',
                `⚠️ Channel ini dibuat untuk menangkap spammer. Jika kamu mengirim pesan di channel ini, ${actionId} ${appealId}`,
                '',
                '## 😈 Jangan Berani-Berani Mencoba',
                'Kalau cuma mau tes, sistem tetap akan menangkap kamu.',
                '',
                `-# Jumlah user yang sudah tertangkap di channel ini: \`${safeCount}\``,
              ].join('\n')
            )
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                '# 🚫 Do Not Send Messages in This Channel',
                `⚠️ This channel is made to catch spammers. If you send a message in this channel, ${actionEn} ${appealEn}`,
                '',
                "## 😈 Don't Even Think About Trying",
                'Even if you are just testing, the system will still catch you.',
                '',
                `-# Caught users in this channel: \`${safeCount}\``,
              ].join('\n')
            )
          ),
      ],
      allowedMentions: { parse: [] },
    };
  }

  function webhookEditUrl(webhookUrl, messageId) {
    const url = new URL(webhookUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/messages/${messageId}`;
    url.searchParams.set('with_components', 'true');
    return url.toString();
  }

  async function refreshTrapNoticeCount(guild, config, event) {
    const notice = await configStore
      .getSpamCatcherNoticeMessage(event.guildId, event.channelId)
      .catch(() => null);
    if (!notice?.messageId) return;

    const caughtCount = notice.deliveryMethod === 'webhook' && config.webhookEnabled
      ? (await Promise.all(
          (config.channelIds || []).map((channelId) =>
            configStore.getSpamCatcherCaughtCount(event.guildId, channelId).catch(() => 0)
          )
        )).reduce((total, count) => total + count, 0)
      : await configStore.getSpamCatcherCaughtCount(event.guildId, event.channelId).catch(() => 0);
    const payload = buildTrapNoticePayload(caughtCount, config);

    if (notice.deliveryMethod === 'webhook' && notice.webhookUrl) {
      await fetch(webhookEditUrl(notice.webhookUrl, notice.messageId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((error) => {
        console.error('Failed to edit Spam Catcher webhook notice:', error);
      });
      return;
    }

    const channel = await guild.channels.fetch(notice.channelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(notice.messageId).catch(() => null);
    if (!message) return;
    await message.edit(payload).catch((error) => {
      console.error('Failed to edit Spam Catcher trap notice:', error);
    });
  }

  async function logAction(event, title, details = []) {
    const logChannel = await getLogChannel(event.guildId);
    if (!logChannel) return;
    await logChannel.send({
      flags: MessageFlags.IsComponentsV2,
      components: [
        new ContainerBuilder()
          .setAccentColor(title.includes('Banned') ? 0xef4444 : 0xf59e0b)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                `### ${title}`,
                `- User: <@${event.userId}> (\`${event.userId}\`)`,
                `- Channel: <#${event.channelId}> (\`${event.channelId}\`)`,
                event.messageId ? `- Message ID: \`${event.messageId}\`` : null,
                `- Event ID: \`${event.id}\``,
                ...details,
              ].filter(Boolean).join('\n')
            )
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# Logged <t:${Math.floor(Date.now() / 1000)}:F>`)
          ),
      ],
      allowedMentions: { parse: [] },
    }).catch((error) => {
      console.error('Failed to send Spam Catcher log:', error);
    });
  }

  function buildReviewComponents(event) {
    const delayText = event.banAfter
      ? `- Scheduled ban: <t:${Math.floor(event.banAfter.getTime() / 1000)}:R>`
      : null;
    return {
      flags: MessageFlags.IsComponentsV2,
      components: [
        new ContainerBuilder()
          .setAccentColor(0xf59e0b)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                '### Spam Catcher Appeal',
                '-# A caught user submitted an appeal from DM.',
                '',
                `- User: <@${event.userId}> (\`${event.userId}\`)`,
                `- Catcher channel: <#${event.channelId}> (\`${event.channelId}\`)`,
                event.messageId ? `- Message ID: \`${event.messageId}\`` : null,
                delayText,
                `- Event ID: \`${event.id}\``,
                '',
                `**Appeal:** ${event.appealMessage || '(empty)'}`,
              ].filter(Boolean).join('\n')
            )
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`${REMOVE_TIMEOUT_PREFIX}:${event.id}`)
                .setLabel('Remove timeout')
                .setStyle(ButtonStyle.Success)
            )
          ),
      ],
      allowedMentions: { parse: [], users: [event.userId] },
    };
  }

  function buildResolvedReviewComponents(event, adminId) {
    return {
      flags: MessageFlags.IsComponentsV2,
      components: [
        new ContainerBuilder()
          .setAccentColor(0x22c55e)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                '### Spam Catcher Appeal Resolved',
                `- User: <@${event.userId}> (\`${event.userId}\`)`,
                `- Event ID: \`${event.id}\``,
                `- Timeout removed by <@${adminId}>`,
                `- Resolved: <t:${Math.floor(Date.now() / 1000)}:F>`,
              ].join('\n')
            )
          ),
      ],
      allowedMentions: { parse: [] },
    };
  }

  async function handleImmediateBan(guild, event) {
    const dmChannel = await createDmChannel(event.userId);
    let banError = null;
    await guild.members.ban(event.userId, {
      reason: `Spam Catcher immediate ban, event ${event.id}`,
      deleteMessageSeconds: 0,
    }).catch((error) => {
      banError = error;
    });

    if (banError) {
      console.error('Failed Spam Catcher immediate ban:', banError);
      await configStore.updateSpamCatcherEventStatus(event.id, 'ban_failed').catch(() => null);
      await logAction(event, 'Spam Catcher Ban Failed', [`- Reason: \`${banError.message || banError}\``]);
      return;
    }

    const updated = await configStore.updateSpamCatcherEventStatus(event.id, 'banned').catch(() => event);
    const dmPayload = {
      content: 'You have been banned by Spam Catcher. If this was a mistake, please contact a server admin.',
    };
    const dmSent = dmChannel
      ? await dmChannel.send(dmPayload).then(() => true).catch(() => false)
      : await dmUser(event.userId, dmPayload);
    await logAction(updated || event, 'Spam Catcher Banned User', [
      '- Mode: `immediate`',
      `- DM after ban: \`${dmSent ? 'sent' : 'failed'}\``,
    ]);
  }

  async function handleTimeout(guild, member, config, event) {
    const timeoutMs = Math.min(config.timeoutMinutes * 60 * 1000, DISCORD_TIMEOUT_MAX_MS);
    let timeoutError = null;
    await member.timeout(timeoutMs, `Spam Catcher event ${event.id}`).catch((error) => {
      timeoutError = error;
    });

    if (timeoutError) {
      console.error('Failed Spam Catcher timeout:', timeoutError);
      await configStore.updateSpamCatcherEventStatus(event.id, 'timeout_failed').catch(() => null);
      await logAction(event, 'Spam Catcher Timeout Failed', [`- Reason: \`${timeoutError.message || timeoutError}\``]);
      return;
    }

    await dmUser(member.id, {
      content: [
        `You have been timed out in ${guild.name} because you posted in a spam catcher channel.`,
        'If this was a mistake, click the button below and explain what happened.',
      ].join('\n'),
      components: [appealButton(event.id)],
    });

    await logAction(event, 'Spam Catcher Timed Out User', [
      `- Timeout: \`${config.timeoutMinutes} minutes\``,
      event.banAfter ? `- Delayed ban: <t:${Math.floor(event.banAfter.getTime() / 1000)}:R>` : '- Delayed ban: `off`',
    ]);
  }

  async function handleMessage(message) {
    if (!message.guild || !message.member || message.author?.bot || message.webhookId) return;
    const config = await getConfig(message.guild.id).catch((error) => {
      console.error('Failed to load Spam Catcher config:', error);
      return null;
    });
    if (!config?.enabled || !config.channelIds.includes(message.channelId)) return;
    if (message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

    const action = config.autoBanEnabled && config.banMode === 'immediate'
      ? 'ban_immediate'
      : config.autoBanEnabled
        ? 'ban_delayed'
        : 'timeout';
    const now = Date.now();
    const banAfter = action === 'ban_delayed'
      ? new Date(now + config.banDelayMinutes * 60 * 1000)
      : null;
    const event = await configStore.createSpamCatcherEvent({
      guildId: message.guild.id,
      userId: message.author.id,
      channelId: message.channelId,
      messageId: message.id,
      action,
      status: action === 'ban_delayed' ? 'ban_pending' : action === 'timeout' ? 'timed_out' : 'caught',
      timeoutUntil: action === 'ban_immediate' ? null : new Date(now + config.timeoutMinutes * 60 * 1000),
      banAfter,
      reviewChannelId: config.reviewChannelId,
    });

    if (!event) return;
    await refreshTrapNoticeCount(message.guild, config, event);
    if (action === 'ban_immediate') {
      await handleImmediateBan(message.guild, event);
      return;
    }

    await handleTimeout(message.guild, message.member, config, event);
  }

  async function handleAppealButton(interaction) {
    const [, eventId] = interaction.customId.split(':');
    const modal = new ModalBuilder()
      .setCustomId(`${APPEAL_MODAL_PREFIX}:${eventId}`)
      .setTitle('Spam Catcher appeal')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('appeal_message')
            .setLabel('Why was this a mistake?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000)
        )
      );
    await interaction.showModal(modal);
  }

  async function handleAppealModal(interaction) {
    const [, eventIdRaw] = interaction.customId.split(':');
    const eventId = Number(eventIdRaw);
    const message = interaction.fields.getTextInputValue('appeal_message').trim();
    const event = await configStore.markSpamCatcherAppealed(eventId, message).catch(() => null);
    if (!event || event.userId !== interaction.user.id) {
      await interaction.reply({ content: 'Appeal not found.', flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }

    const guild = await client.guilds.fetch(event.guildId).catch(() => null);
    const reviewChannel = guild && event.reviewChannelId
      ? await guild.channels.fetch(event.reviewChannelId).catch(() => null)
      : null;
    if (!reviewChannel?.isTextBased()) {
      await interaction.reply({
        content: 'Your appeal was saved, but the review channel is not available. Please contact an admin.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return;
    }

    const sent = await reviewChannel.send(buildReviewComponents(event)).catch((error) => {
      console.error('Failed to send Spam Catcher appeal review:', error);
      return null;
    });
    if (sent) {
      await configStore.updateSpamCatcherReviewMessage(event.id, reviewChannel.id, sent.id).catch(() => null);
    }
    await interaction.reply({ content: 'Your appeal was sent to the admins.', flags: MessageFlags.Ephemeral }).catch(() => null);
  }

  async function handleRemoveTimeout(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: 'Only users with Administrator permission can remove Spam Catcher timeouts.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return;
    }

    const [, eventIdRaw] = interaction.customId.split(':');
    const eventId = Number(eventIdRaw);
    const event = await configStore.getSpamCatcherEventById(eventId).catch(() => null);
    if (!event) {
      await interaction.reply({ content: 'Spam Catcher event not found.', flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }

    const member = interaction.guild
      ? await interaction.guild.members.fetch(event.userId).catch(() => null)
      : null;
    if (member) {
      await member.timeout(null, `Spam Catcher appeal accepted by ${interaction.user.id}`).catch((error) => {
        console.error('Failed to remove Spam Catcher timeout:', error);
      });
    }

    const updated = await configStore.resolveSpamCatcherAppeal(event.id, interaction.user.id).catch(() => event);
    await interaction.update(buildResolvedReviewComponents(updated || event, interaction.user.id)).catch(async () => {
      await interaction.reply({ content: 'Timeout removed, but failed to update review message.', flags: MessageFlags.Ephemeral }).catch(() => null);
    });
    await logAction(updated || event, 'Spam Catcher Timeout Removed', [`- Removed by: <@${interaction.user.id}>`]);
  }

  async function handleInteraction(interaction) {
    if (interaction.isButton() && interaction.customId.startsWith(`${APPEAL_PREFIX}:`)) {
      await handleAppealButton(interaction);
      return true;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith(`${APPEAL_MODAL_PREFIX}:`)) {
      await handleAppealModal(interaction);
      return true;
    }
    if (interaction.isButton() && interaction.customId.startsWith(`${REMOVE_TIMEOUT_PREFIX}:`)) {
      await handleRemoveTimeout(interaction);
      return true;
    }
    return false;
  }

  async function runDelayedBansOnce() {
    if (delayedBanRunning) return;
    delayedBanRunning = true;
    try {
      const events = await configStore.getDueSpamCatcherBanEvents(25).catch(() => []);
      for (const event of events) {
        const guild = client.guilds.cache.get(event.guildId) || await client.guilds.fetch(event.guildId).catch(() => null);
        if (!guild) continue;
        await handleImmediateBan(guild, event);
      }
    } finally {
      delayedBanRunning = false;
    }
  }

  function startLoop() {
    if (banInterval) return;
    runDelayedBansOnce().catch((error) => console.error('Failed initial Spam Catcher delayed-ban pass:', error));
    banInterval = setInterval(() => {
      runDelayedBansOnce().catch((error) => console.error('Failed Spam Catcher delayed-ban pass:', error));
    }, DELAYED_BAN_INTERVAL_MS);
  }

  function stopLoop() {
    if (!banInterval) return;
    clearInterval(banInterval);
    banInterval = null;
  }

  return {
    handleMessage,
    handleInteraction,
    startLoop,
    stopLoop,
  };
}

module.exports = { createSpamCatcherManager };
