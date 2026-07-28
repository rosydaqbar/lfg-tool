const en = require('./locales/en');
const id = require('./locales/id');

const dictionaries = { en, id };
const localeCache = new Map();
const LOCALE_CACHE_TTL_MS = 5000;

function normalizeLocale(value) {
  return value === 'id' ? 'id' : 'en';
}

function resolveKey(dictionary, key) {
  return key.split('.').reduce((value, part) => value?.[part], dictionary);
}

function interpolate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

function t(locale, key, vars = {}) {
  const safeLocale = normalizeLocale(locale);
  const value = resolveKey(dictionaries[safeLocale], key) ?? resolveKey(en, key);
  if (typeof value !== 'string') {
    console.warn(`Missing i18n key: ${key}`);
    return key;
  }
  return interpolate(value, vars);
}

async function getGuildLocale(configStore, guildId) {
  if (!guildId) return 'en';
  const cached = localeCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached.locale;
  const config = await configStore.getGuildConfig(guildId).catch(() => null);
  const locale = normalizeLocale(config?.locale);
  localeCache.set(guildId, { locale, expiresAt: Date.now() + LOCALE_CACHE_TTL_MS });
  return locale;
}

function clearGuildLocaleCache(guildId) {
  if (guildId) localeCache.delete(guildId);
  else localeCache.clear();
}

module.exports = {
  clearGuildLocaleCache,
  getGuildLocale,
  interpolate,
  normalizeLocale,
  t,
};
