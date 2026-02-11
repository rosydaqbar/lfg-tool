import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const rootEnvPath = path.resolve(process.cwd(), "..", ".env");

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
