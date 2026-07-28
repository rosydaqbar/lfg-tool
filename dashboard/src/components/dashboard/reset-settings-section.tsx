"use client";

import { memo, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { dashboardCardStrong, dashboardCodeBlock, dashboardError, dashboardInset, dashboardStepper } from "@/components/ui/patterns";
import { useDashboardI18n } from "@/components/dashboard/dashboard-i18n";

type ResetSettingsSectionProps = {
  selectedGuildId: string;
  onResetComplete?: () => void;
  afterResetHref?: string;
};

type BotStatusResponse = {
  online: boolean | null;
  status?: "online" | "offline" | "unverified";
  source?: "discord_api" | "healthcheck";
  checkedAt: string;
  bot?: {
    id: string;
    username: string;
    displayName: string;
  };
  guildId?: string | null;
  inSelectedGuild?: boolean | null;
  payload?: {
    status?: string;
    uptimeSeconds?: number;
    timestamp?: string;
  } | null;
  error?: string;
};

function CommandBlock({ children }: { children: string }) {
  return (
    <div className={`mt-3 whitespace-pre-wrap ${dashboardCodeBlock}`}>
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
  const { t } = useDashboardI18n();
  const [confirmValue, setConfirmValue] = useState("");
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [botStatus, setBotStatus] = useState<BotStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [deployTab, setDeployTab] = useState<"local" | "railway" | "railway-cli">("local");

  const trimmedGuildId = selectedGuildId.trim();
  const isConfirmMatch = confirmValue.trim() === trimmedGuildId;
  const botStatusErrorFallback = t(
    "settings.reset.status.checkError",
    "Unable to check bot status right now."
  );

  useEffect(() => {
    let mounted = true;

    async function loadBotStatus() {
      setStatusLoading(true);
      try {
        const params = new URLSearchParams({ guildId: trimmedGuildId });
        const response = await fetch(`/api/bot/status?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as BotStatusResponse | null;
        if (!response.ok) {
          throw new Error(payload?.error || botStatusErrorFallback);
        }
        if (!mounted) return;
        setBotStatus(payload);
      } catch (error) {
        if (!mounted) return;
        const message = error instanceof Error ? error.message : botStatusErrorFallback;
        setBotStatus({
          online: null,
          status: "unverified",
          source: "discord_api",
          checkedAt: new Date().toISOString(),
          error: message,
        });
      } finally {
        if (mounted) setStatusLoading(false);
      }
    }

    if (trimmedGuildId) {
      loadBotStatus();
    } else {
      setStatusLoading(false);
    }
    return () => {
      mounted = false;
    };
  }, [botStatusErrorFallback, trimmedGuildId]);

  async function handleReset() {
    if (!trimmedGuildId) {
      toast.error(t("settings.reset.toast.failedTitle", "Reset failed"), {
        description: t(
          "settings.reset.toast.noGuildId",
          "No current setup guild ID found."
        ),
      });
      return;
    }

    if (!isConfirmMatch) {
      toast.error(t("settings.reset.toast.failedTitle", "Reset failed"), {
        description: t(
          "settings.reset.toast.confirmationMismatch",
          "Guild ID confirmation does not match."
        ),
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
        throw new Error(
          payload?.error ||
            t("settings.reset.toast.requestFailed", "Failed to reset setup settings")
        );
      }

      toast.success(
        t("settings.reset.toast.successTitle", "Setup reset complete"),
        {
          description: t(
            "settings.reset.toast.successDescription",
            "Configuration has been cleared. Continue setup again."
          ),
        }
      );
      setOpen(false);
      setConfirmValue("");
      if (onResetComplete) {
        onResetComplete();
      } else if (typeof window !== "undefined") {
        window.location.href = afterResetHref || "/setup";
      }
    } catch (error) {
      toast.error(t("settings.reset.toast.failedTitle", "Reset failed"), {
        description:
          error instanceof Error
            ? error.message
            : t(
                "settings.reset.toast.unexpectedError",
                "Unexpected error while resetting settings"
              ),
      });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className={dashboardCardStrong}>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">
              {t("settings.reset.status.title", "Bot status")}
            </CardTitle>
            {statusLoading ? (
              <StatusBadge tone="loading" className="px-3 py-1" dot>
                {t("common.checking", "Checking...")}
              </StatusBadge>
            ) : botStatus?.online ? (
              <StatusBadge tone="success" className="px-3 py-1" dot>
                {t("common.online", "Online")}
              </StatusBadge>
            ) : botStatus?.status === "unverified" ? (
              <StatusBadge tone="warning" className="px-3 py-1" dot>
                {t("common.unverified", "Unverified")}
              </StatusBadge>
            ) : (
              <StatusBadge tone="danger" className="px-3 py-1" dot>
                {t("common.offline", "Offline")}
              </StatusBadge>
            )}
          </div>
          <CardDescription>
            {statusLoading
              ? t(
                  "settings.reset.status.checkingDescription",
                  "Checking if your bot is running..."
                )
              : botStatus?.online
                ? t(
                    "settings.reset.status.onlineDescription",
                    "Good news: your bot is running."
                  )
                : botStatus?.status === "unverified"
                  ? botStatus.error ||
                    t(
                      "settings.reset.status.unverifiedDescription",
                      "Bot status cannot be verified yet. Make sure bot token is configured in setup."
                    )
                  : t(
                      "settings.reset.status.offlineDescription",
                      "Your bot is offline. Open the Local tab and follow each step exactly. Railway tabs are only for cloud hosting."
                    )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`${dashboardInset} text-sm text-muted-foreground`}>
            {t("settings.reset.status.checkMethod", "Check method:")} {" "}
            <code>
              {botStatus?.source === "discord_api"
                ? t("settings.reset.status.discordApi", "Discord API")
                : t("common.unknown", "Unknown")}
            </code>
          </div>

          {!statusLoading && botStatus?.bot ? (
            <div className={`${dashboardInset} text-sm text-muted-foreground`}>
              {t("settings.reset.status.botLabel", "Bot:")} {" "}
              <code>{botStatus.bot.displayName}</code> (<code>{botStatus.bot.id}</code>)
              {typeof botStatus.inSelectedGuild === "boolean" ? (
                <span className="inline-flex items-center gap-2">
                  <span>
                    • {t("settings.reset.status.selectedGuildBot", "Selected guild bot:")}
                  </span>
                  <StatusBadge tone={botStatus.inSelectedGuild ? "success" : "danger"} dot>
                    {botStatus.inSelectedGuild
                      ? t("settings.reset.status.installed", "Installed")
                      : t("settings.reset.status.inviteBot", "Invite bot")}
                  </StatusBadge>
                </span>
              ) : null}
            </div>
          ) : null}

          {!statusLoading && !botStatus?.online ? (
            <>
              <div className="grid grid-cols-3 gap-2 rounded-full border border-border/60 bg-muted/70 p-1 shadow-inner">
                <Button
                  type="button"
                  variant={deployTab === "local" ? "default" : "ghost"}
                  onClick={() => setDeployTab("local")}
                  className="rounded-full"
                >
                  {t("settings.reset.deploy.localTab", "Local")}
                </Button>
                <Button
                  type="button"
                  variant={deployTab === "railway" ? "default" : "ghost"}
                  onClick={() => setDeployTab("railway")}
                  className="rounded-full"
                >
                  {t("settings.reset.deploy.railwayTab", "Railway")}
                </Button>
                <Button
                  type="button"
                  variant={deployTab === "railway-cli" ? "default" : "ghost"}
                  onClick={() => setDeployTab("railway-cli")}
                  className="rounded-full"
                >
                  {t("settings.reset.deploy.railwayCliTab", "Railway CLI")}
                </Button>
              </div>

              {deployTab === "local" ? (
                <div className={dashboardStepper}>
                  <StepCard
                    step={1}
                    title={t("settings.reset.local.completeSetupTitle", "Complete setup first")}
                  >
                    <p>
                      {t("settings.reset.local.openSetupPrefix", "Open")} <code>/setup</code>{" "}
                      {t(
                        "settings.reset.local.finishSetup",
                        "and finish every step until Step 8 (Finalize)."
                      )}
                    </p>
                    <p>
                      {t(
                        "settings.reset.local.completeSetupDescription",
                        "This creates and saves all required bot settings."
                      )}
                    </p>
                  </StepCard>
                  <StepCard
                    step={2}
                    title={t(
                      "settings.reset.local.validateStateTitle",
                      "Open .setup-state.json, validate required values, and fix mismatches"
                    )}
                  >
                    <p>
                      {t("settings.reset.local.openFilePrefix", "Open file")} {" "}
                      <code>.setup-state.json</code>{" "}
                      {t("settings.reset.local.inProjectRoot", "in project root")} (
                      <code>lfg-tool</code>).
                    </p>
                    <p>
                      {t("settings.reset.local.valuesBelow", "The values below")} {" "}
                      <strong>{t("settings.reset.local.mustMatch", "must match")}</strong>{" "}
                      {t("settings.reset.local.setupInputs", "your setup inputs:")}
                    </p>
                    <ul>
                      <li>
                        <code>setupComplete</code>{" "}
                        {t("settings.reset.local.mustBe", "must be")} <code>true</code>
                      </li>
                      <li>
                        <code>selectedGuildId</code>{" "}
                        {t(
                          "settings.reset.local.selectedGuildMustMatch",
                          "must match the guild you selected in setup"
                        )}
                      </li>
                      <li>
                        <code>databaseProvider</code>{" "}
                        {t(
                          "settings.reset.local.databaseProviderMustMatch",
                          "must match your chosen DB provider in setup"
                        )}
                      </li>
                      <li>
                        {t(
                          "settings.reset.local.botTokenKeyPrefix",
                          "at least one bot token key must exist:"
                        )}{" "}
                        <code>botToken</code> {t("common.or", "or")} {" "}
                        <code>botTokenEncrypted</code>
                      </li>
                      <li>
                        {t(
                          "settings.reset.local.databaseUrlKeyPrefix",
                          "at least one database URL key must exist:"
                        )}{" "}
                        <code>databaseUrl</code> {t("common.or", "or")} {" "}
                        <code>databaseUrlEncrypted</code>
                      </li>
                      <li>
                        <code>discordClientId</code> {t("settings.reset.local.mustExist", "must exist")}
                      </li>
                      <li>
                        {t(
                          "settings.reset.local.discordSecretKeyPrefix",
                          "at least one Discord secret key must exist:"
                        )}{" "}
                        <code>discordClientSecret</code> {t("common.or", "or")} {" "}
                        <code>discordClientSecretEncrypted</code>
                      </li>
                      <li>
                        <code>logChannelId</code>{" "}
                        {t(
                          "settings.reset.local.logChannelMustExist",
                          "must exist after channel setup"
                        )}
                      </li>
                    </ul>
                    <p>{t("settings.reset.local.fileContains", "What this file contains:")}</p>
                    <ul>
                      <li>{t("settings.reset.local.botLoginInfo", "bot login info")}</li>
                      <li>
                        {t("settings.reset.local.databaseConnectionInfo", "database connection info")}
                      </li>
                      <li>{t("settings.reset.local.discordCredentials", "Discord app credentials")}</li>
                      <li>
                        {t("settings.reset.local.guildChannelSettings", "selected guild/channel settings")}
                      </li>
                      <li>{t("settings.reset.local.setupStateFlags", "setup state flags")}</li>
                    </ul>
                    <p>{t("settings.reset.local.fileActions", "What to do with this file:")}</p>
                    <ul>
                      <li>{t("settings.reset.local.keepFile", "keep it")}</li>
                      <li>{t("settings.reset.local.doNotShare", "do not share it")}</li>
                      <li>
                        {t(
                          "settings.reset.local.avoidManualEdits",
                          "avoid manual edits unless troubleshooting"
                        )}
                      </li>
                    </ul>
                    <p>
                      {t("settings.reset.local.goBackTo", "Go back to")} <code>/setup</code>, {" "}
                      {t(
                        "settings.reset.local.resaveAndFinalize",
                        "then re-save the related steps and finalize again:"
                      )}
                    </p>
                    <ul>
                      <li>{t("settings.reset.local.resaveBotToken", "Bot token issue: re-save Step 3")}</li>
                      <li>{t("settings.reset.local.resaveGuild", "Guild mismatch: re-save Step 4")}</li>
                      <li>{t("settings.reset.local.resaveDatabase", "Database mismatch: re-save Step 6")}</li>
                      <li>{t("settings.reset.local.resaveChannels", "Missing channels: re-save Step 7")}</li>
                      <li>{t("settings.reset.local.finishFinalize", "Finish Step 8 (Finalize)")}</li>
                    </ul>
                  </StepCard>
                  <StepCard
                    step={3}
                    title={t(
                      "settings.reset.local.installTitle",
                      "Open terminal in correct folder and install dependencies"
                    )}
                  >
                    <p>
                      {t("settings.reset.local.openTerminalIn", "Open terminal in")} {" "}
                      <code>lfg-tool</code> ({t("settings.reset.local.sameFolderAs", "same folder as")} {" "}
                      <code>package.json</code>).
                    </p>
                    <p>
                      {t(
                        "settings.reset.local.wrongFolderWarning",
                        "If terminal is in wrong folder, next commands may fail."
                      )}
                    </p>
                    {t("common.runCommand", "Run:")}
                    <CommandBlock>npm install</CommandBlock>
                    {t("settings.reset.local.waitForInstall", "Wait until it fully finishes.")}
                  </StepCard>
                  <StepCard
                    step={4}
                    title={t(
                      "settings.reset.local.startBotTitle",
                      "Start bot and confirm success"
                    )}
                  >
                    {t("common.runCommand", "Run:")}
                    <CommandBlock>npm start</CommandBlock>
                    {t(
                      "settings.reset.local.keepTerminalOpen",
                      "Keep this terminal open. If terminal closes, bot stops."
                    )}
                    <p>{t("settings.reset.local.successRequires", "Success requires both:")}</p>
                    <ol>
                      <li>
                        {t("settings.reset.local.terminalShows", "terminal shows")} {" "}
                        <code>Logged in as ...</code>
                      </li>
                      <li>
                        {t("settings.reset.local.botStatusChanges", "Bot Status here changes to")} {" "}
                        <strong>{t("common.online", "Online")}</strong>{" "}
                        {t("settings.reset.local.afterRefresh", "after refresh")}
                      </li>
                    </ol>
                  </StepCard>

                  <div className="grid grid-cols-[2rem_1fr] gap-3 px-4 py-4 bg-muted/10">
                    <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                      i
                    </span>
                    <div>
                      <p className="mb-2 text-sm font-semibold text-foreground">
                        {t("settings.reset.local.notes", "Notes")}
                      </p>
                      <div className="space-y-2 text-sm leading-6 text-muted-foreground [&_code]:rounded [&_code]:border [&_code]:border-border/70 [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-foreground [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_ol>li]:marker:font-semibold [&_ol>li]:marker:text-primary [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul>li]:marker:text-primary/80">
                    <p>
                      {t(
                        "settings.reset.local.recoveryPath",
                        "Repeat this exact recovery path:"
                      )}
                    </p>
                    <ol>
                      <li>{t("settings.reset.local.openLowercase", "open")} <code>/setup</code></li>
                      <li>{t("settings.reset.local.resaveStepThree", "re-save Step 3")}</li>
                      <li>{t("settings.reset.local.resaveStepSix", "re-save Step 6")}</li>
                      <li>{t("settings.reset.local.finalizeStepEight", "finalize Step 8")}</li>
                      <li>
                        {t("settings.reset.local.runLowercase", "run")} <code>npm start</code>{" "}
                        {t("settings.reset.local.again", "again")}
                      </li>
                    </ol>
                    <p>
                      {t(
                        "settings.reset.local.offlineReasons",
                        "Most common reasons for Offline:"
                      )}
                    </p>
                    <ul>
                      <li>{t("settings.reset.local.wrongBotToken", "wrong bot token")}</li>
                      <li>{t("settings.reset.local.wrongDatabaseUrl", "wrong database URL")}</li>
                      <li>{t("settings.reset.local.setupNotFinalized", "setup not finalized")}</li>
                    </ul>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {deployTab === "railway" ? (
                <div className={dashboardStepper}>
                  <StepCard
                    step={1}
                    title={t(
                      "settings.reset.railway.createProjectTitle",
                      "Create Railway project"
                    )}
                  >
                    {t(
                      "settings.reset.railway.createProjectDescription",
                      "Open Railway and create a new project."
                    )}
                  </StepCard>
                  <StepCard
                    step={2}
                    title={t(
                      "settings.reset.railway.connectRepositoryTitle",
                      "Connect repository"
                    )}
                  >
                    {t(
                      "settings.reset.railway.connectRepositoryDescription",
                      "Connect your GitHub repository so Railway can build and deploy automatically."
                    )}
                  </StepCard>
                  <StepCard
                    step={3}
                    title={t(
                      "settings.reset.railway.variablesTitle",
                      "Add required variables in Railway"
                    )}
                  >
                    <p>
                      {t("settings.reset.railway.openProject", "Open Railway project and then open")} {" "}
                      <strong>{t("settings.reset.railway.variablesLabel", "Variables")}</strong>.
                    </p>
                    <p>
                      {t("settings.reset.railway.theseValues", "These values")} {" "}
                      <strong>{t("settings.reset.railway.mustExist", "must exist")}</strong>{" "}
                      {t("common.and", "and")} {" "}
                      <strong>{t("settings.reset.railway.mustMatch", "must match")}</strong>{" "}
                      {t("settings.reset.railway.setupValues", "your setup values:")}
                    </p>
                    <CommandBlock>DISCORD_TOKEN=your_bot_token
DATABASE_URL=your_database_url
NEXTAUTH_SECRET=your_nextauth_secret</CommandBlock>
                    <p>{t("settings.reset.railway.meaning", "Meaning:")}</p>
                    <ul>
                      <li>
                        <code>DISCORD_TOKEN</code>: {" "}
                        {t("settings.reset.railway.botCredential", "bot login credential")}
                      </li>
                      <li>
                        <code>DATABASE_URL</code>: {" "}
                        {t(
                          "settings.reset.railway.databaseAddress",
                          "database connection address"
                        )}
                      </li>
                      <li>
                        <code>NEXTAUTH_SECRET</code>: {" "}
                        {t(
                          "settings.reset.railway.dashboardSecret",
                          "dashboard/session secret"
                        )}
                      </li>
                    </ul>
                    <p>
                      {t(
                        "settings.reset.railway.localStatePrefix",
                        "Important: Railway does not read your local"
                      )}{" "}
                      <code>.setup-state.json</code>. {" "}
                      {t(
                        "settings.reset.railway.setVariables",
                        "You must set these variables in Railway."
                      )}
                    </p>
                  </StepCard>
                  <StepCard
                    step={4}
                    title={t("settings.reset.railway.deployTitle", "Deploy")}
                  >
                    {t(
                      "settings.reset.railway.deployDescription",
                      "Trigger deployment and wait for build/start logs to complete."
                    )}
                  </StepCard>
                  <StepCard
                    step={5}
                    title={t("settings.reset.railway.checkSuccessTitle", "Check success")}
                  >
                    <p>
                      {t(
                        "settings.reset.railway.checkLogs",
                        "Open Railway logs for successful startup, then refresh dashboard."
                      )}
                    </p>
                    <p>
                      {t("settings.reset.railway.statusMustChange", "Bot Status must change to")} {" "}
                      <strong>{t("common.online", "Online")}</strong>.
                    </p>
                  </StepCard>
                  <Button asChild>
                    <a href="https://railway.com?referralCode=EGh1Pg" target="_blank" rel="noreferrer">
                      {t("settings.reset.railway.deployButton", "Deploy on Railway")}
                    </a>
                  </Button>
                </div>
              ) : null}

              {deployTab === "railway-cli" ? (
                <div className={dashboardStepper}>
                  <StepCard
                    step={1}
                    title={t("settings.reset.railwayCli.installTitle", "Install CLI")}
                  >
                    {t("common.runCommand", "Run:")}
                    <CommandBlock>npm i -g @railway/cli</CommandBlock>
                  </StepCard>
                  <StepCard
                    step={2}
                    title={t("settings.reset.railwayCli.loginTitle", "Login")}
                  >
                    {t("common.runCommand", "Run:")}
                    <CommandBlock>railway login</CommandBlock>
                    {t(
                      "settings.reset.railwayCli.completeLogin",
                      "Complete login in browser."
                    )}
                  </StepCard>
                  <StepCard
                    step={3}
                    title={t(
                      "settings.reset.railwayCli.linkTitle",
                      "Link folder to Railway project"
                    )}
                  >
                    {t("settings.reset.railwayCli.runFrom", "Run this from")} {" "}
                    <code>lfg-tool</code> {t("settings.reset.railwayCli.folderSuffix", "folder:")}
                    <CommandBlock>railway link</CommandBlock>
                  </StepCard>
                  <StepCard
                    step={4}
                    title={t(
                      "settings.reset.railwayCli.variablesTitle",
                      "Set required variables"
                    )}
                  >
                    {t("settings.reset.railway.theseValues", "These values")} {" "}
                    <strong>{t("settings.reset.railway.mustExist", "must exist")}</strong>{" "}
                    {t("common.and", "and")} {" "}
                    <strong>{t("settings.reset.railway.mustMatch", "must match")}</strong>{" "}
                    {t("settings.reset.railwayCli.setupValues", "setup values:")}
                    <CommandBlock>railway variable set DISCORD_TOKEN=...</CommandBlock>
                    <CommandBlock>railway variable set DATABASE_URL=...</CommandBlock>
                    <CommandBlock>railway variable set NEXTAUTH_SECRET=...</CommandBlock>
                  </StepCard>
                  <StepCard
                    step={5}
                    title={t("settings.reset.railwayCli.deployTitle", "Deploy")}
                  >
                    <CommandBlock>railway up</CommandBlock>
                  </StepCard>
                  <StepCard
                    step={6}
                    title={t(
                      "settings.reset.railwayCli.confirmSuccessTitle",
                      "Confirm success"
                    )}
                  >
                    <CommandBlock>railway logs</CommandBlock>
                    <p>
                      {t(
                        "settings.reset.railwayCli.checkLogs",
                        "Check startup logs, then refresh dashboard."
                      )}
                    </p>
                    <p>
                      {t("settings.reset.railwayCli.statusMustBecome", "Bot Status must become")} {" "}
                      <strong>{t("common.online", "Online")}</strong>.
                    </p>
                  </StepCard>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline">
                      <a href="https://docs.railway.com/cli.md" target="_blank" rel="noreferrer">
                        {t("settings.reset.railwayCli.docsButton", "Railway CLI Docs")}
                      </a>
                    </Button>
                    <Button asChild>
                      <a href="https://railway.com?referralCode=EGh1Pg" target="_blank" rel="noreferrer">
                        {t("settings.reset.railwayCli.openRailwayButton", "Open Railway")}
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
            {t("settings.reset.title", "Reset settings")}
          </CardTitle>
          <CardDescription>
            {t(
              "settings.reset.description",
              "This clears OAuth, bot token, database, and guild settings so setup starts fresh."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className={`${dashboardError} px-3 py-2 text-xs`}>
            {t(
              "settings.reset.warning",
              "This action is destructive. You must type the current setup Guild ID to confirm."
            )}
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
                {t("settings.reset.button", "Reset Setting")}
              </Button>
            </DialogTrigger>
            <DialogContent showCloseButton={false}>
              <DialogClose className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
                <X />
                <span className="sr-only">{t("common.close", "Close")}</span>
              </DialogClose>
              <DialogHeader>
                <DialogTitle>
                  {t("settings.reset.dialog.title", "Confirm reset")}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    "settings.reset.dialog.descriptionPrefix",
                    "Type the current setup Guild ID"
                  )}{" "}
                  <span className="font-mono">
                    {trimmedGuildId || t("common.notSet", "(not set)")}
                  </span>{" "}
                  {t("settings.reset.dialog.descriptionSuffix", "to confirm.")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <label htmlFor="reset-guild-confirm" className="text-sm font-medium">
                  {t("settings.reset.dialog.confirmationLabel", "Guild ID confirmation")}
                </label>
                <Input
                  id="reset-guild-confirm"
                  value={confirmValue}
                  onChange={(event) => setConfirmValue(event.target.value)}
                  placeholder={t(
                    "settings.reset.dialog.confirmationPlaceholder",
                    "Enter current setup Guild ID"
                  )}
                  autoComplete="off"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="destructive"
                  onClick={handleReset}
                  disabled={!isConfirmMatch || resetting || !trimmedGuildId}
                >
                  {resetting
                    ? t("settings.reset.dialog.resetting", "Resetting...")
                    : t("settings.reset.button", "Reset Setting")}
                </Button>
                <DialogClose asChild>
                  <Button variant="outline">{t("common.close", "Close")}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}

export const ResetSettingsSection = memo(ResetSettingsSectionComponent);
