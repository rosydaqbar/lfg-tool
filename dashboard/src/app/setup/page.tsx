import Link from "next/link";
import { Bot, CheckCircle2, Database, LogIn, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSetupState, resetSetupDraft, type SetupState } from "@/lib/db";
import { SetupBootstrapDiscordApp } from "@/components/setup/setup-bootstrap-discord";
import { SetupResetDiscordButton } from "@/components/setup/setup-reset-discord";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { getSafeServerSession } from "@/lib/safe-session";

function hasIncompleteSetupDraft(setup: SetupState) {
  if (setup.setupComplete) return false;
  return Boolean(
    setup.ownerDiscordId ||
      setup.selectedGuildId ||
      setup.logChannelId ||
      setup.lfgChannelId ||
      setup.databaseValidatedAt ||
      setup.databaseUrlSet ||
      setup.botTokenSet ||
      setup.setupAbandonedAt
  );
}

const onboardingSteps: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: ShieldCheck,
    title: "Connect Discord",
    description: "Create the OAuth bridge, sign in, and claim the owner account for setup.",
  },
  {
    icon: Database,
    title: "Validate Supabase",
    description: "Save the database URL and apply the schema the bot and dashboard share.",
  },
  {
    icon: Bot,
    title: "Launch the bot",
    description: "Invite the bot, pick your channels, and turn on LFG automation.",
  },
];

function SetupOnboardingPage({
  setup,
  forceConfigureDiscord,
  isSetupLocked,
}: {
  setup: SetupState;
  forceConfigureDiscord: boolean;
  isSetupLocked: boolean;
}) {
  const discordCredentialsReady = Boolean(
    setup.discordClientId && setup.discordClientSecretSet
  );
  const showCredentialForm = forceConfigureDiscord || (!isSetupLocked && !discordCredentialsReady);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center px-6 py-10 lg:py-16">
      <Card className="w-full overflow-hidden border-border/80 bg-card/80 shadow-2xl shadow-cyan-950/10">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative overflow-hidden p-8 sm:p-10 lg:p-12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.16),transparent_34%)]" />
            <div className="relative space-y-8">
              <Badge variant="outline" className="border-cyan-400/40 bg-cyan-400/10 text-cyan-700 dark:text-cyan-100">
                <Sparkles className="h-3.5 w-3.5" />
                {isSetupLocked ? "Dashboard ready" : "First-time onboarding"}
              </Badge>

              <div className="max-w-2xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  {isSetupLocked ? "Welcome back to your Discord LFG dashboard" : "Welcome to your Discord LFG control center"}
                </h1>
                <p className="text-base leading-7 text-muted-foreground sm:text-lg">
                  {isSetupLocked
                    ? "Your server setup is complete. Sign in with the owner account to manage the dashboard."
                    : "Set up the dashboard in a few guided steps. Start by enabling Discord login, then connect your database and server channels."}
                </p>
              </div>

              <div className="space-y-3">
                {onboardingSteps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.title} className="flex gap-4 rounded-2xl border border-border/70 bg-background/40 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">
                          {index + 1}. {step.title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="border-t border-border bg-background/55 p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
            {showCredentialForm ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Badge variant="secondary" className="w-fit">
                    Discord OAuth
                  </Badge>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                      {forceConfigureDiscord ? "Update login credentials" : "Create the login bridge"}
                    </h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Paste your Discord application Client ID and Client Secret. This enables the sign-in button and lets the setup owner continue securely.
                    </p>
                  </div>
                </div>

                {isSetupLocked && forceConfigureDiscord ? (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                    OAuth recovery mode is active. Update the Discord Client ID/Secret, then sign in again.
                  </div>
                ) : null}

                <SetupBootstrapDiscordApp />

                {discordCredentialsReady ? (
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <p className="text-sm font-medium text-foreground">Already have saved credentials?</p>
                    <div className="mt-3">
                      <SetupResetDiscordButton endpoint="/api/setup/bootstrap-discord-app" />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : isSetupLocked ? (
              <div className="flex h-full flex-col justify-center space-y-6">
                <Badge variant="outline" className="w-fit border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Setup complete
                </Badge>
                <div className="space-y-3">
                  <h2 className="text-3xl font-semibold tracking-tight text-foreground">Your dashboard is already configured.</h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Sign in with the owner account to open the dashboard or reset setup from dashboard settings.
                  </p>
                </div>
                <Button asChild size="lg" className="w-full sm:w-fit">
                  <Link href="/api/auth/signin/discord">
                    <LogIn className="h-4 w-4" />
                    Sign in with Discord
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="flex h-full flex-col justify-center space-y-6">
                <Badge variant="outline" className="w-fit border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Discord login ready
                </Badge>
                <div className="space-y-3">
                  <h2 className="text-3xl font-semibold tracking-tight text-foreground">Continue with Discord</h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    OAuth credentials are saved. Sign in to claim the setup owner account and continue the guided setup wizard.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm">
                  <p className="font-medium text-foreground">Saved Client ID</p>
                  <p className="mt-1 break-all text-muted-foreground">{setup.discordClientId}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg" className="sm:flex-1">
                    <Link href="/api/auth/signin/discord">
                      <LogIn className="h-4 w-4" />
                      Sign in with Discord
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link href="/setup?configureDiscord=1">Use different credentials</Link>
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </Card>
    </main>
  );
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ configureDiscord?: string }>;
}) {
  const params = await searchParams;
  const session = await getSafeServerSession();
  let setup = await getSetupState();
  if (session?.user?.id && hasIncompleteSetupDraft(setup)) {
    await resetSetupDraft();
    setup = await getSetupState();
  }
  const forceConfigureDiscord = params.configureDiscord === "1";
  const isSetupLocked = setup.setupComplete;

  if (!session?.user?.id) {
    return (
      <SetupOnboardingPage
        setup={setup}
        forceConfigureDiscord={forceConfigureDiscord}
        isSetupLocked={isSetupLocked}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      {isSetupLocked ? (
        <Card>
          <CardHeader>
            <CardTitle>Setup Completed</CardTitle>
            <CardDescription>
              Setup is already finished and this page is read-only. To reset setup, open dashboard settings and use Reset Setting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/">Open Dashboard</Link>
            </Button>
            <Button asChild variant="outline" className="ml-2">
              <Link href="/api/auth/signout">Switch account</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <SetupWizard currentUserId={session.user.id} />
      )}
    </div>
  );
}
