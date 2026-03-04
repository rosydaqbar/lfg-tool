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
];

const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}
