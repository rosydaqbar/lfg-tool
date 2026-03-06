import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import DashboardClient from "@/components/dashboard-client";
import { getSetupState } from "@/lib/db";
import { getSafeServerSession } from "@/lib/safe-session";

export default async function Home() {
  const setup = await getSetupState();
  const session = await getSafeServerSession();

  const hasDiscordOAuthBootstrap =
    Boolean(setup.discordClientId) && Boolean(setup.discordClientSecretSet);

  const shouldShowSetupCta = !setup.setupComplete && !hasDiscordOAuthBootstrap;

  if (session) {
    if (!setup.setupComplete) {
      redirect("/setup");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-[-10%] h-[420px] w-[420px] rounded-full bg-[rgba(20,125,140,0.2)] blur-[140px]" />
        <div className="absolute top-12 right-[-6%] h-[360px] w-[360px] rounded-full bg-[rgba(242,190,120,0.3)] blur-[140px]" />
        <div className="absolute bottom-[-18%] left-[25%] h-[420px] w-[420px] rounded-full bg-[rgba(12,74,110,0.12)] blur-[160px]" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-16">
        {!session ? (
          <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
              <Badge variant="secondary" className="rounded-full px-4 py-1">
                Admin-only access
              </Badge>
              <h1 className="font-[var(--font-display)] text-4xl leading-tight text-foreground md:text-5xl">
                Voice Log Control Room
              </h1>
              <p className="text-lg text-muted-foreground">
                Manage which voice channels trigger log messages and choose the
                text channel where events appear.
              </p>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span className="rounded-full border border-border bg-card px-3 py-1">
                  Discord OAuth
                </span>
                <span className="rounded-full border border-border bg-card px-3 py-1">
                  SQLite config
                </span>
                <span className="rounded-full border border-border bg-card px-3 py-1">
                  Bot-safe updates
                </span>
              </div>
            </div>

            <Card className="border-border/70 bg-card/80 shadow-xl shadow-black/5 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-150">
              <CardHeader>
                <CardTitle className="text-2xl">Sign in to continue</CardTitle>
                <CardDescription>
                  {setup.setupComplete || hasDiscordOAuthBootstrap
                    ? "Authenticate with Discord to load your guilds and configure logging."
                    : "Start the setup wizard to configure Discord app credentials, bot token, guild, database, and channels."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Button asChild className="w-full">
                    <Link href={setup.setupComplete || hasDiscordOAuthBootstrap ? "/api/auth/signin/discord" : "/setup"}>
                      {setup.setupComplete || hasDiscordOAuthBootstrap ? "Sign in with Discord" : "Setup Discord bot"}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/setup">Open Setup</Link>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {setup.setupComplete || hasDiscordOAuthBootstrap
                    ? "Only the admin Discord user is allowed to access the dashboard."
                    : "First-run setup required before dashboard access."}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <DashboardClient
            userName={session.user?.name ?? "Admin"}
            selectedGuildId={setup.selectedGuildId ?? ""}
          />
        )}
      </main>
    </div>
  );
}
