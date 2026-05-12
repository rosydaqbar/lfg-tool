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
import { dashboardCard } from "@/components/ui/patterns";
import { getSetupState } from "@/lib/db";
import { getSafeServerSession } from "@/lib/safe-session";

export default async function Home() {
  const setup = await getSetupState();
  const session = await getSafeServerSession();

  const hasDiscordOAuthBootstrap =
    Boolean(setup.discordClientId) && Boolean(setup.discordClientSecretSet);
  const requiresSetup = !setup.setupComplete;

  const shouldShowSetupCta = !setup.setupComplete && !hasDiscordOAuthBootstrap;
  if (session) {
    if (!setup.setupComplete) {
      redirect("/setup");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-16">
        {!session ? (
          <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
              <Badge variant="secondary" className="rounded-full px-4 py-1">
                Discord server admin access
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
                  Supabase config
                </span>
                <span className="rounded-full border border-border bg-card px-3 py-1">
                  Bot-safe updates
                </span>
              </div>
            </div>

            <Card className={`${dashboardCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-150`}>
              <CardHeader>
                <CardTitle className="text-2xl">
                  {requiresSetup ? "Setup required" : "Sign in to continue"}
                </CardTitle>
                <CardDescription>
                  {requiresSetup
                    ? "Finish setup first to configure Discord app credentials, bot token, guild, database, and channels."
                    : setup.setupComplete || hasDiscordOAuthBootstrap
                    ? "Authenticate with Discord to load your guilds and configure logging."
                    : "Start the setup wizard to configure Discord app credentials, bot token, guild, database, and channels."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  {requiresSetup ? (
                    <Button asChild className="w-full">
                      <Link href="/setup">Open setup wizard</Link>
                    </Button>
                  ) : (
                    <>
                      <Button asChild className="w-full">
                        <Link href="/api/auth/signin/discord">Sign in with Discord</Link>
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {requiresSetup
                    ? "First-run setup required before dashboard access."
                    : setup.setupComplete || hasDiscordOAuthBootstrap
                    ? "Discord server owners and admins can sign in to manage servers where the bot is installed."
                    : "First-run setup required before dashboard access."}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <DashboardClient
            userName={session.user?.name ?? "Admin"}
          />
        )}
      </main>
    </div>
  );
}
