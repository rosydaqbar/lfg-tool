"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SetupState = {
  ownerDiscordId: string | null;
  setupComplete: boolean;
  selectedGuildId: string | null;
  logChannelId: string | null;
  lfgChannelId: string | null;
  databaseProvider: "local_postgres" | "supabase" | null;
  databaseValidatedAt: string | null;
  botTokenSet: boolean;
  botDisplayName: string | null;
  discordClientId: string | null;
  discordClientSecretSet: boolean;
  databaseUrlSet: boolean;
  steps: {
    ownerClaimed: boolean;
    discordAppConfigured: boolean;
    botTokenValidated: boolean;
    guildValidated: boolean;
    inviteChecked: boolean;
    databaseValidated: boolean;
    channelsSaved: boolean;
  };
};

type TextChannel = { id: string; name: string };
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const stepLabels: Record<WizardStep, string> = {
  1: "Claim Owner",
  2: "Discord App",
  3: "Bot Token",
  4: "Guild ID",
  5: "Invite Bot",
  6: "Database",
  7: "Channels",
  8: "Finalize",
};

export function SetupWizard({ currentUserId }: { currentUserId: string }) {
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);

  const [discordClientIdInput, setDiscordClientIdInput] = useState("");
  const [discordClientSecretInput, setDiscordClientSecretInput] = useState("");

  const [tokenInput, setTokenInput] = useState("");
  const [guildIdInput, setGuildIdInput] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [alreadyInvited, setAlreadyInvited] = useState<boolean | null>(null);

  const [dbProvider, setDbProvider] = useState<"local_postgres" | "supabase">("supabase");
  const [dbUrlInput, setDbUrlInput] = useState("");
  const [applySchema, setApplySchema] = useState(true);

  const [textChannels, setTextChannels] = useState<TextChannel[]>([]);
  const [logChannelId, setLogChannelId] = useState("");
  const [lfgChannelId, setLfgChannelId] = useState("");

  const [busyKey, setBusyKey] = useState<string | null>(null);

  function getProgressStep(state: SetupState): WizardStep {
    if (!state.ownerDiscordId) return 1;
    if (!(state.discordClientId && state.discordClientSecretSet)) return 2;
    if (!state.botTokenSet) return 3;
    if (!state.selectedGuildId) return 4;
    if (!state.databaseValidatedAt) return 6;
    if (!state.logChannelId) return 7;
    return 8;
  }

  async function reloadState(options?: { keepStep?: boolean }) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/setup/state", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load setup state");
      const payload = (await response.json()) as { setup: SetupState };
      setSetup(payload.setup);
      setGuildIdInput(payload.setup.selectedGuildId ?? "");
      setLogChannelId(payload.setup.logChannelId ?? "");
      setLfgChannelId(payload.setup.lfgChannelId ?? "");
      setDiscordClientIdInput(payload.setup.discordClientId ?? "");
      if (payload.setup.databaseProvider) setDbProvider(payload.setup.databaseProvider);
      if (!options?.keepStep) setCurrentStep(getProgressStep(payload.setup));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load setup state");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reloadState().catch(() => null);
  }, []);

  const canFinalize = useMemo(() => {
    return Boolean(
      setup?.ownerDiscordId &&
      setup.discordClientId &&
      setup.discordClientSecretSet &&
      setup.botTokenSet &&
      setup.selectedGuildId &&
      setup.databaseValidatedAt &&
      setup.logChannelId
    );
  }, [setup]);

  async function claimOwner() {
    setBusyKey("claim");
    setError(null);
    try {
      const response = await fetch("/api/setup/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim_owner" }),
      });
      if (!response.ok) throw new Error("Failed to claim setup owner");
      await reloadState({ keepStep: true });
      setCurrentStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim owner");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveDiscordApp() {
    setBusyKey("discord-app");
    setError(null);
    try {
      const response = await fetch("/api/setup/discord-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: discordClientIdInput.trim(),
          clientSecret: discordClientSecretInput.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Failed to save Discord app credentials");
      setDiscordClientSecretInput("");
      await reloadState({ keepStep: true });
      setCurrentStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Discord app credentials");
    } finally {
      setBusyKey(null);
    }
  }

  async function validateToken() {
    setBusyKey("token");
    setError(null);
    try {
      const response = await fetch("/api/setup/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Invalid token");
      setTokenInput("");
      await reloadState({ keepStep: true });
      setCurrentStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate token");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveGuild() {
    setBusyKey("guild");
    setError(null);
    try {
      const response = await fetch("/api/setup/guild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: guildIdInput.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Failed to save guild");
      await reloadState({ keepStep: true });
      setCurrentStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save guild");
    } finally {
      setBusyKey(null);
    }
  }

  async function checkInvite() {
    setBusyKey("invite");
    setError(null);
    try {
      const response = await fetch("/api/setup/invite", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; inviteUrl?: string | null; alreadyInvited?: boolean }
        | null;
      if (!response.ok) throw new Error(payload?.error || "Failed to check invite");
      setInviteUrl(payload?.inviteUrl ?? null);
      setAlreadyInvited(payload?.alreadyInvited ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check invite status");
    } finally {
      setBusyKey(null);
    }
  }

  async function validateDatabase() {
    setBusyKey("database");
    setError(null);
    try {
      const response = await fetch("/api/setup/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: dbProvider, databaseUrl: dbUrlInput.trim(), applySchema }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Database validation failed");
      await reloadState({ keepStep: true });
      setCurrentStep(7);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Database validation failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function loadChannels() {
    setBusyKey("channels-load");
    setError(null);
    try {
      const response = await fetch("/api/setup/channels", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; textChannels?: TextChannel[] }
        | null;
      if (!response.ok) throw new Error(payload?.error || "Failed to load channels");
      setTextChannels(payload?.textChannels ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load channels");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveChannels() {
    setBusyKey("channels-save");
    setError(null);
    try {
      const response = await fetch("/api/setup/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logChannelId, lfgChannelId: lfgChannelId || null }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Failed to save channels");
      await reloadState({ keepStep: true });
      setCurrentStep(8);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save channels");
    } finally {
      setBusyKey(null);
    }
  }

  async function completeSetup() {
    setBusyKey("complete");
    setError(null);
    try {
      const response = await fetch("/api/setup/complete", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Failed to complete setup");
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete setup");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading && !setup) {
    return <div className="text-sm text-muted-foreground">Loading setup wizard...</div>;
  }

  const stepNumbers: WizardStep[] = [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-medium">Setup Progress</div>
        <div className="grid gap-2 md:grid-cols-8">
          {stepNumbers.map((step) => {
            const isActive = step === currentStep;
            const isPast = step < currentStep;
            return (
              <button
                key={step}
                type="button"
                className={`rounded-md border px-2 py-2 text-left text-xs ${
                  isActive
                    ? "border-primary bg-primary/10"
                    : isPast
                      ? "border-border bg-muted/50"
                      : "border-border bg-background"
                }`}
                onClick={() => setCurrentStep(step)}
              >
                <div className="font-semibold">Step {step}</div>
                <div className="text-muted-foreground">{stepLabels[step]}</div>
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {currentStep === 1 ? (
        <section className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold">Step 1 - Claim Setup Owner</h2>
          <p className="text-sm text-muted-foreground">Current user: <code>{currentUserId}</code></p>
          <p className="text-sm text-muted-foreground">Owner: <code>{setup?.ownerDiscordId || "(not claimed)"}</code></p>
          <Button onClick={claimOwner} disabled={busyKey === "claim" || setup?.ownerDiscordId === currentUserId}>
            {setup?.ownerDiscordId === currentUserId ? "Owner Claimed" : "Claim as Owner"}
          </Button>
        </section>
      ) : null}

      {currentStep === 2 ? (
        <section className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold">Step 2 - Discord App Credentials</h2>
          <label htmlFor="discord-client-id" className="text-sm font-medium">Discord Client ID</label>
          <Input
            id="discord-client-id"
            value={discordClientIdInput}
            onChange={(event) => setDiscordClientIdInput(event.target.value)}
            placeholder="1234567890"
          />
          <label htmlFor="discord-client-secret" className="text-sm font-medium">Discord Client Secret</label>
          <Input
            id="discord-client-secret"
            type="password"
            value={discordClientSecretInput}
            onChange={(event) => setDiscordClientSecretInput(event.target.value)}
            placeholder={setup?.discordClientSecretSet ? "Secret already saved" : "Paste secret"}
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCurrentStep(1)}>Back</Button>
            <Button
              onClick={saveDiscordApp}
              disabled={
                busyKey === "discord-app"
                || !discordClientIdInput.trim()
                || (!discordClientSecretInput.trim() && !setup?.discordClientSecretSet)
              }
            >
              Save Discord App
            </Button>
          </div>
        </section>
      ) : null}

      {currentStep === 3 ? (
        <section className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold">Step 3 - Bot Token</h2>
          <label htmlFor="bot-token" className="text-sm font-medium">Discord bot token</label>
          <Input
            id="bot-token"
            type="password"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder={setup?.botTokenSet ? "Token already saved" : "Paste token"}
          />
          {setup?.botDisplayName ? (
            <p className="text-sm text-muted-foreground">
              Bot detected: <strong>{setup.botDisplayName}</strong>
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCurrentStep(2)}>Back</Button>
            <Button onClick={validateToken} disabled={busyKey === "token" || !tokenInput.trim()}>
              Validate and Save Token
            </Button>
          </div>
        </section>
      ) : null}

      {currentStep === 4 ? (
        <section className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold">Step 4 - Guild ID</h2>
          <label htmlFor="guild-id" className="text-sm font-medium">Guild ID</label>
          <Input
            id="guild-id"
            value={guildIdInput}
            onChange={(event) => setGuildIdInput(event.target.value)}
            placeholder="670147766839803924"
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCurrentStep(3)}>Back</Button>
            <Button onClick={saveGuild} disabled={busyKey === "guild" || !guildIdInput.trim()}>
              Validate Guild
            </Button>
          </div>
        </section>
      ) : null}

      {currentStep === 5 ? (
        <section className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold">Step 5 - Invite Bot (Skippable)</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCurrentStep(4)}>Back</Button>
            <Button onClick={checkInvite} disabled={busyKey === "invite" || !setup?.selectedGuildId}>
              Check Invite Status
            </Button>
            <Button variant="secondary" onClick={() => setCurrentStep(6)}>Skip</Button>
          </div>
          {alreadyInvited !== null ? (
            <p className="text-sm text-muted-foreground">
              {alreadyInvited ? "Bot is already invited to this guild." : "Bot is not in the guild yet."}
            </p>
          ) : null}
          {!alreadyInvited && inviteUrl ? (
            <a
              href={inviteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Open Invite Link
            </a>
          ) : null}
          {alreadyInvited ? <Button onClick={() => setCurrentStep(6)}>Continue</Button> : null}
        </section>
      ) : null}

      {currentStep === 6 ? (
        <section className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold">Step 6 - Database</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCurrentStep(5)}>Back</Button>
            <Button
              type="button"
              variant={dbProvider === "supabase" ? "default" : "outline"}
              onClick={() => setDbProvider("supabase")}
            >
              Supabase
            </Button>
            <Button
              type="button"
              variant={dbProvider === "local_postgres" ? "default" : "outline"}
              onClick={() => setDbProvider("local_postgres")}
            >
              Local Postgres
            </Button>
          </div>
          <label htmlFor="db-url" className="text-sm font-medium">Database URL</label>
          <Input
            id="db-url"
            type="password"
            value={dbUrlInput}
            onChange={(event) => setDbUrlInput(event.target.value)}
            placeholder="postgresql://..."
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={applySchema}
              onChange={(event) => setApplySchema(event.target.checked)}
            />
            Apply baseline schema check
          </label>
          <Button onClick={validateDatabase} disabled={busyKey === "database" || !dbUrlInput.trim()}>
            Validate Database
          </Button>
        </section>
      ) : null}

      {currentStep === 7 ? (
        <section className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold">Step 7 - Channels</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCurrentStep(6)}>Back</Button>
            <Button onClick={loadChannels} disabled={busyKey === "channels-load" || !setup?.selectedGuildId}>
              Load Text Channels
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="log-channel" className="text-sm font-medium">Log Channel (required)</label>
              <select
                id="log-channel"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={logChannelId}
                onChange={(event) => setLogChannelId(event.target.value)}
              >
                <option value="">Select channel</option>
                {textChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>{channel.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="lfg-channel" className="text-sm font-medium">LFG Channel (optional)</label>
              <select
                id="lfg-channel"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={lfgChannelId}
                onChange={(event) => setLfgChannelId(event.target.value)}
              >
                <option value="">Use fallback behavior</option>
                {textChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>{channel.name}</option>
                ))}
              </select>
            </div>
          </div>
          <Button onClick={saveChannels} disabled={busyKey === "channels-save" || !logChannelId}>
            Save Channel Setup
          </Button>
        </section>
      ) : null}

      {currentStep === 8 ? (
        <section className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold">Step 8 - Finalize</h2>
          <p className="text-sm text-muted-foreground">Complete setup and continue to dashboard.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCurrentStep(7)}>Back</Button>
            <Button onClick={completeSetup} disabled={!canFinalize || busyKey === "complete"}>
              Complete Setup
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
