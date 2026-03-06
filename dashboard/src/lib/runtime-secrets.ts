import { getSetupSecretPayload } from "@/lib/db";
import { decryptSetupValue } from "@/lib/setup-crypto";

export async function getDashboardBotToken() {
  const envToken = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
  if (envToken) return envToken;

  const secrets = await getSetupSecretPayload();
  if (secrets.botToken && secrets.botToken.trim()) {
    return secrets.botToken.trim();
  }

  if (secrets.botTokenEncrypted) {
    try {
      return decryptSetupValue(secrets.botTokenEncrypted);
    } catch {
      return null;
    }
  }

  return null;
}
