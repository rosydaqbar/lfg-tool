import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { getSetupState } from "@/lib/db";
import { SetupWizard } from "@/components/setup/setup-wizard";

export default async function SetupPage() {
  const session = await getServerSession(authOptions);
  const setup = await getSetupState();

  if (setup.setupComplete) {
    redirect("/");
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      {!session?.user?.id ? (
        <Card>
          <CardHeader>
            <CardTitle>Setup Wizard</CardTitle>
            <CardDescription>Sign in with Discord to begin first-time setup.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/api/auth/signin/discord">Sign in with Discord</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <SetupWizard currentUserId={session.user.id} />
      )}
    </div>
  );
}
