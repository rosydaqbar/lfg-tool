import "@/lib/env";
import { getSetupState } from "@/lib/db";
import { getSafeServerSession } from "@/lib/safe-session";

export async function requireAdminSession() {
  const session = await getSafeServerSession();
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
