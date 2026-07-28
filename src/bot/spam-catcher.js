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
const { getGuildLocale, t } = require('../i18n');

const APPEAL_PREFIX = 'spamcatcher_appeal';
const APPEAL_MODAL_PREFIX = 'spamcatcher_appeal_modal';
const BAN_USER_PREFIX = 'spamcatcher_ban_user';
const REMOVE_TIMEOUT_PREFIX = 'spamcatcher_remove_timeout';
const REMOVE_TIMEOUT_CONFIRM_PREFIX = 'spamcatcher_remove_timeout_confirm';
const REMOVE_TIMEOUT_CANCEL_PREFIX = 'spamcatcher_remove_timeout_cancel';
const INTEGRITY_ID_PREFIX = 'spamcatcher_integrity_id';
const INTEGRITY_EN_PREFIX = 'spamcatcher_integrity_en';
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

  function appealButton(eventId, locale = 'en') {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${APPEAL_PREFIX}:${eventId}`)
        .setLabel(t(locale, 'spamCatcher.appealButton'))
        .setStyle(ButtonStyle.Secondary)
    );
  }

  function integrityCustomId(prefix, guildId, channelId) {
    return `${prefix}:${guildId}:${channelId}`;
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

  function formatNoticeMinutes(minutes, locale = 'en') {
    const safeMinutes = Math.max(1, Math.floor(Number(minutes) || 1));
    if (safeMinutes % 1440 === 0) {
      const days = safeMinutes / 1440;
      return t(locale, days === 1 ? 'spamCatcher.dayOne' : 'spamCatcher.dayOther', { count: days });
    }
    if (safeMinutes % 60 === 0) {
      const hours = safeMinutes / 60;
      return t(locale, hours === 1 ? 'spamCatcher.hourOne' : 'spamCatcher.hourOther', { count: hours });
    }
    return t(locale, safeMinutes === 1 ? 'spamCatcher.minuteOne' : 'spamCatcher.minuteOther', { count: safeMinutes });
  }

  function buildTrapNoticePayload(caughtCount, integrityCount, config, context = {}) {
    const safeCount = Math.max(0, Math.floor(Number(caughtCount) || 0));
    const safeIntegrityCount = Math.max(0, Math.floor(Number(integrityCount) || 0));
    const locale = context.locale || 'en';
    const timeoutText = formatNoticeMinutes(config.timeoutMinutes, locale);
    const banDelayText = formatNoticeMinutes(config.banDelayMinutes, locale);
    const action = config.autoBanEnabled
      ? config.banMode === 'immediate'
        ? t(locale, 'spamCatcher.actionImmediate')
        : config.banMode === 'after_timeout'
          ? t(locale, 'spamCatcher.actionAfterTimeout', { timeout: timeoutText })
          : t(locale, 'spamCatcher.actionDelayed', { timeout: timeoutText, delay: banDelayText })
      : t(locale, 'spamCatcher.actionTimeout', { timeout: timeoutText });
    const appeal = t(locale, config.autoBanEnabled && config.banMode === 'immediate'
      ? 'spamCatcher.appealImmediate'
      : 'spamCatcher.appealTimeout');

    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            t(locale, 'spamCatcher.noticeTitle'),
            t(locale, 'spamCatcher.noticeBody', { action, appeal }),
            '',
            t(locale, 'spamCatcher.warningTitle'),
            t(locale, 'spamCatcher.warningBody'),
            '',
            t(locale, 'spamCatcher.caughtCount', { count: safeCount }),
            t(locale, 'spamCatcher.integrityCount', { count: safeIntegrityCount }),
          ].join('\n')
        )
      );

    if (config.integrityCheckEnabled) {
      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(integrityCustomId(INTEGRITY_EN_PREFIX, context.guildId || 'unknown', context.channelId || 'unknown'))
            .setLabel(t(locale, 'spamCatcher.integrityButton'))
            .setStyle(ButtonStyle.Secondary)
        )
      );
    }
    const components = [container];

    return {
      flags: MessageFlags.IsComponentsV2,
      components,
      allowedMentions: { parse: [] },
    };
  }

  function webhookEditUrl(webhookUrl, messageId) {
    const url = new URL(webhookUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/messages/${messageId}`;
    url.searchParams.set('with_components', 'true');
    return url.toString();
  }

  async function refreshTrapNoticeForChannel(guild, config, guildId, channelId) {
    const notice = await configStore
      .getSpamCatcherNoticeMessage(guildId, channelId)
      .catch(() => null);
    if (!notice?.messageId) return;

    const [caughtCount, integrityCount] = await Promise.all([
      configStore.getSpamCatcherCaughtCount(guildId, channelId).catch(() => 0),
      configStore.getSpamCatcherIntegrityCount(guildId, channelId).catch(() => 0),
    ]);
    const locale = await getGuildLocale(configStore, guildId);
    const payload = buildTrapNoticePayload(
      caughtCount,
      integrityCount,
      notice.deliveryMethod === 'webhook'
        ? { ...config, integrityCheckEnabled: false }
        : config,
      { guildId, channelId, locale }
    );

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

  async function refreshTrapNoticeCount(guild, config, event) {
    await refreshTrapNoticeForChannel(guild, config, event.guildId, event.channelId);
  }

  async function logAction(event, title, details = []) {
    const logChannel = await getLogChannel(event.guildId);
    if (!logChannel) return;
    const locale = await getGuildLocale(configStore, event.guildId);
    await logChannel.send({
      flags: MessageFlags.IsComponentsV2,
      components: [
        new ContainerBuilder()
          .setAccentColor(reviewAccentColor(event))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                `### ${title}`,
                 t(locale, 'spamCatcher.logUser', { userId: event.userId }),
                 t(locale, 'spamCatcher.logChannel', { channelId: event.channelId }),
                 event.messageId ? t(locale, 'spamCatcher.messageId', { messageId: event.messageId }) : null,
                 t(locale, 'spamCatcher.eventId', { eventId: event.id }),
                ...details,
              ].filter(Boolean).join('\n')
            )
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(t(locale, 'spamCatcher.logged', { timestamp: `<t:${Math.floor(Date.now() / 1000)}:F>` }))
          ),
      ],
      allowedMentions: { parse: [] },
    }).catch((error) => {
      console.error('Failed to send Spam Catcher log:', error);
    });
  }

  function timestamp(date, style = 'R') {
    if (!date) return null;
    return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
  }

  function reviewActionLabel(event, locale) {
    if (event.action === 'ban_immediate') return t(locale, 'spamCatcher.actionBanImmediate');
    if (event.action === 'ban_after_timeout') return t(locale, 'spamCatcher.actionBanAfterTimeout');
    if (event.action === 'ban_delayed') return t(locale, 'spamCatcher.actionBanDelayed');
    return t(locale, 'spamCatcher.actionTimeoutOnly');
  }

  function reviewStatusLabel(event, locale) {
    const labels = {
      caught: 'statusCaught',
      timed_out: 'statusTimedOut',
      ban_pending: 'statusBanPending',
      banned: 'statusBanned',
      ban_failed: 'statusBanFailed',
      timeout_failed: 'statusTimeoutFailed',
      timeout_removed: 'statusTimeoutRemoved',
      already_timed_out: 'statusAlreadyTimedOut',
      already_banned: 'statusAlreadyBanned',
      member_unavailable: 'statusMemberUnavailable',
    };
    return labels[event.status]
      ? t(locale, `spamCatcher.${labels[event.status]}`)
      : event.status || t(locale, 'spamCatcher.statusUnknown');
  }

  function reviewTitle(event, locale) {
    if (event.status === 'banned') return t(locale, 'spamCatcher.bannedTitle');
    if (event.status === 'ban_failed') return t(locale, 'spamCatcher.banFailedTitle');
    if (event.status === 'timeout_failed') return t(locale, 'spamCatcher.timeoutFailedTitle');
    if (event.status === 'timeout_removed') return t(locale, 'spamCatcher.timeoutRemovedTitle');
    if (event.status === 'already_timed_out') return t(locale, 'spamCatcher.alreadyTimedOutTitle');
    if (event.status === 'already_banned') return t(locale, 'spamCatcher.alreadyBannedTitle');
    if (event.status === 'member_unavailable') return t(locale, 'spamCatcher.memberUnavailableTitle');
    return t(locale, 'spamCatcher.reviewTitle');
  }

  function reviewAccentColor(event) {
    if (event.status === 'banned' || event.status === 'already_banned' || event.status === 'ban_failed' || event.status === 'timeout_failed') return 0xef4444;
    if (event.status === 'member_unavailable') return 0x64748b;
    if (event.status === 'timeout_removed') return 0x22c55e;
    return 0xf59e0b;
  }

  function scheduledBanLine(event, locale) {
    if (event.status === 'banned' || event.status === 'already_banned' || event.status === 'timeout_removed') return null;
    if (!event.banAfter) return null;
    const scheduledAt = timestamp(event.banAfter);
    if (event.action === 'ban_after_timeout') return t(locale, 'spamCatcher.banAfterTimeout', { timestamp: scheduledAt });
    if (event.action === 'ban_delayed') return t(locale, 'spamCatcher.banAfterAppeal', { timestamp: scheduledAt });
    return t(locale, 'spamCatcher.scheduledBan', { timestamp: scheduledAt });
  }

  function catcherMessageLine(event, locale) {
    if (!event.messageId) return t(locale, 'spamCatcher.catcherUnavailable', { channelId: event.channelId });
    return t(locale, 'spamCatcher.catcherMessage', {
      url: `https://discord.com/channels/${event.guildId}/${event.channelId}/${event.messageId}`,
    });
  }

  function canReviewTimeout(event) {
    return event.action !== 'ban_immediate' && (event.status === 'timed_out' || event.status === 'ban_pending');
  }

  function buildReviewComponents(event, locale = 'en') {
    const container = new ContainerBuilder()
      .setAccentColor(reviewAccentColor(event))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `### ${reviewTitle(event, locale)}`,
            t(locale, 'spamCatcher.reviewHelp'),
            '',
            t(locale, 'spamCatcher.logUser', { userId: event.userId }),
            catcherMessageLine(event, locale),
            t(locale, 'spamCatcher.actionLine', { action: reviewActionLabel(event, locale) }),
            t(locale, 'spamCatcher.statusLine', { status: reviewStatusLabel(event, locale) }),
            event.timeoutUntil && event.status !== 'banned' && event.status !== 'timeout_removed'
              ? t(locale, 'spamCatcher.timeoutUntil', { timestamp: timestamp(event.timeoutUntil) })
              : null,
            scheduledBanLine(event, locale),
            event.bannedAt ? t(locale, 'spamCatcher.bannedAt', { timestamp: timestamp(event.bannedAt, 'F') }) : null,
            event.decidedBy ? t(locale, 'spamCatcher.decidedBy', { adminId: event.decidedBy }) : null,
            t(locale, 'spamCatcher.eventId', { eventId: event.id }),
          ].filter(Boolean).join('\n')
        )
      );

    if (event.appealMessage) {
      container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`${t(locale, 'spamCatcher.appealHeading')}\n${event.appealMessage}`)
        );
    }

    if (canReviewTimeout(event)) {
      container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`${BAN_USER_PREFIX}:${event.id}`)
              .setLabel(t(locale, 'spamCatcher.banUser'))
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`${REMOVE_TIMEOUT_PREFIX}:${event.id}`)
              .setLabel(t(locale, 'spamCatcher.removeTimeout'))
              .setStyle(ButtonStyle.Success)
          )
        );
    }

    return {
      flags: MessageFlags.IsComponentsV2,
      components: [container],
      allowedMentions: { parse: [], users: [event.userId] },
    };
  }

  function buildRemoveTimeoutConfirmationComponents(event, adminId, locale = 'en') {
    return {
      flags: MessageFlags.IsComponentsV2,
      components: [
        new ContainerBuilder()
          .setAccentColor(0xf97316)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                t(locale, 'spamCatcher.confirmRemoveTitle'),
                t(locale, 'spamCatcher.logUser', { userId: event.userId }),
                t(locale, 'spamCatcher.requestedBy', { adminId }),
                t(locale, 'spamCatcher.eventId', { eventId: event.id }),
                '',
                t(locale, 'spamCatcher.removeWarning'),
                event.banAfter ? t(locale, 'spamCatcher.cancelBanWarning') : null,
              ].filter(Boolean).join('\n')
            )
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`${REMOVE_TIMEOUT_CONFIRM_PREFIX}:${event.id}`)
                .setLabel(t(locale, 'spamCatcher.confirmRemove'))
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`${REMOVE_TIMEOUT_CANCEL_PREFIX}:${event.id}`)
                .setLabel(t(locale, 'spamCatcher.cancel'))
                .setStyle(ButtonStyle.Secondary)
            )
          ),
      ],
      allowedMentions: { parse: [], users: [event.userId] },
    };
  }

  function buildResolvedReviewComponents(event, locale) {
    return buildReviewComponents(event, locale);
  }

  async function sendOrUpdateReviewMessage(guild, event, buildPayload = buildReviewComponents) {
    if (!guild || !event?.reviewChannelId) return null;
    const channel = await guild.channels.fetch(event.reviewChannelId).catch(() => null);
    if (!channel?.isTextBased()) return null;

    const locale = await getGuildLocale(configStore, event.guildId || guild.id);
    const payload = buildPayload(event, locale);
    if (event.reviewMessageId) {
      const existing = await channel.messages.fetch(event.reviewMessageId).catch(() => null);
      if (existing) {
        const edited = await existing.edit(payload).catch((error) => {
          console.error('Failed to edit Spam Catcher review message:', error);
          return null;
        });
        if (edited) return event;
      }
    }

    const sent = await channel.send(payload).catch((error) => {
      console.error('Failed to send Spam Catcher review message:', error);
      return null;
    });
    if (!sent) return null;
    return configStore.updateSpamCatcherReviewMessage(event.id, channel.id, sent.id).catch(() => event);
  }

  async function handleImmediateBan(guild, event, options = {}) {
    const locale = await getGuildLocale(configStore, event.guildId || guild.id);
    const mode = event.action === 'ban_after_timeout'
      ? 'after_timeout'
      : event.action === 'ban_delayed'
        ? 'delayed'
        : 'immediate';
    const dmChannel = await createDmChannel(event.userId);
    const dmPayload = {
      content: t(locale, 'spamCatcher.dmBan'),
    };
    const dmSent = dmChannel
      ? await dmChannel.send(dmPayload).then(() => true).catch(() => false)
      : await dmUser(event.userId, dmPayload);

    const existingBan = await guild.bans.fetch(event.userId).catch(() => null);
    if (existingBan) {
      const updated = await configStore.updateSpamCatcherEventModerationState(event.id, {
        status: 'already_banned',
        timeoutUntil: event.timeoutUntil,
        banAfter: null,
        decidedBy: options.decidedBy,
      }).catch(() => ({
        ...event,
        status: 'already_banned',
        decidedBy: options.decidedBy || event.decidedBy,
        bannedAt: new Date(),
      }));
      await logAction(updated || event, t(locale, 'spamCatcher.alreadyBannedTitle'), [
        t(locale, 'spamCatcher.mode', { mode }),
        t(locale, 'spamCatcher.resultAlreadyBanned'),
        t(locale, 'spamCatcher.dmBeforeBan', { result: t(locale, dmSent ? 'spamCatcher.sent' : 'spamCatcher.failed') }),
      ]);
      await sendOrUpdateReviewMessage(guild, updated || event).catch(() => null);
      return updated || event;
    }

    let banError = null;
    await guild.members.ban(event.userId, {
      reason: t(locale, 'spamCatcher.banReason', { mode, eventId: event.id }),
      deleteMessageSeconds: 0,
    }).catch((error) => {
      banError = error;
    });

    if (banError) {
      console.error('Failed Spam Catcher ban:', banError);
      const updated = await configStore
        .updateSpamCatcherEventStatus(event.id, 'ban_failed', options.decidedBy)
        .catch(() => ({ ...event, status: 'ban_failed', decidedBy: options.decidedBy || event.decidedBy }));
      await logAction(updated || event, t(locale, 'spamCatcher.banFailedTitle'), [
        t(locale, 'spamCatcher.reason', { reason: banError.message || banError }),
        t(locale, 'spamCatcher.dmBeforeBan', { result: t(locale, dmSent ? 'spamCatcher.sent' : 'spamCatcher.failed') }),
      ]);
      await sendOrUpdateReviewMessage(guild, updated || event).catch(() => null);
      return updated || event;
    }

    const updated = await configStore.updateSpamCatcherEventStatus(event.id, 'banned', options.decidedBy).catch(() => ({
      ...event,
      status: 'banned',
      decidedBy: options.decidedBy || event.decidedBy,
      bannedAt: new Date(),
    }));
    await logAction(updated || event, t(locale, 'spamCatcher.bannedTitle'), [
      t(locale, 'spamCatcher.mode', { mode }),
      t(locale, 'spamCatcher.dmBeforeBan', { result: t(locale, dmSent ? 'spamCatcher.sent' : 'spamCatcher.failed') }),
    ]);
    await sendOrUpdateReviewMessage(guild, updated || event).catch(() => null);
    return updated || event;
  }

  async function handleTimeout(guild, member, config, event) {
    const locale = await getGuildLocale(configStore, event.guildId || guild.id);
    if (!member) {
      const updated = await configStore.updateSpamCatcherEventModerationState(event.id, {
        status: 'member_unavailable',
        timeoutUntil: event.timeoutUntil,
        banAfter: null,
      }).catch(() => ({
        ...event,
        status: 'member_unavailable',
        banAfter: null,
      }));
      await logAction(updated || event, t(locale, 'spamCatcher.memberUnavailableTitle'), [
        t(locale, 'spamCatcher.reason', { reason: t(locale, 'spamCatcher.memberUnavailableReason') }),
      ]);
      await sendOrUpdateReviewMessage(guild, updated || event).catch(() => null);
      return updated || event;
    }

    const existingTimeoutUntilMs = member.communicationDisabledUntilTimestamp || 0;
    if (existingTimeoutUntilMs > Date.now()) {
      const existingTimeoutUntil = new Date(existingTimeoutUntilMs);
      const updated = await configStore.updateSpamCatcherEventModerationState(event.id, {
        status: event.action === 'timeout' ? 'already_timed_out' : 'ban_pending',
        timeoutUntil: existingTimeoutUntil,
        banAfter: event.action === 'ban_after_timeout' ? existingTimeoutUntil : event.banAfter,
      }).catch(() => ({
        ...event,
        status: event.action === 'timeout' ? 'already_timed_out' : event.status,
        timeoutUntil: existingTimeoutUntil,
        banAfter: event.action === 'ban_after_timeout' ? existingTimeoutUntil : event.banAfter,
      }));
      await dmUser(member.id, {
        content: [
          t(locale, 'spamCatcher.existingTimeoutDm', { guildName: guild.name }),
          event.action === 'ban_after_timeout'
            ? t(locale, 'spamCatcher.existingTimeoutBan')
            : t(locale, 'spamCatcher.appealDmHelp'),
        ].join('\n'),
        components: [appealButton(event.id, locale)],
      });
      await logAction(updated || event, t(locale, 'spamCatcher.alreadyTimedOutTitle'), [
        t(locale, 'spamCatcher.existingTimeoutUntil', { timestamp: timestamp(existingTimeoutUntil, 'F') }),
        event.action === 'ban_after_timeout'
          ? t(locale, 'spamCatcher.banAfterExistingTimeout', { timestamp: timestamp(existingTimeoutUntil) })
          : null,
      ].filter(Boolean));
      await sendOrUpdateReviewMessage(guild, updated || event).catch(() => null);
      return updated || event;
    }

    const timeoutMs = Math.min(config.timeoutMinutes * 60 * 1000, DISCORD_TIMEOUT_MAX_MS);
    let timeoutError = null;
    await member.timeout(timeoutMs, t(locale, 'spamCatcher.timeoutReason', { eventId: event.id })).catch((error) => {
      timeoutError = error;
    });

    if (timeoutError) {
      console.error('Failed Spam Catcher timeout:', timeoutError);
      const updated = await configStore.updateSpamCatcherEventStatus(event.id, 'timeout_failed').catch(() => ({
        ...event,
        status: 'timeout_failed',
      }));
      await logAction(updated || event, t(locale, 'spamCatcher.timeoutFailedTitle'), [
        t(locale, 'spamCatcher.reason', { reason: timeoutError.message || timeoutError }),
      ]);
      await sendOrUpdateReviewMessage(guild, updated || event).catch(() => null);
      return updated || event;
    }

    await dmUser(member.id, {
      content: [
        t(locale, 'spamCatcher.dmTimeout', { guildName: guild.name }),
      ].join('\n'),
      components: [appealButton(event.id, locale)],
    });

    await logAction(event, t(locale, 'spamCatcher.timedOutTitle'), [
      t(locale, 'spamCatcher.timeoutDuration', { duration: formatNoticeMinutes(config.timeoutMinutes, locale) }),
      event.banAfter
        ? event.action === 'ban_after_timeout'
          ? t(locale, 'spamCatcher.banAfterTimeout', { timestamp: `<t:${Math.floor(event.banAfter.getTime() / 1000)}:R>` })
          : t(locale, 'spamCatcher.banAfterAppeal', { timestamp: `<t:${Math.floor(event.banAfter.getTime() / 1000)}:R>` })
        : t(locale, 'spamCatcher.scheduledBanOff'),
    ]);
    await sendOrUpdateReviewMessage(guild, event).catch(() => null);
    return event;
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
      : config.autoBanEnabled && config.banMode === 'after_timeout'
        ? 'ban_after_timeout'
        : config.autoBanEnabled
          ? 'ban_delayed'
          : 'timeout';
    const now = Date.now();
    const timeoutUntil = action === 'ban_immediate'
      ? null
      : new Date(now + config.timeoutMinutes * 60 * 1000);
    const banAfter = action === 'ban_delayed'
      ? new Date(now + config.banDelayMinutes * 60 * 1000)
      : action === 'ban_after_timeout'
        ? timeoutUntil
      : null;
    const event = await configStore.createSpamCatcherEvent({
      guildId: message.guild.id,
      userId: message.author.id,
      channelId: message.channelId,
      messageId: message.id,
      action,
      status: action === 'ban_delayed' || action === 'ban_after_timeout' ? 'ban_pending' : action === 'timeout' ? 'timed_out' : 'caught',
      timeoutUntil,
      banAfter,
      reviewChannelId: config.reviewChannelId,
    });

    if (!event) return;
    await refreshTrapNoticeCount(message.guild, config, event);
    if (action === 'ban_immediate') {
      await handleImmediateBan(message.guild, event);
      return;
    }

    const freshMember = await message.guild.members.fetch(message.author.id).catch(() => null);
    await handleTimeout(message.guild, freshMember, config, event);
  }

  async function handleAppealButton(interaction) {
    const [, eventId] = interaction.customId.split(':');
    const event = await configStore.getSpamCatcherEventById(Number(eventId)).catch(() => null);
    const locale = await getGuildLocale(configStore, event?.guildId);
    const modal = new ModalBuilder()
      .setCustomId(`${APPEAL_MODAL_PREFIX}:${eventId}`)
      .setTitle(t(locale, 'spamCatcher.appealModalTitle'))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('appeal_message')
            .setLabel(t(locale, 'spamCatcher.appealInputLabel'))
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
    const locale = await getGuildLocale(configStore, event?.guildId);
    if (!event || event.userId !== interaction.user.id) {
      await interaction.reply({ content: t(locale, 'spamCatcher.appealNotFound'), flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }

    const guild = await client.guilds.fetch(event.guildId).catch(() => null);
    const reviewChannel = guild && event.reviewChannelId
      ? await guild.channels.fetch(event.reviewChannelId).catch(() => null)
      : null;
    if (!reviewChannel?.isTextBased()) {
      await interaction.reply({
        content: t(locale, 'spamCatcher.appealReviewUnavailable'),
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return;
    }

    const sent = await sendOrUpdateReviewMessage(guild, event).catch(() => null);
    if (!sent) {
      await interaction.reply({
        content: t(locale, 'spamCatcher.appealSendFailed'),
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return;
    }
    await interaction.reply({ content: t(locale, 'spamCatcher.appealSent'), flags: MessageFlags.Ephemeral }).catch(() => null);
  }

  async function requireAdmin(interaction, actionKey, locale) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: t(locale, 'spamCatcher.adminRequired', { action: t(locale, actionKey) }),
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return false;
    }
    return true;
  }

  async function getInteractionEvent(interaction) {
    const [, eventIdRaw] = interaction.customId.split(':');
    const eventId = Number(eventIdRaw);
    if (!Number.isFinite(eventId)) return null;
    return configStore.getSpamCatcherEventById(eventId).catch(() => null);
  }

  async function handleRemoveTimeout(interaction) {
    const locale = await getGuildLocale(configStore, interaction.guildId);
    if (!await requireAdmin(interaction, 'spamCatcher.adminRemoveTimeout', locale)) return;

    const event = await getInteractionEvent(interaction);
    if (!event) {
      await interaction.reply({ content: t(locale, 'spamCatcher.eventNotFound'), flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }

    if (!canReviewTimeout(event)) {
      await interaction.reply({ content: t(locale, 'spamCatcher.timeoutNoLongerPending'), flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }

    await interaction.update(buildRemoveTimeoutConfirmationComponents(event, interaction.user.id, locale)).catch(async () => {
      await interaction.reply({ content: t(locale, 'spamCatcher.confirmationFailed'), flags: MessageFlags.Ephemeral }).catch(() => null);
    });
  }

  async function handleCancelRemoveTimeout(interaction) {
    const locale = await getGuildLocale(configStore, interaction.guildId);
    if (!await requireAdmin(interaction, 'spamCatcher.adminCancelTimeout', locale)) return;

    const event = await getInteractionEvent(interaction);
    if (!event) {
      await interaction.reply({ content: t(locale, 'spamCatcher.eventNotFound'), flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }

    await interaction.update(buildReviewComponents(event, locale)).catch(async () => {
      await interaction.reply({ content: t(locale, 'spamCatcher.restoreFailed'), flags: MessageFlags.Ephemeral }).catch(() => null);
    });
  }

  async function handleConfirmRemoveTimeout(interaction) {
    const locale = await getGuildLocale(configStore, interaction.guildId);
    if (!await requireAdmin(interaction, 'spamCatcher.adminRemoveTimeout', locale)) return;

    const event = await getInteractionEvent(interaction);
    if (!event) {
      await interaction.reply({ content: t(locale, 'spamCatcher.eventNotFound'), flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }

    if (!canReviewTimeout(event)) {
      await interaction.update(buildReviewComponents(event, locale)).catch(async () => {
        await interaction.reply({ content: t(locale, 'spamCatcher.timeoutNoLongerPending'), flags: MessageFlags.Ephemeral }).catch(() => null);
      });
      return;
    }

    const member = interaction.guild
      ? await interaction.guild.members.fetch(event.userId).catch(() => null)
      : null;
    if (!member) {
      const updated = await configStore.updateSpamCatcherEventModerationState(event.id, {
        status: 'member_unavailable',
        timeoutUntil: event.timeoutUntil,
        banAfter: null,
        decidedBy: interaction.user.id,
      }).catch(() => ({
        ...event,
        status: 'member_unavailable',
        decidedBy: interaction.user.id,
      }));
      await interaction.update(buildReviewComponents(updated || event, locale)).catch(async () => {
        await interaction.reply({ content: t(locale, 'spamCatcher.userUnavailable'), flags: MessageFlags.Ephemeral }).catch(() => null);
      });
      await logAction(updated || event, t(locale, 'spamCatcher.memberUnavailableTitle'), [
        t(locale, 'spamCatcher.reason', { reason: t(locale, 'spamCatcher.adminRemoveUnavailableReason') }),
      ]);
      return;
    }

    let timeoutError = null;
    await member.timeout(null, t(locale, 'spamCatcher.appealAcceptedReason', { adminId: interaction.user.id })).catch((error) => {
      console.error('Failed to remove Spam Catcher timeout:', error);
      timeoutError = error;
    });

    if (timeoutError) {
      await interaction.reply({
        content: t(locale, 'spamCatcher.removeTimeoutFailed', { reason: timeoutError.message || timeoutError }),
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return;
    }

    const updated = await configStore.resolveSpamCatcherAppeal(event.id, interaction.user.id).catch(() => event);
    await interaction.update(buildResolvedReviewComponents(updated || event, locale)).catch(async () => {
      await interaction.reply({ content: t(locale, 'spamCatcher.timeoutRemovedUpdateFailed'), flags: MessageFlags.Ephemeral }).catch(() => null);
    });
    await logAction(updated || event, t(locale, 'spamCatcher.timeoutRemovedTitle'), [
      t(locale, 'spamCatcher.removedBy', { adminId: interaction.user.id }),
    ]);
  }

  async function handleBanUser(interaction) {
    const locale = await getGuildLocale(configStore, interaction.guildId);
    if (!await requireAdmin(interaction, 'spamCatcher.adminBanUser', locale)) return;

    const event = await getInteractionEvent(interaction);
    if (!event) {
      await interaction.reply({ content: t(locale, 'spamCatcher.eventNotFound'), flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }
    if (!canReviewTimeout(event)) {
      await interaction.reply({ content: t(locale, 'spamCatcher.adminNoLongerPending'), flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }
    if (!interaction.guild) {
      await interaction.reply({ content: t(locale, 'spamCatcher.guildUnavailable'), flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }

    await interaction.deferUpdate().catch(() => null);
    const updated = await handleImmediateBan(interaction.guild, event, { decidedBy: interaction.user.id });
    await interaction.editReply(buildReviewComponents(updated || event, locale)).catch(() => null);
  }

  async function handleIntegrityCheck(interaction) {
    const customId = typeof interaction.customId === 'string' ? interaction.customId : '';
    const [prefix, customGuildId, customChannelId] = customId.split(':');
    const guildId = customGuildId && customGuildId !== 'unknown' ? customGuildId : interaction.guildId;
    const channelId = customChannelId && customChannelId !== 'unknown' ? customChannelId : interaction.channelId;
    const locale = guildId
      ? await getGuildLocale(configStore, guildId)
      : prefix === INTEGRITY_ID_PREFIX ? 'id' : 'en';
    console.info('Handling Spam Catcher integrity button:', {
      customId: interaction.customId,
      guildId,
      channelId,
      userId: interaction.user?.id,
    });
    const acked = await (typeof interaction.deferUpdate === 'function'
      ? interaction.deferUpdate()
      : interaction.deferReply({ ephemeral: true })
    ).then(() => true).catch((error) => {
      console.error('Failed to acknowledge Spam Catcher integrity button:', error);
      return false;
    });
    if (!acked) return;

    async function followUp(content) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch((error) => {
        console.error('Failed to follow up Spam Catcher integrity button:', error);
      });
    }

    if (!guildId || !channelId) {
      await followUp(t(locale, 'spamCatcher.integrityServerOnly'));
      return;
    }

    const config = await getConfig(guildId).catch(() => null);
    if (!config?.enabled || !config.integrityCheckEnabled || !config.channelIds.includes(channelId)) {
      await followUp(t(locale, 'spamCatcher.integrityDisabled'));
      return;
    }

    const inserted = await configStore
      .recordSpamCatcherIntegrityCheck(guildId, channelId, interaction.user.id, interaction.message?.id || null)
      .catch((error) => {
        console.error('Failed to record Spam Catcher integrity check:', error);
        return null;
      });

    if (inserted === null) {
      await followUp(t(locale, 'spamCatcher.integrityFailed'));
      return;
    }

    await followUp(
      inserted
        ? t(locale, 'spamCatcher.integritySuccess')
        : t(locale, 'spamCatcher.integrityDuplicate')
    );

    if (inserted && interaction.guild) {
      await refreshTrapNoticeForChannel(interaction.guild, config, guildId, channelId).catch((error) => {
        console.error('Failed to refresh Spam Catcher integrity count:', error);
      });
    }
  }

  async function handleInteraction(interaction) {
    const customId = typeof interaction.customId === 'string' ? interaction.customId : '';
    if (
      customId.startsWith(INTEGRITY_ID_PREFIX) ||
      customId.startsWith(INTEGRITY_EN_PREFIX)
    ) {
      await handleIntegrityCheck(interaction);
      return true;
    }
    if (interaction.isButton() && interaction.customId.startsWith(`${APPEAL_PREFIX}:`)) {
      await handleAppealButton(interaction);
      return true;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith(`${APPEAL_MODAL_PREFIX}:`)) {
      await handleAppealModal(interaction);
      return true;
    }
    if (interaction.isButton() && interaction.customId.startsWith(`${BAN_USER_PREFIX}:`)) {
      await handleBanUser(interaction);
      return true;
    }
    if (interaction.isButton() && interaction.customId.startsWith(`${REMOVE_TIMEOUT_CONFIRM_PREFIX}:`)) {
      await handleConfirmRemoveTimeout(interaction);
      return true;
    }
    if (interaction.isButton() && interaction.customId.startsWith(`${REMOVE_TIMEOUT_CANCEL_PREFIX}:`)) {
      await handleCancelRemoveTimeout(interaction);
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
