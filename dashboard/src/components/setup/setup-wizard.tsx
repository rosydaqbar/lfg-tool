"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SetupResetDiscordButton } from "@/components/setup/setup-reset-discord";

type SetupState = {
  ownerDiscordId: string | null;
  setupComplete: boolean;
  selectedGuildId: string | null;
  logChannelId: string | null;
  lfgChannelId: string | null;
  databaseProvider: "local_postgres" | "local_sqlite" | "supabase" | null;
  databaseValidatedAt: string | null;
  botTokenSet: boolean;
  botDisplayName: string | null;
  discordClientId: string | null;
  discordClientSecretSet: boolean;
  databaseUrlSet: boolean;
};

type TextChannel = { id: string; name: string };
type SetupPhase = "A" | "B" | "C" | "FINAL";

export function SetupWizard({ currentUserId }: { currentUserId: string }) {
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [discordClientIdInput, setDiscordClientIdInput] = useState("");
  const [discordClientSecretInput, setDiscordClientSecretInput] = useState("");

  const [tokenInput, setTokenInput] = useState("");
  const [guildIdInput, setGuildIdInput] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [alreadyInvited, setAlreadyInvited] = useState<boolean | null>(null);

  const [dbUrlInput, setDbUrlInput] = useState("");
  const [applySchema, setApplySchema] = useState(true);
  const [schemaSql, setSchemaSql] = useState("");
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaCopied, setSchemaCopied] = useState(false);

  const [textChannels, setTextChannels] = useState<TextChannel[]>([]);
  const [logChannelId, setLogChannelId] = useState("");
  const [lfgChannelId, setLfgChannelId] = useState("");

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<SetupPhase>("A");

  async function reloadState() {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load setup state");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reloadState().catch(() => null);
  }, []);

  useEffect(() => {
    if (schemaSql || schemaLoading) return;
    setSchemaLoading(true);
    fetch("/api/setup/database/schema", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; schemaSql?: string }
          | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load schema SQL");
        }
        setSchemaSql(payload?.schemaSql || "");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load schema SQL");
      })
      .finally(() => {
        setSchemaLoading(false);
      });
  }, [schemaLoading, schemaSql]);

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

  const isDatabaseReady = Boolean(setup?.databaseValidatedAt);
  const isDiscordReady = Boolean(
    setup?.ownerDiscordId &&
      setup.discordClientId &&
      setup.discordClientSecretSet &&
      setup.botTokenSet
  );
  const isGuildReady = Boolean(setup?.selectedGuildId && setup?.logChannelId);

  useEffect(() => {
    if (!setup) return;
    if (!isDatabaseReady) {
      setPhase("A");
      return;
    }
    if (!isDiscordReady) {
      setPhase((current) => (current === "A" ? "A" : "B"));
      return;
    }
    if (!isGuildReady) {
      setPhase((current) => (current === "A" || current === "B" ? current : "C"));
      return;
    }
  }, [setup, isDatabaseReady, isDiscordReady, isGuildReady]);

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
      await reloadState();
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
      if (!response.ok)
        throw new Error(payload?.error || "Failed to save Discord app credentials");
      setDiscordClientSecretInput("");
      await reloadState();
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
      await reloadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate token");
    } finally {
      setBusyKey(null);
    }
  }

  async function validateAndSaveToken() {
    setBusyKey("discord-token-combined");
    setError(null);
    try {
      const canReuseSecret = Boolean(setup?.discordClientSecretSet && !discordClientSecretInput.trim());
      if (!discordClientIdInput.trim() || (!discordClientSecretInput.trim() && !canReuseSecret)) {
        throw new Error("Discord Client ID, Client Secret, and Bot Token are required.");
      }

      const saveResponse = await fetch("/api/setup/discord-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: discordClientIdInput.trim(),
          clientSecret: discordClientSecretInput.trim(),
        }),
      });
      const savePayload = (await saveResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!saveResponse.ok) {
        throw new Error(savePayload?.error || "Failed to save Discord app credentials");
      }

      const tokenResponse = await fetch("/api/setup/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput }),
      });
      const tokenPayload = (await tokenResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!tokenResponse.ok) {
        throw new Error(tokenPayload?.error || "Failed to validate bot token");
      }

      setDiscordClientSecretInput("");
      setTokenInput("");
      await reloadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate and save token");
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
      await reloadState();
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
        body: JSON.stringify({
          provider: "supabase",
          databaseUrl: dbUrlInput.trim(),
          applySchema,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; details?: string; hint?: string | null }
        | null;
      if (!response.ok) {
        const parts = [payload?.error || "Database validation failed"];
        if (payload?.details) parts.push(`Details: ${payload.details}`);
        if (payload?.hint) parts.push(`Hint: ${payload.hint}`);
        throw new Error(parts.join("\n"));
      }
      await reloadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Database validation failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function copySchemaSql() {
    if (!schemaSql.trim()) return;
    try {
      await navigator.clipboard.writeText(schemaSql);
      setSchemaCopied(true);
      setTimeout(() => setSchemaCopied(false), 1600);
    } catch {
      setError("Failed to copy schema SQL. Copy manually from the code block.");
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
      await reloadState();
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

  const ownerClaimedByCurrentUser = setup?.ownerDiscordId === currentUserId;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-medium">Setup Flow</div>
        <div className="grid gap-2 md:grid-cols-4">
          <Button
            type="button"
            variant={phase === "A" ? "default" : "outline"}
            onClick={() => setPhase("A")}
          >
            A. Database
          </Button>
          <Button
            type="button"
            variant={phase === "B" ? "default" : "outline"}
            disabled={!isDatabaseReady}
            onClick={() => setPhase("B")}
          >
            B. Discord
          </Button>
          <Button
            type="button"
            variant={phase === "C" ? "default" : "outline"}
            disabled={!isDatabaseReady || !isDiscordReady}
            onClick={() => setPhase("C")}
          >
            C. Guild
          </Button>
          <Button
            type="button"
            variant={phase === "FINAL" ? "default" : "outline"}
            disabled={!canFinalize}
            onClick={() => setPhase("FINAL")}
          >
            Finalize
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      {phase === "A" ? (
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">A. Set Up Database</h2>
          <p className="text-sm text-muted-foreground">
            One step only. We support Supabase integration in setup.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-sm font-medium">Step A1 - Configure Supabase Database</p>
          <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-foreground">
            Use Supabase Transaction Pooler URL (port <code>6543</code>) and include <code>sslmode=require</code>.
          </div>
          <label htmlFor="db-url" className="text-sm font-medium">Database URL</label>
          <Input
            id="db-url"
            type="password"
            value={dbUrlInput}
            onChange={(event) => setDbUrlInput(event.target.value)}
            placeholder="postgresql://...:6543/postgres?sslmode=require"
          />

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={applySchema}
              onChange={(event) => setApplySchema(event.target.checked)}
            />
            Apply baseline schema check
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-foreground">Schema SQL (`scripts/schema-postgres.sql`)</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copySchemaSql}
                disabled={!schemaSql.trim()}
              >
                {schemaCopied ? "Copied" : "Copy SQL"}
              </Button>
            </div>
            <pre className="max-h-56 overflow-auto rounded-md border border-border bg-background p-3 text-[11px] leading-5 text-foreground">
              <code>{schemaLoading ? "Loading schema SQL..." : schemaSql || "Schema SQL unavailable."}</code>
            </pre>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={validateDatabase} disabled={busyKey === "database" || !dbUrlInput.trim()}>
              Validate Database
            </Button>
            <span className="text-xs text-muted-foreground">
              {setup?.databaseValidatedAt ? `Validated at ${new Date(setup.databaseValidatedAt).toLocaleString()}` : "Not validated yet"}
            </span>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => setPhase("B")}
              disabled={!isDatabaseReady}
            >
              Continue to Set Up Discord
            </Button>
          </div>
        </div>
      </section>
      ) : null}

      {phase === "B" ? (
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">B. Set Up Discord</h2>
          <p className="text-sm text-muted-foreground">
            Configure app, authenticate, claim owner, then validate and save token.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-sm font-medium">Step B1 - Configure Discord App Basics</p>
          <label htmlFor="discord-client-id-basic" className="text-sm font-medium">Discord Client ID</label>
          <Input
            id="discord-client-id-basic"
            value={discordClientIdInput}
            onChange={(event) => setDiscordClientIdInput(event.target.value)}
            placeholder="1234567890"
          />
          <label htmlFor="discord-client-secret-basic" className="text-sm font-medium">Discord Client Secret</label>
          <Input
            id="discord-client-secret-basic"
            type="password"
            value={discordClientSecretInput}
            onChange={(event) => setDiscordClientSecretInput(event.target.value)}
            placeholder={setup?.discordClientSecretSet ? "Secret already saved" : "Paste secret"}
          />
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Required OAuth2 Redirect URI</p>
            <code className="block rounded bg-background px-2 py-1 break-all">
              http://localhost:3000/api/auth/callback/discord
            </code>
            <p>Add this exact URI in Discord Developer Portal - OAuth2 - Redirects.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={saveDiscordApp}
              disabled={
                busyKey === "discord-app" ||
                !discordClientIdInput.trim() ||
                (!discordClientSecretInput.trim() && !setup?.discordClientSecretSet)
              }
            >
              Save and Enable Login
            </Button>
            {setup?.discordClientId && setup?.discordClientSecretSet ? (
              <SetupResetDiscordButton endpoint="/api/setup/discord-app" />
            ) : null}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-sm font-medium">Step B2 - Login with Discord</p>
          <p className="text-sm text-muted-foreground">You are signed in as <strong>{currentUserId}</strong>.</p>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/api/auth/signout">Switch account</Link>
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-sm font-medium">Step B3 - Claim Setup Owner</p>
          <p className="text-sm text-muted-foreground">
            Current owner: <code>{setup?.ownerDiscordId || "(not claimed)"}</code>
          </p>
          <Button
            onClick={claimOwner}
            disabled={busyKey === "claim" || ownerClaimedByCurrentUser}
          >
            {ownerClaimedByCurrentUser ? "Owner Claimed" : "Claim Setup Owner"}
          </Button>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-sm font-medium">Step B4 - Confirm Discord App and Save Bot Token</p>
          <label htmlFor="discord-client-id-confirm" className="text-sm font-medium">Discord Client ID</label>
          <Input
            id="discord-client-id-confirm"
            value={discordClientIdInput}
            onChange={(event) => setDiscordClientIdInput(event.target.value)}
            placeholder="1234567890"
          />
          <label htmlFor="discord-client-secret-confirm" className="text-sm font-medium">Discord Client Secret</label>
          <Input
            id="discord-client-secret-confirm"
            type="password"
            value={discordClientSecretInput}
            onChange={(event) => setDiscordClientSecretInput(event.target.value)}
            placeholder={setup?.discordClientSecretSet ? "Secret already saved" : "Paste secret"}
          />
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Required OAuth2 Redirect URI</p>
            <code className="block rounded bg-background px-2 py-1 break-all">
              http://localhost:3000/api/auth/callback/discord
            </code>
          </div>
          <label htmlFor="bot-token" className="text-sm font-medium">Discord Bot Token</label>
          <Input
            id="bot-token"
            type="password"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder={setup?.botTokenSet ? "Token already saved" : "Paste token"}
          />
          {setup?.botDisplayName ? (
            <p className="text-sm text-muted-foreground">Bot detected: <strong>{setup.botDisplayName}</strong></p>
          ) : null}
          <Button
            onClick={validateAndSaveToken}
            disabled={busyKey === "discord-token-combined" || !tokenInput.trim()}
          >
            Validate and Save Token
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" onClick={() => setPhase("A")}>Back to Database</Button>
          <Button
            type="button"
            onClick={() => setPhase("C")}
            disabled={!isDatabaseReady || !isDiscordReady}
          >
            Continue to Set Up Guild
          </Button>
        </div>
      </section>
      ) : null}

      {phase === "C" ? (
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">C. Set Up Guild</h2>
          <p className="text-sm text-muted-foreground">
            Select guild, ensure bot invite, then map channels.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-sm font-medium">Step C1 - Add Guild ID</p>
          <label htmlFor="guild-id" className="text-sm font-medium">Guild ID</label>
          <Input
            id="guild-id"
            value={guildIdInput}
            onChange={(event) => setGuildIdInput(event.target.value)}
            placeholder="670147766839803924"
          />
          <Button onClick={saveGuild} disabled={busyKey === "guild" || !guildIdInput.trim()}>
            Validate Guild
          </Button>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-sm font-medium">Step C2 - Invite Bot</p>
          <p className="text-xs text-muted-foreground">Skippable (same behavior as previous flow).</p>
          <Button onClick={checkInvite} disabled={busyKey === "invite" || !setup?.selectedGuildId}>
            Check Invite Status
          </Button>
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
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-sm font-medium">Step C3 - Set Up Channels</p>
          <div className="flex gap-2">
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
        </div>
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" onClick={() => setPhase("B")}>Back to Discord</Button>
          <Button
            type="button"
            onClick={() => setPhase("FINAL")}
            disabled={!isGuildReady}
          >
            Continue to Finalize
          </Button>
        </div>
      </section>
      ) : null}

      {phase === "FINAL" ? (
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-lg font-semibold">Finalize</h2>
        <p className="text-sm text-muted-foreground">Complete setup after all sections above are done.</p>
        <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
          <li>Database validated: {setup?.databaseValidatedAt ? "Yes" : "No"}</li>
          <li>Discord app configured: {setup?.discordClientId && setup?.discordClientSecretSet ? "Yes" : "No"}</li>
          <li>Bot token saved: {setup?.botTokenSet ? "Yes" : "No"}</li>
          <li>Owner claimed: {setup?.ownerDiscordId ? "Yes" : "No"}</li>
          <li>Guild selected: {setup?.selectedGuildId ? "Yes" : "No"}</li>
          <li>Channels saved: {setup?.logChannelId ? "Yes" : "No"}</li>
        </ul>
        <Button onClick={completeSetup} disabled={!canFinalize || busyKey === "complete"}>
          Complete Setup
        </Button>
      </section>
      ) : null}
    </div>
  );
}
