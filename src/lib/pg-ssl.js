function decodeBase64(value) {
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function buildPgSslConfig() {
  const mode = (process.env.PG_SSL_MODE || 'require').toLowerCase();
  if (mode === 'disable' || mode === 'off' || mode === 'false') {
    return false;
  }

  const rejectUnauthorized =
    (process.env.PG_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';

  const ca = process.env.PG_SSL_CA || null;
  const caBase64 = process.env.PG_SSL_CA_BASE64 || null;
  const caDecoded = caBase64 ? decodeBase64(caBase64) : null;

  const ssl = { rejectUnauthorized };
  if (ca) {
    ssl.ca = ca;
  } else if (caDecoded) {
    ssl.ca = caDecoded;
  }
  return ssl;
}

module.exports = { buildPgSslConfig };
