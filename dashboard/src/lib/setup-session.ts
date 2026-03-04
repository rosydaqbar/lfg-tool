import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSetupState } from "@/lib/db";

export async function requireSetupSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return null;
  }

  const setup = await getSetupState();
  if (setup.ownerDiscordId && setup.ownerDiscordId !== session.user.id) {
    return null;
  }

  return { session, setup };
}
