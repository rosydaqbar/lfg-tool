import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getSecret() {
  const secret = process.env.SETUP_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Missing SETUP_SECRET or NEXTAUTH_SECRET for setup encryption.");
  }
  return secret;
}

function deriveKey(secret: string) {
  return crypto.scryptSync(secret, "setup-wizard-salt", 32);
}

export function encryptSetupValue(plainText: string) {
  const iv = crypto.randomBytes(12);
  const key = deriveKey(getSecret());
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSetupValue(encoded: string) {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const key = deriveKey(getSecret());
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
