import "@/lib/env";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSetupState } from "@/lib/db";

export async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  let adminId = process.env.ADMIN_DISCORD_USER_ID;
  if (!adminId) {
    const setup = await getSetupState();
    adminId = setup.ownerDiscordId ?? adminId;
  }
  if (!session || !adminId || session.user?.id !== adminId) {
    return null;
  }
  return session;
}
