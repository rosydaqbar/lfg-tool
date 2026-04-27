"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
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
  const [channelLoadWarning, setChannelLoadWarning] = useState<string | null>(null);
  const [channelLoadSuccess, setChannelLoadSuccess] = useState(false);
  const [logChannelId, setLogChannelId] = useState("");
  const [lfgChannelId, setLfgChannelId] = useState("");

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<SetupPhase>("A");
  const [discordSubstep, setDiscordSubstep] = useState<1 | 2 | 3 | 4>(1);
  const [guildSubstep, setGuildSubstep] = useState<1 | 2 | 3>(1);

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
        | { error?: string; setup?: SetupState }
        | null;
      if (!saveResponse.ok) {
        throw new Error(savePayload?.error || "Failed to save Discord app credentials");
      }
      if (savePayload?.setup) {
        setSetup(savePayload.setup);
      }

      const tokenResponse = await fetch("/api/setup/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput }),
      });
      const tokenPayload = (await tokenResponse.json().catch(() => null)) as
        | { error?: string; setup?: SetupState; botName?: string; botTag?: string }
        | null;
      if (!tokenResponse.ok) {
        throw new Error(tokenPayload?.error || "Failed to validate bot token");
      }

      if (tokenPayload?.setup) {
        setSetup(tokenPayload.setup);
      } else {
        setSetup((previous) =>
          previous
            ? {
                ...previous,
                botTokenSet: true,
              }
            : previous
        );
      }

      setDiscordClientSecretInput("");
      setTokenInput("");
      await reloadState().catch(() => null);
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
    setChannelLoadSuccess(false);
    try {
      const response = await fetch("/api/setup/channels", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; textChannels?: TextChannel[]; warning?: string | null }
        | null;
      if (!response.ok) throw new Error(payload?.error || "Failed to load channels");
      const loadedChannels = payload?.textChannels ?? [];
      setTextChannels(loadedChannels);
      setChannelLoadWarning(payload?.warning ?? null);
      setChannelLoadSuccess(loadedChannels.length > 0);
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

  const ownerClaimedByCurrentUser = setup?.ownerDiscordId === currentUserId;
  const discordStep1Done = Boolean(setup?.discordClientId && setup?.discordClientSecretSet);
  const discordStep2Done = true;
  const discordStep3Done = ownerClaimedByCurrentUser;
  const discordStep4Done = Boolean(setup?.botTokenSet);
  const guildStep1Done = Boolean(setup?.selectedGuildId);
  const guildStep2Done = true;
  const guildStep3Done = Boolean(setup?.logChannelId);
  const hasLoadedTextChannels = textChannels.length > 0;

  useEffect(() => {
    if (!channelLoadSuccess) return;
    const timeout = window.setTimeout(() => setChannelLoadSuccess(false), 2600);
    return () => window.clearTimeout(timeout);
  }, [channelLoadSuccess]);

  const canOpenDiscordSubstep = (step: 1 | 2 | 3 | 4) => {
    if (step === 1) return true;
    if (step === 2) return discordStep1Done;
    if (step === 3) return discordStep1Done && discordStep2Done;
    return discordStep1Done && discordStep2Done && discordStep3Done;
  };

  useEffect(() => {
    if (phase !== "B") return;
    if (!discordStep1Done) {
      setDiscordSubstep(1);
      return;
    }
    if (!discordStep3Done) {
      setDiscordSubstep(3);
      return;
    }
    if (!discordStep4Done) {
      setDiscordSubstep(4);
      return;
    }
  }, [phase, discordStep1Done, discordStep3Done, discordStep4Done]);

  const canOpenGuildSubstep = (step: 1 | 2 | 3) => {
    if (step === 1) return true;
    return guildStep1Done;
  };

  useEffect(() => {
    if (phase !== "C") return;
    if (!guildStep1Done) {
      setGuildSubstep(1);
      return;
    }
    if (!guildStep3Done) {
      setGuildSubstep(3);
      return;
    }
  }, [phase, guildStep1Done, guildStep3Done]);

  if (loading && !setup) {
    return <div className="text-sm text-muted-foreground">Loading setup wizard...</div>;
  }

  function DiscordSubstepCard({
    step,
    title,
    done,
    children,
  }: {
    step: 1 | 2 | 3 | 4;
    title: string;
    done: boolean;
    children: React.ReactNode;
  }) {
    const open = discordSubstep === step;
    const enabled = canOpenDiscordSubstep(step);

    return (
      <div className="rounded-lg border border-border bg-background">
        <button
          type="button"
          disabled={!enabled}
          onClick={() => enabled && setDiscordSubstep(step)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                done ? "border-emerald-500/40 text-emerald-400" : "border-border text-muted-foreground"
              }`}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : step}
            </span>
            <span className={`text-sm font-medium ${enabled ? "text-foreground" : "text-muted-foreground"}`}>
              {title}
            </span>
          </div>
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>
        {open ? <div className="space-y-4 border-t border-border px-4 py-4">{children}</div> : null}
      </div>
    );
  }

  function GuildSubstepCard({
    step,
    title,
    done,
    children,
  }: {
    step: 1 | 2 | 3;
    title: string;
    done: boolean;
    children: React.ReactNode;
  }) {
    const open = guildSubstep === step;
    const enabled = canOpenGuildSubstep(step);

    return (
      <div className="rounded-lg border border-border bg-background">
        <button
          type="button"
          disabled={!enabled}
          onClick={() => enabled && setGuildSubstep(step)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                done ? "border-emerald-500/40 text-emerald-400" : "border-border text-muted-foreground"
              }`}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : step}
            </span>
            <span className={`text-sm font-medium ${enabled ? "text-foreground" : "text-muted-foreground"}`}>
              {title}
            </span>
          </div>
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>
        {open ? <div className="space-y-4 border-t border-border px-4 py-4">{children}</div> : null}
      </div>
    );
  }
  const phaseOrder: SetupPhase[] = ["A", "B", "C", "FINAL"];
  const phaseIndex = phaseOrder.indexOf(phase);
  const previousPhase = phaseIndex > 0 ? phaseOrder[phaseIndex - 1] : null;
  const nextPhase = phaseIndex >= 0 && phaseIndex < phaseOrder.length - 1 ? phaseOrder[phaseIndex + 1] : null;

  const phaseTitles: Record<SetupPhase, string> = {
    A: "Set Up Database",
    B: "Set Up Discord",
    C: "Set Up Guild",
    FINAL: "Finalize",
  };

  function canOpenPhase(target: SetupPhase) {
    if (target === "A") return true;
    if (target === "B") return isDatabaseReady;
    if (target === "C") return isDatabaseReady && isDiscordReady;
    return canFinalize;
  }

  const nextDisabled =
    phase === "A"
      ? !isDatabaseReady
      : phase === "B"
        ? !isDiscordReady
        : phase === "C"
          ? !isGuildReady
          : !canFinalize;

  const nextButtonLabel =
    phase === "A"
      ? "Next: Set Up Discord"
      : phase === "B"
        ? "Next: Set Up Guild"
        : phase === "C"
          ? "Next: Finalize"
          : "Complete Setup";

  return (
    <div className="rounded-2xl border border-border bg-card shadow-lg shadow-black/5 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5">
        <div>
          <h2 className="text-xl font-semibold">Setup Wizard</h2>
          <p className="text-sm text-muted-foreground">{phaseTitles[phase]}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
          Need help?
        </Button>
      </div>

      <div className="border-t border-border px-6 py-6">
        {error ? (
          <div className="mb-5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-muted/10 p-5 space-y-6">
          <div className="grid gap-3 md:grid-cols-4">
            {phaseOrder.map((item, index) => {
              const enabled = canOpenPhase(item);
              const active = item === phase;
              const done = phaseOrder.indexOf(item) < phaseIndex;
              return (
                <button
                  key={item}
                  type="button"
                  className="text-left"
                  disabled={!enabled}
                  onClick={() => setPhase(item)}
                >
                  <div className={`h-1 rounded-full ${active ? "bg-primary" : done ? "bg-primary/50" : "bg-muted"}`} />
                  <p className={`mt-2 text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>
                    Step {index + 1}
                  </p>
                  <p className={`text-sm ${active ? "text-foreground" : "text-muted-foreground"}`}>
                    {item === "A" ? "Database" : item === "B" ? "Discord" : item === "C" ? "Guild" : "Finalize"}
                  </p>
                </button>
              );
            })}
          </div>

          {phase === "A" ? (
            <div className="space-y-3 rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-medium">A1. Configure Supabase Database</p>
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
                <pre className="max-h-56 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-[11px] leading-5 text-foreground">
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
            </div>
          ) : null}

          {phase === "B" ? (
            <div className="space-y-3">
              <DiscordSubstepCard
                step={1}
                title="Configure Discord App Basics"
                done={discordStep1Done}
              >
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
              </DiscordSubstepCard>

              <DiscordSubstepCard
                step={2}
                title="Login with Discord"
                done={discordStep2Done}
              >
                <p className="text-sm text-muted-foreground">You are signed in as <strong>{currentUserId}</strong>.</p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/api/auth/signout">Switch account</Link>
                </Button>
              </DiscordSubstepCard>

              <DiscordSubstepCard
                step={3}
                title="Claim Setup Owner"
                done={discordStep3Done}
              >
                <p className="text-sm text-muted-foreground">
                  Current owner: <code>{setup?.ownerDiscordId || "(not claimed)"}</code>
                </p>
                <Button
                  onClick={claimOwner}
                  disabled={busyKey === "claim" || ownerClaimedByCurrentUser}
                >
                  {ownerClaimedByCurrentUser ? "Owner Claimed" : "Claim Setup Owner"}
                </Button>
              </DiscordSubstepCard>

              <DiscordSubstepCard
                step={4}
                title="Confirm Discord App and Save Bot Token"
                done={discordStep4Done}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="discord-client-id-confirm" className="text-sm font-medium">Discord Client ID</label>
                    <Input
                      id="discord-client-id-confirm"
                      value={discordClientIdInput}
                      onChange={(event) => setDiscordClientIdInput(event.target.value)}
                      placeholder="1234567890"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="discord-client-secret-confirm" className="text-sm font-medium">Discord Client Secret</label>
                    <Input
                      id="discord-client-secret-confirm"
                      type="password"
                      value={discordClientSecretInput}
                      onChange={(event) => setDiscordClientSecretInput(event.target.value)}
                      placeholder={setup?.discordClientSecretSet ? "Secret already saved" : "Paste secret"}
                    />
                  </div>
                </div>
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
              </DiscordSubstepCard>
            </div>
          ) : null}

          {phase === "C" ? (
            <div className="space-y-3">
              <GuildSubstepCard
                step={1}
                title="Add Guild ID"
                done={guildStep1Done}
              >
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
              </GuildSubstepCard>

              <GuildSubstepCard
                step={2}
                title="Invite Bot"
                done={guildStep2Done}
              >
                <p className="text-xs text-muted-foreground">Skippable step.</p>
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
              </GuildSubstepCard>

              <GuildSubstepCard
                step={3}
                title="Set Up Channels"
                done={guildStep3Done}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={loadChannels} disabled={busyKey === "channels-load" || !setup?.selectedGuildId}>
                    {busyKey === "channels-load" ? "Loading..." : hasLoadedTextChannels ? "Reload Text Channels" : "Load Text Channels"}
                  </Button>
                  {!hasLoadedTextChannels ? (
                    <span className="text-xs text-muted-foreground">Load text channels before choosing log or LFG channels.</span>
                  ) : (
                    <span className="text-xs text-emerald-300">{textChannels.length} text channels loaded.</span>
                  )}
                </div>

                {channelLoadSuccess ? (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 shadow-sm shadow-emerald-500/10 animate-pulse">
                    <CheckCircle2 className="h-4 w-4" />
                    Text channels loaded successfully. Pick your log channel below.
                  </div>
                ) : null}

                {channelLoadWarning ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    {channelLoadWarning}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label htmlFor="log-channel" className="text-sm font-medium">Log Channel (required)</label>
                  <select
                    id="log-channel"
                    className={`w-full rounded-md border border-border bg-background px-3 py-2 text-sm transition-opacity ${hasLoadedTextChannels ? "" : "cursor-not-allowed opacity-50"}`}
                    value={logChannelId}
                    onChange={(event) => setLogChannelId(event.target.value)}
                    disabled={!hasLoadedTextChannels}
                  >
                    <option value="">{hasLoadedTextChannels ? "Select channel" : "Load text channels first"}</option>
                    {textChannels.map((channel) => (
                      <option key={channel.id} value={channel.id}>{channel.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="lfg-channel" className="text-sm font-medium">LFG Channel (optional)</label>
                  <select
                    id="lfg-channel"
                    className={`w-full rounded-md border border-border bg-background px-3 py-2 text-sm transition-opacity ${hasLoadedTextChannels ? "" : "cursor-not-allowed opacity-50"}`}
                    value={lfgChannelId}
                    onChange={(event) => setLfgChannelId(event.target.value)}
                    disabled={!hasLoadedTextChannels}
                  >
                    <option value="">{hasLoadedTextChannels ? "Use fallback behavior" : "Load text channels first"}</option>
                    {textChannels.map((channel) => (
                      <option key={channel.id} value={channel.id}>{channel.name}</option>
                    ))}
                  </select>
                </div>
                <Button onClick={saveChannels} disabled={busyKey === "channels-save" || !hasLoadedTextChannels || !logChannelId}>
                  Save Channel Setup
                </Button>
              </GuildSubstepCard>
            </div>
          ) : null}

          {phase === "FINAL" ? (
            <div className="space-y-3 rounded-lg border border-border bg-background p-4">
              <h3 className="text-lg font-semibold">Ready to finalize</h3>
              <p className="text-sm text-muted-foreground">Review completion checks before continuing.</p>
              <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                <li>Database validated: {setup?.databaseValidatedAt ? "Yes" : "No"}</li>
                <li>Discord app configured: {setup?.discordClientId && setup?.discordClientSecretSet ? "Yes" : "No"}</li>
                <li>Bot token saved: {setup?.botTokenSet ? "Yes" : "No"}</li>
                <li>Owner claimed: {setup?.ownerDiscordId ? "Yes" : "No"}</li>
                <li>Guild selected: {setup?.selectedGuildId ? "Yes" : "No"}</li>
                <li>Channels saved: {setup?.logChannelId ? "Yes" : "No"}</li>
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!previousPhase}
            onClick={() => {
              if (previousPhase) setPhase(previousPhase);
            }}
          >
            Back
          </Button>
          <Button asChild type="button" variant="ghost" size="sm">
            <Link href="/">Cancel</Link>
          </Button>
          <span className="text-xs text-muted-foreground">Draft setup saved automatically</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => {
              if (phase === "FINAL") {
                completeSetup().catch(() => null);
                return;
              }
              if (nextPhase) setPhase(nextPhase);
            }}
            disabled={nextDisabled || busyKey === "complete"}
          >
            {nextButtonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
