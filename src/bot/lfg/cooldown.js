const { LFG_COOLDOWN_MS } = require('./constants');
const { t } = require('../../i18n');

function createCooldownTracker() {
  const lfgCooldowns = new Map();

  function getCooldownKey(guildId, userId) {
    return `${guildId}:${userId}`;
  }

  function getCooldownRemainingMs(guildId, userId) {
    const key = getCooldownKey(guildId, userId);
    const lastSent = lfgCooldowns.get(key);
    if (!lastSent) return 0;
    const elapsed = Date.now() - lastSent;
    return elapsed < LFG_COOLDOWN_MS ? LFG_COOLDOWN_MS - elapsed : 0;
  }

  function setCooldown(guildId, userId) {
    const key = getCooldownKey(guildId, userId);
    lfgCooldowns.set(key, Date.now());
  }

  function formatCooldown(ms, locale = 'en') {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes <= 0) return t(locale, 'common.durationSeconds', { seconds });
    return t(locale, 'common.durationMinutesSeconds', { minutes, seconds });
  }

  return {
    formatCooldown,
    getCooldownRemainingMs,
    setCooldown,
  };
}

module.exports = { createCooldownTracker };
