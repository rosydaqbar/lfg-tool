import "@/lib/env";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  const adminId = process.env.ADMIN_DISCORD_USER_ID;
  if (!session || !adminId || session.user?.id !== adminId) {
    return null;
  }
  return session;
}
