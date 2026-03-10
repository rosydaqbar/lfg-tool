import { getSetupState } from "@/lib/db";
import { getSafeServerSession } from "@/lib/safe-session";

export async function requireSetupSession() {
  const session = await getSafeServerSession();
  if (!session?.user?.id) {
    return null;
  }

  const setup = await getSetupState();
  if (setup.ownerDiscordId && setup.ownerDiscordId !== session.user.id) {
    return null;
  }

  return { session, setup };
}
