const util = require('node:util');

function createErrorLogReporter({ client, getLogChannel, configStore, env = {} }) {
  const DEDUPE_MS = 60 * 1000;
  const DESTINATION_CACHE_TTL_MS = 60 * 1000;
  const MAX_CONTENT_LENGTH = 1900;
  const MAX_PENDING_REPORTS = 25;

  const originalConsoleError = console.error.bind(console);
  const recentReports = new Map();
  const pendingReports = [];
  const guildDestinationCache = new Map();
  let globalDestinationCache = { expiresAt: 0, channelIds: [] };
  let bridgeInstalled = false;
  let reporting = false;

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function redact(value) {
    let output = String(value || '');
    const secrets = [
      env.DISCORD_TOKEN,
      env.DATABASE_URL,
      process.env.DISCORD_TOKEN,
      process.env.DATABASE_URL,
      process.env.DISCORD_CLIENT_SECRET,
      process.env.NEXTAUTH_SECRET,
      process.env.SETUP_ENCRYPTION_KEY,
    ].filter((secret) => typeof secret === 'string' && secret.length >= 8);

    for (const secret of secrets) {
      output = output.replace(new RegExp(escapeRegExp(secret), 'g'), '[redacted]');
    }
    return output;
  }

  function inspectValue(value, depth = 3) {
    return util.inspect(value, {
      breakLength: 120,
      depth,
      maxArrayLength: 20,
      maxStringLength: 1000,
    });
  }

  function formatError(error) {
    if (!error || typeof error !== 'object') {
      return String(error);
    }

    const lines = [
      error.stack || `${error.name || 'Error'}: ${error.message || inspectValue(error)}`,
    ];
    const metadata = {};
    for (const key of ['code', 'status', 'method', 'url']) {
      if (error[key] !== undefined) {
        metadata[key] = error[key];
      }
    }
    if (error.rawError) {
      metadata.rawError = error.rawError;
    }
    if (Object.keys(metadata).length > 0) {
      lines.push(inspectValue(metadata, 4));
    }

    return lines.join('\n');
  }

  function formatArg(arg) {
    if (arg instanceof Error) {
      return formatError(arg);
    }
    if (arg && typeof arg === 'object' && (arg.stack || arg.message)) {
      return formatError(arg);
    }
    if (typeof arg === 'string') {
      return arg;
    }
    return inspectValue(arg);
  }

  function formatDetailValue(value) {
    if (value === undefined || value === null || value === '') return '-';
    return String(value).replace(/`/g, "'");
  }

  function normalizeDetails(details) {
    if (!details || typeof details !== 'object') return [];
    return Object.entries(details)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `- ${key}: \`${formatDetailValue(value)}\``);
  }

  function truncate(value, maxLength) {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, Math.max(0, maxLength - 18))}\n... [truncated]`;
  }

  function buildContent({ title = 'Bot Error', args = [], guildId, details }) {
    const timestamp = Math.floor(Date.now() / 1000);
    const headerLines = [
      `### ${title}`,
      `- Time: <t:${timestamp}:F>`,
    ];
    if (guildId) {
      headerLines.push(`- Guild: \`${guildId}\``);
    }
    headerLines.push(...normalizeDetails(details));

    const header = headerLines.join('\n');
    const rawBody = args.map(formatArg).join('\n');
    const body = redact(rawBody || 'No error details provided.').replace(/```/g, "'''");
    const codeFenceOverhead = '\n```text\n\n```'.length;
    const maxBodyLength = Math.max(200, MAX_CONTENT_LENGTH - header.length - codeFenceOverhead);

    return `${header}\n\`\`\`text\n${truncate(body, maxBodyLength)}\n\`\`\``;
  }

  function buildSignature({ title = 'Bot Error', args = [], guildId, details }) {
    const formattedArgs = args.map((arg) => {
      if (arg instanceof Error || (arg && typeof arg === 'object' && (arg.stack || arg.message))) {
        return `${arg.name || 'Error'}:${arg.message || ''}:${arg.code || ''}:${String(arg.stack || '').split('\n')[1] || ''}`;
      }
      return formatArg(arg);
    });
    return truncate(
      redact([title, guildId || '', inspectValue(details || {}, 1), ...formattedArgs].join('|')),
      800
    );
  }

  function shouldReport(signature) {
    const now = Date.now();
    for (const [key, timestamp] of recentReports.entries()) {
      if (now - timestamp > DEDUPE_MS * 4) {
        recentReports.delete(key);
      }
    }

    const recentAt = recentReports.get(signature) || 0;
    if (now - recentAt < DEDUPE_MS) {
      return false;
    }
    recentReports.set(signature, now);
    return true;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  async function getGuildDestinationIds(guildId) {
    if (!guildId) return [];
    const now = Date.now();
    const cached = guildDestinationCache.get(guildId);
    if (cached && cached.expiresAt > now) {
      return cached.channelIds;
    }

    const config = await configStore.getGuildConfig(guildId).catch((error) => {
      originalConsoleError('Failed to resolve guild log channel for error report:', error);
      return null;
    });
    const channelIds = unique([config?.logChannelId, env.LOG_CHANNEL_ID]);
    guildDestinationCache.set(guildId, {
      channelIds,
      expiresAt: now + DESTINATION_CACHE_TTL_MS,
    });
    return channelIds;
  }

  async function getGlobalDestinationIds() {
    if (env.LOG_CHANNEL_ID) {
      return [env.LOG_CHANNEL_ID];
    }

    const now = Date.now();
    if (globalDestinationCache.expiresAt > now) {
      return globalDestinationCache.channelIds;
    }

    const channelIds = [];
    for (const guild of client.guilds.cache.values()) {
      const config = await configStore.getGuildConfig(guild.id).catch((error) => {
        originalConsoleError('Failed to resolve dashboard log channel for error report:', error);
        return null;
      });
      if (config?.logChannelId) {
        channelIds.push(config.logChannelId);
      }
    }

    globalDestinationCache = {
      channelIds: unique(channelIds),
      expiresAt: now + DESTINATION_CACHE_TTL_MS,
    };
    return globalDestinationCache.channelIds;
  }

  async function getDestinationIds(guildId) {
    if (guildId) {
      const guildIds = await getGuildDestinationIds(guildId);
      if (guildIds.length > 0) return guildIds;
    }
    return getGlobalDestinationIds();
  }

  async function sendReport(payload) {
    if (!client.isReady()) {
      if (pendingReports.length >= MAX_PENDING_REPORTS) {
        pendingReports.shift();
      }
      pendingReports.push(payload);
      return;
    }

    const signature = buildSignature(payload);
    if (!shouldReport(signature)) return;

    reporting = true;
    try {
      const channelIds = await getDestinationIds(payload.guildId);
      if (channelIds.length === 0) return;

      const content = buildContent(payload);
      for (const channelId of channelIds) {
        const logChannel = await getLogChannel(channelId).catch((error) => {
          originalConsoleError('Failed to fetch error log channel:', error);
          return null;
        });
        if (!logChannel || !logChannel.isTextBased()) continue;

        await logChannel.send({
          content,
          allowedMentions: { parse: [] },
        }).catch((error) => {
          originalConsoleError('Failed to send error report to log channel:', error);
        });
      }
    } finally {
      reporting = false;
    }
  }

  async function reportError(payload) {
    const args = payload?.args || (payload?.error ? [payload.error] : []);
    await sendReport({
      ...payload,
      args,
    });
  }

  async function flushPending() {
    if (!client.isReady() || pendingReports.length === 0) return;
    const reports = pendingReports.splice(0, pendingReports.length);
    for (const report of reports) {
      await sendReport(report);
    }
  }

  function installConsoleErrorBridge() {
    if (bridgeInstalled) return;
    bridgeInstalled = true;

    console.error = (...args) => {
      originalConsoleError(...args);
      if (reporting) return;
      reportError({ title: 'Bot Error', args }).catch((error) => {
        originalConsoleError('Failed to queue error report:', error);
      });
    };
  }

  return {
    flushPending,
    installConsoleErrorBridge,
    reportError,
  };
}

module.exports = { createErrorLogReporter };
