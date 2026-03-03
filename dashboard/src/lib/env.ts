import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const rootEnvPath = path.resolve(process.cwd(), "..", ".env");

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

const requiredEnv = [
  "DATABASE_URL",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "NEXTAUTH_SECRET",
  "ADMIN_DISCORD_USER_ID",
];

const missing = requiredEnv.filter((key) => !process.env[key]);
const hasBotToken = Boolean(process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN);
if (!hasBotToken) {
  missing.push("DISCORD_TOKEN or DISCORD_BOT_TOKEN");
}

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}
