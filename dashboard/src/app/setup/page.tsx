import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSetupState, resetSetupDraft, type SetupState } from "@/lib/db";
import { SetupBootstrapDiscordApp } from "@/components/setup/setup-bootstrap-discord";
import { SetupResetDiscordButton } from "@/components/setup/setup-reset-discord";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { ResetSettingsSection } from "@/components/dashboard/reset-settings-section";
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
  const showLoginGateCard = !session?.user?.id || isSetupLocked;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      {showLoginGateCard ? (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{isSetupLocked ? "Setup Status" : "Step 0 - Discord Login"}</CardTitle>
          <CardDescription>
            {isSetupLocked
              ? "Setup is already completed. This page is read-only. Sign in to reset setup from dashboard settings."
              : "Login is required before the setup wizard can continue."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {session?.user?.id ? (
            <>
              <span>
                Signed in as <strong>{session.user.name ?? session.user.id}</strong>
              </span>
              <Button asChild variant="outline" size="sm">
                <Link href="/api/auth/signout">Switch account</Link>
              </Button>
            </>
          ) : (
            setup.discordClientId && setup.discordClientSecretSet ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild>
                  <Link href="/api/auth/signin/discord">Sign in with Discord</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/setup?configureDiscord=1">Use different Client ID/Secret</Link>
                </Button>
              </div>
            ) : (
              <span>Configure Discord app credentials first.</span>
            )
          )}
        </CardContent>
      </Card>
      ) : null}

      {!session?.user?.id ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{isSetupLocked ? "Setup Locked" : "Setup Wizard"}</CardTitle>
              <CardDescription>
                {isSetupLocked
                  ? "Setup has already been completed. Sign in and use Reset Setting in dashboard settings if you need to run setup again."
                  : setup.discordClientId && setup.discordClientSecretSet && !forceConfigureDiscord
                  ? "Sign in with Discord to begin first-time setup."
                  : "Provide Discord Client ID and Client Secret first to enable OAuth login."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isSetupLocked && forceConfigureDiscord ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
                    OAuth recovery mode: update Discord Client ID/Secret, then sign in again.
                  </div>
                  <SetupBootstrapDiscordApp />
                </div>
              ) : isSetupLocked ? (
                <Button asChild>
                  <Link href="/api/auth/signin/discord">Sign in with Discord</Link>
                </Button>
              ) : setup.discordClientId && setup.discordClientSecretSet && !forceConfigureDiscord ? (
                <Button asChild>
                  <Link href="/api/auth/signin/discord">Sign in with Discord</Link>
                </Button>
              ) : (
                <div className="space-y-4">
                  <SetupBootstrapDiscordApp />
                  {setup.discordClientId && setup.discordClientSecretSet ? (
                    <SetupResetDiscordButton endpoint="/api/setup/bootstrap-discord-app" />
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          {isSetupLocked ? (
            <ResetSettingsSection selectedGuildId={setup.selectedGuildId ?? ""} afterResetHref="/setup" />
          ) : null}
        </div>
      ) : isSetupLocked ? (
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
          </CardContent>
        </Card>
      ) : (
        <SetupWizard currentUserId={session.user.id} />
      )}
    </div>
  );
}
