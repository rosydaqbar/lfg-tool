import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { getSetupState } from "@/lib/db";
import { SetupBootstrapDiscordApp } from "@/components/setup/setup-bootstrap-discord";
import { SetupWizard } from "@/components/setup/setup-wizard";

export default async function SetupPage() {
  const session = await getServerSession(authOptions);
  const setup = await getSetupState();

  if (setup.setupComplete) {
    redirect("/");
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Step 0 - Discord Login</CardTitle>
          <CardDescription>
            Login is required before the setup wizard can continue.
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
              <Button asChild>
                <Link href="/api/auth/signin/discord">Sign in with Discord</Link>
              </Button>
            ) : (
              <span>Configure Discord app credentials first.</span>
            )
          )}
        </CardContent>
      </Card>

      {!session?.user?.id ? (
        <Card>
          <CardHeader>
            <CardTitle>Setup Wizard</CardTitle>
            <CardDescription>
              {setup.discordClientId && setup.discordClientSecretSet
                ? "Sign in with Discord to begin first-time setup."
                : "Provide Discord Client ID and Client Secret first to enable OAuth login."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {setup.discordClientId && setup.discordClientSecretSet ? (
              <Button asChild>
                <Link href="/api/auth/signin/discord">Sign in with Discord</Link>
              </Button>
            ) : (
              <SetupBootstrapDiscordApp />
            )}
          </CardContent>
        </Card>
      ) : (
        <SetupWizard currentUserId={session.user.id} />
      )}
    </div>
  );
}
