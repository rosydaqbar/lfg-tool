"use client";

import { memo, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ResetSettingsSectionProps = {
  selectedGuildId: string;
  onResetComplete?: () => void;
  afterResetHref?: string;
};

type BotStatusResponse = {
  online: boolean;
  healthUrl: string;
  checkedAt: string;
  payload?: {
    status?: string;
    uptimeSeconds?: number;
    timestamp?: string;
  } | null;
  error?: string;
};

function CommandBlock({ children }: { children: string }) {
  return (
    <div className="mt-3 whitespace-pre-wrap rounded-xl border border-border/70 bg-gradient-to-b from-muted to-background px-3 py-2 font-mono text-xs text-foreground shadow-sm">
      {children}
    </div>
  );
}

function StepCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[2rem_1fr] gap-3 px-4 py-4 transition-colors hover:bg-muted/20">
      <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
          {step}
      </span>
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground tracking-tight">{title}</p>
        <div className="space-y-2 text-sm leading-6 text-muted-foreground [&_p]:leading-6 [&_strong]:text-foreground [&_code]:rounded [&_code]:border [&_code]:border-border/70 [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-foreground [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_ol>li]:marker:font-semibold [&_ol>li]:marker:text-primary [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul>li]:marker:text-primary/80">
          {children}
        </div>
      </div>
    </div>
  );
}

function ResetSettingsSectionComponent({
  selectedGuildId,
  onResetComplete,
  afterResetHref,
}: ResetSettingsSectionProps) {
  const [confirmValue, setConfirmValue] = useState("");
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [botStatus, setBotStatus] = useState<BotStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [deployTab, setDeployTab] = useState<"local" | "railway" | "railway-cli">("local");

  const trimmedGuildId = selectedGuildId.trim();
  const isConfirmMatch = confirmValue.trim() === trimmedGuildId;

  useEffect(() => {
    let mounted = true;

    async function loadBotStatus() {
      setStatusLoading(true);
      try {
        const response = await fetch("/api/bot/status", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as BotStatusResponse | null;
        if (!mounted) return;
        setBotStatus(payload);
      } catch {
        if (!mounted) return;
        setBotStatus({
          online: false,
          healthUrl: "http://127.0.0.1:80",
          checkedAt: new Date().toISOString(),
          error: "Unable to check bot status right now.",
        });
      } finally {
        if (mounted) setStatusLoading(false);
      }
    }

    loadBotStatus();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleReset() {
    if (!trimmedGuildId) {
      toast.error("Reset failed", {
        description: "No current setup guild ID found.",
      });
      return;
    }

    if (!isConfirmMatch) {
      toast.error("Reset failed", {
        description: "Guild ID confirmation does not match.",
      });
      return;
    }

    setResetting(true);
    try {
      const response = await fetch("/api/setup/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildIdConfirm: confirmValue.trim() }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to reset setup settings");
      }

      toast.success("Setup reset complete", {
        description: "Configuration has been cleared. Continue setup again.",
      });
      setOpen(false);
      setConfirmValue("");
      if (onResetComplete) {
        onResetComplete();
      } else if (typeof window !== "undefined") {
        window.location.href = afterResetHref || "/setup";
      }
    } catch (error) {
      toast.error("Reset failed", {
        description:
          error instanceof Error
            ? error.message
            : "Unexpected error while resetting settings",
      });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/5">
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">Bot status</CardTitle>
            {statusLoading ? (
              <Badge variant="secondary" className="rounded-full px-3 py-1">Checking...</Badge>
            ) : botStatus?.online ? (
              <Badge className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-emerald-800">
                Online
              </Badge>
            ) : (
              <Badge className="rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1 text-red-800">
                Offline
              </Badge>
            )}
          </div>
          <CardDescription>
            {statusLoading
              ? "Checking if your bot is running..."
              : botStatus?.online
                ? "Good news: your bot is running."
                : "Your bot is offline. Open the Local tab and follow each step exactly. Railway tabs are only for cloud hosting."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            Health endpoint: <code>{botStatus?.healthUrl || "http://127.0.0.1:80"}</code>
          </div>

          {!statusLoading && !botStatus?.online ? (
            <>
              <div className="grid grid-cols-3 gap-2 rounded-full border border-border/60 bg-muted/70 p-1 shadow-inner">
                <Button
                  type="button"
                  variant={deployTab === "local" ? "default" : "ghost"}
                  onClick={() => setDeployTab("local")}
                  className="rounded-full"
                >
                  Local
                </Button>
                <Button
                  type="button"
                  variant={deployTab === "railway" ? "default" : "ghost"}
                  onClick={() => setDeployTab("railway")}
                  className="rounded-full"
                >
                  Railway
                </Button>
                <Button
                  type="button"
                  variant={deployTab === "railway-cli" ? "default" : "ghost"}
                  onClick={() => setDeployTab("railway-cli")}
                  className="rounded-full"
                >
                  Railway CLI
                </Button>
              </div>

              {deployTab === "local" ? (
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 divide-y divide-border/60 shadow-sm">
                  <StepCard step={1} title="Complete setup first">
                    <p>Open <code>/setup</code> and finish every step until Step 8 (Finalize).</p>
                    <p>This creates and saves all required bot settings.</p>
                  </StepCard>
                  <StepCard step={2} title="Open .setup-state.json, validate required values, and fix mismatches">
                    <p>Open file <code>.setup-state.json</code> in project root (<code>lfg-tool</code>).</p>
                    <p>The values below <strong>must match</strong> your setup inputs:</p>
                    <ul>
                      <li><code>setupComplete</code> must be <code>true</code></li>
                      <li><code>selectedGuildId</code> must match the guild you selected in setup</li>
                      <li><code>databaseProvider</code> must match your chosen DB provider in setup</li>
                      <li>at least one bot token key must exist: <code>botToken</code> or <code>botTokenEncrypted</code></li>
                      <li>at least one database URL key must exist: <code>databaseUrl</code> or <code>databaseUrlEncrypted</code></li>
                      <li><code>discordClientId</code> must exist</li>
                      <li>at least one Discord secret key must exist: <code>discordClientSecret</code> or <code>discordClientSecretEncrypted</code></li>
                      <li><code>logChannelId</code> must exist after channel setup</li>
                    </ul>
                    <p>What this file contains:</p>
                    <ul>
                      <li>bot login info</li>
                      <li>database connection info</li>
                      <li>Discord app credentials</li>
                      <li>selected guild/channel settings</li>
                      <li>setup state flags</li>
                    </ul>
                    <p>What to do with this file:</p>
                    <ul>
                      <li>keep it</li>
                      <li>do not share it</li>
                      <li>avoid manual edits unless troubleshooting</li>
                    </ul>
                    <p>Go back to <code>/setup</code>, then re-save the related steps and finalize again:</p>
                    <ul>
                      <li>Bot token issue: re-save Step 3</li>
                      <li>Guild mismatch: re-save Step 4</li>
                      <li>Database mismatch: re-save Step 6</li>
                      <li>Missing channels: re-save Step 7</li>
                      <li>Finish Step 8 (Finalize)</li>
                    </ul>
                  </StepCard>
                  <StepCard step={3} title="Open terminal in correct folder and install dependencies">
                    <p>Open terminal in <code>lfg-tool</code> (same folder as <code>package.json</code>).</p>
                    <p>If terminal is in wrong folder, next commands may fail.</p>
                    Run:
                    <CommandBlock>npm install</CommandBlock>
                    Wait until it fully finishes.
                  </StepCard>
                  <StepCard step={4} title="Start bot and confirm success">
                    Run:
                    <CommandBlock>npm start</CommandBlock>
                    Keep this terminal open. If terminal closes, bot stops.
                    <p>Success requires both:</p>
                    <ol>
                      <li>terminal shows <code>Logged in as ...</code></li>
                      <li>Bot Status here changes to <strong>Online</strong> after refresh</li>
                    </ol>
                  </StepCard>

                  <div className="grid grid-cols-[2rem_1fr] gap-3 px-4 py-4 bg-muted/10">
                    <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                      i
                    </span>
                    <div>
                      <p className="mb-2 text-sm font-semibold text-foreground">Notes</p>
                      <div className="space-y-2 text-sm leading-6 text-muted-foreground [&_code]:rounded [&_code]:border [&_code]:border-border/70 [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-foreground [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_ol>li]:marker:font-semibold [&_ol>li]:marker:text-primary [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul>li]:marker:text-primary/80">
                    <p>Repeat this exact recovery path:</p>
                    <ol>
                      <li>open <code>/setup</code></li>
                      <li>re-save Step 3</li>
                      <li>re-save Step 6</li>
                      <li>finalize Step 8</li>
                      <li>run <code>npm start</code> again</li>
                    </ol>
                    <p>Most common reasons for Offline:</p>
                    <ul>
                      <li>wrong bot token</li>
                      <li>wrong database URL</li>
                      <li>setup not finalized</li>
                    </ul>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {deployTab === "railway" ? (
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 divide-y divide-border/60 shadow-sm">
                  <StepCard step={1} title="Create Railway project">
                    Open Railway and create a new project.
                  </StepCard>
                  <StepCard step={2} title="Connect repository">
                    Connect your GitHub repository so Railway can build and deploy automatically.
                  </StepCard>
                  <StepCard step={3} title="Add required variables in Railway">
                    <p>Open Railway project and then open <strong>Variables</strong>.</p>
                    <p>These values <strong>must exist</strong> and <strong>must match</strong> your setup values:</p>
                    <CommandBlock>DISCORD_TOKEN=your_bot_token
DATABASE_URL=your_database_url
NEXTAUTH_SECRET=your_nextauth_secret</CommandBlock>
                    <p>Meaning:</p>
                    <ul>
                      <li><code>DISCORD_TOKEN</code>: bot login credential</li>
                      <li><code>DATABASE_URL</code>: database connection address</li>
                      <li><code>NEXTAUTH_SECRET</code>: dashboard/session secret</li>
                    </ul>
                    <p>Important: Railway does not read your local <code>.setup-state.json</code>. You must set these variables in Railway.</p>
                  </StepCard>
                  <StepCard step={4} title="Deploy">
                    Trigger deployment and wait for build/start logs to complete.
                  </StepCard>
                  <StepCard step={5} title="Check success">
                    <p>Open Railway logs for successful startup, then refresh dashboard.</p>
                    <p>Bot Status must change to <strong>Online</strong>.</p>
                  </StepCard>
                  <Button asChild>
                    <a href="https://railway.com?referralCode=EGh1Pg" target="_blank" rel="noreferrer">
                      Deploy on Railway
                    </a>
                  </Button>
                </div>
              ) : null}

              {deployTab === "railway-cli" ? (
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 divide-y divide-border/60 shadow-sm">
                  <StepCard step={1} title="Install CLI">
                    Run:
                    <CommandBlock>npm i -g @railway/cli</CommandBlock>
                  </StepCard>
                  <StepCard step={2} title="Login">
                    Run:
                    <CommandBlock>railway login</CommandBlock>
                    Complete login in browser.
                  </StepCard>
                  <StepCard step={3} title="Link folder to Railway project">
                    Run this from <code>lfg-tool</code> folder:
                    <CommandBlock>railway link</CommandBlock>
                  </StepCard>
                  <StepCard step={4} title="Set required variables">
                    These values <strong>must exist</strong> and <strong>must match</strong> setup values:
                    <CommandBlock>railway variable set DISCORD_TOKEN=...</CommandBlock>
                    <CommandBlock>railway variable set DATABASE_URL=...</CommandBlock>
                    <CommandBlock>railway variable set NEXTAUTH_SECRET=...</CommandBlock>
                  </StepCard>
                  <StepCard step={5} title="Deploy">
                    <CommandBlock>railway up</CommandBlock>
                  </StepCard>
                  <StepCard step={6} title="Confirm success">
                    <CommandBlock>railway logs</CommandBlock>
                    <p>Check startup logs, then refresh dashboard.</p>
                    <p>Bot Status must become <strong>Online</strong>.</p>
                  </StepCard>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline">
                      <a href="https://docs.railway.com/cli.md" target="_blank" rel="noreferrer">
                        Railway CLI Docs
                      </a>
                    </Button>
                    <Button asChild>
                      <a href="https://railway.com?referralCode=EGh1Pg" target="_blank" rel="noreferrer">
                        Open Railway
                      </a>
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-destructive/40 bg-destructive/5 shadow-lg shadow-black/5">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Reset settings
          </CardTitle>
          <CardDescription>
            This clears OAuth, bot token, database, and guild settings so setup starts fresh.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            This action is destructive. You must type the current setup Guild ID to confirm.
          </div>
          <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
              setOpen(nextOpen);
              if (!nextOpen) {
                setConfirmValue("");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="destructive" disabled={!trimmedGuildId || resetting}>
                Reset Setting
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm reset</DialogTitle>
                <DialogDescription>
                  Type the current setup Guild ID <span className="font-mono">{trimmedGuildId || "(not set)"}</span> to confirm.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <label htmlFor="reset-guild-confirm" className="text-sm font-medium">
                  Guild ID confirmation
                </label>
                <Input
                  id="reset-guild-confirm"
                  value={confirmValue}
                  onChange={(event) => setConfirmValue(event.target.value)}
                  placeholder="Enter current setup Guild ID"
                  autoComplete="off"
                />
              </div>
              <DialogFooter showCloseButton>
                <Button
                  variant="destructive"
                  onClick={handleReset}
                  disabled={!isConfirmMatch || resetting || !trimmedGuildId}
                >
                  {resetting ? "Resetting..." : "Reset Setting"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}

export const ResetSettingsSection = memo(ResetSettingsSectionComponent);
