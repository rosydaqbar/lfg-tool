function decodeBase64(value: string) {
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function normalize(value: unknown, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return `${value}`.trim().toLowerCase();
}

function isDisabled(value: unknown) {
  return ["disable", "off", "false", "0", "no"].includes(normalize(value));
}

function isEnabled(value: unknown, defaultValue = true) {
  const normalized = normalize(value);
  if (!normalized) return defaultValue;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function buildPgSslConfig() {
  const mode = process.env.PG_SSL_MODE || process.env.PGSSLMODE || "require";
  if (isDisabled(mode)) {
    return false;
  }

  const rejectUnauthorized = isEnabled(
    process.env.PG_SSL_REJECT_UNAUTHORIZED ??
      process.env.PGSSLREJECTUNAUTHORIZED ??
      process.env.NODE_TLS_REJECT_UNAUTHORIZED,
    true
  );

  const ca = process.env.PG_SSL_CA || null;
  const caBase64 = process.env.PG_SSL_CA_BASE64 || null;
  const caDecoded = caBase64 ? decodeBase64(caBase64) : null;

  const ssl: { rejectUnauthorized: boolean; ca?: string } = { rejectUnauthorized };
  if (ca) {
    ssl.ca = ca;
  } else if (caDecoded) {
    ssl.ca = caDecoded;
  }
  return ssl;
}
