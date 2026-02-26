import Link from "next/link";
import { getServerSession } from "next-auth";
import { Button } from "@/components/ui/button";
import { authOptions } from "@/lib/auth";
import { VoiceLogPageClient } from "@/components/dashboard/voice-log-page-client";

const GUILD_ID = "670147766839803924";

export default async function VoiceLogPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6 py-16">
        <div className="space-y-4 text-center">
          <h1 className="font-[var(--font-display)] text-3xl text-foreground">
            Voice Log
          </h1>
          <p className="text-sm text-muted-foreground">
            Kamu harus login untuk melihat halaman ini.
          </p>
          <Button asChild>
            <Link href="/api/auth/signin/discord">Sign in with Discord</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-16">
      <VoiceLogPageClient selectedGuildId={GUILD_ID} />
    </div>
  );
}
