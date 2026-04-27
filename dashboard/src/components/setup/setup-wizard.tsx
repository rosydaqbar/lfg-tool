"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
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

const BOT_INVITE_PERMISSIONS = "288427024";
const SETUP_ACTIVE_STORAGE_KEY = "lfg-tool.setup-active";
const SETUP_ABANDON_ENDPOINT = "/api/setup/abandon";
const OAUTH_REDIRECT_URI = "http://localhost:3000/api/auth/callback/discord";

function createBotInviteUrl(clientId: string, guildId?: string | null) {
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: BOT_INVITE_PERMISSIONS,
    scope: "bot applications.commands",
  });
  if (guildId) {
    params.set("guild_id", guildId);
    params.set("disable_guild_select", "true");
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function SetupWizard({ currentUserId }: { currentUserId: string }) {
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [discordClientIdInput, setDiscordClientIdInput] = useState("");
  const [discordClientSecretInput, setDiscordClientSecretInput] = useState("");
  const [oauthCopied, setOauthCopied] = useState(false);

  const [tokenInput, setTokenInput] = useState("");
  const [guildIdInput, setGuildIdInput] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [alreadyInvited, setAlreadyInvited] = useState<boolean | null>(null);
  const [guildValidateSuccess, setGuildValidateSuccess] = useState(false);
  const [inviteCheckFeedback, setInviteCheckFeedback] = useState<"present" | "missing" | null>(null);

  const [dbUrlInput, setDbUrlInput] = useState("");
  const [databaseValidateSuccess, setDatabaseValidateSuccess] = useState(false);
  const [applySchema, setApplySchema] = useState(true);
  const [schemaSql, setSchemaSql] = useState("");
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaCopied, setSchemaCopied] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);

  const [textChannels, setTextChannels] = useState<TextChannel[]>([]);
  const [channelLoadWarning, setChannelLoadWarning] = useState<string | null>(null);
  const [channelLoadSuccess, setChannelLoadSuccess] = useState(false);
  const [logChannelId, setLogChannelId] = useState("");
  const [lfgChannelId, setLfgChannelId] = useState("");

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<SetupPhase>("A");
  const [discordSubstep, setDiscordSubstep] = useState<1 | 2 | 3 | 4>(1);
  const [guildSubstep, setGuildSubstep] = useState<1 | 2 | 3>(1);
  const skipAbandonResetRef = useRef(false);
  const setupCompleteRef = useRef(false);
  const setupVisitInitializedRef = useRef(false);
  const revisitResetStartedRef = useRef(false);

  setupCompleteRef.current = Boolean(setup?.setupComplete);

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
    setGuildValidateSuccess(false);
    setInviteUrl(null);
    setAlreadyInvited(null);
    setInviteCheckFeedback(null);
    try {
      const response = await fetch("/api/setup/guild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: guildIdInput.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Failed to save guild");
      await reloadState();
      setGuildValidateSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save guild");
    } finally {
      setBusyKey(null);
    }
  }

  async function checkInvite() {
    setBusyKey("invite");
    setError(null);
    setInviteCheckFeedback(null);
    try {
      const response = await fetch("/api/setup/invite", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; inviteUrl?: string | null; alreadyInvited?: boolean }
        | null;
      if (!response.ok) throw new Error(payload?.error || "Failed to check invite");
      setInviteUrl(payload?.inviteUrl ?? null);
      const botAlreadyInvited = payload?.alreadyInvited ?? false;
      setAlreadyInvited(botAlreadyInvited);
      setInviteCheckFeedback(botAlreadyInvited ? "present" : "missing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check invite status");
    } finally {
      setBusyKey(null);
    }
  }

  async function validateDatabase() {
    setBusyKey("database");
    setError(null);
    setDatabaseValidateSuccess(false);
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
      setDatabaseValidateSuccess(true);
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

  async function copyOAuthRedirectUri() {
    try {
      await navigator.clipboard.writeText(OAUTH_REDIRECT_URI);
      setOauthCopied(true);
      setTimeout(() => setOauthCopied(false), 1600);
    } catch {
      setError("Failed to copy OAuth redirect URI. Copy it manually from the text block.");
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
      skipAbandonResetRef.current = true;
      window.localStorage.removeItem(SETUP_ACTIVE_STORAGE_KEY);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete setup");
    } finally {
      setBusyKey(null);
    }
  }

  function sendAbandonReset() {
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(SETUP_ABANDON_ENDPOINT, new Blob([], { type: "text/plain" }));
        return;
      }
    } catch {
      // fall back to fetch below
    }

    fetch(SETUP_ABANDON_ENDPOINT, { method: "POST", keepalive: true }).catch(() => null);
  }

  async function resetAbandonedSetupDraft() {
    const response = await fetch(SETUP_ABANDON_ENDPOINT, { method: "POST" });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error || "Failed to reset incomplete setup");
    }
  }

  async function leaveSetup() {
    if (setup?.setupComplete) {
      window.location.href = "/";
      return;
    }

    const confirmed = window.confirm(
      "Leaving setup will reset your unfinished setup progress. Continue?"
    );
    if (!confirmed) return;

    setBusyKey("setup-abandon");
    setError(null);
    try {
      skipAbandonResetRef.current = true;
      await resetAbandonedSetupDraft();
      window.localStorage.removeItem(SETUP_ACTIVE_STORAGE_KEY);
      window.location.href = "/";
    } catch (err) {
      skipAbandonResetRef.current = false;
      setError(err instanceof Error ? err.message : "Failed to reset incomplete setup");
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
  const inviteGuildId = setup?.selectedGuildId || guildIdInput.trim() || null;
  const directInviteUrl = setup?.discordClientId
    ? createBotInviteUrl(setup.discordClientId, inviteGuildId)
    : null;
  const activeInviteUrl = inviteUrl || directInviteUrl;
  const channelSelectClass = `w-full appearance-none rounded-md border border-border bg-background px-3 py-2 pr-10 text-sm leading-6 transition focus:outline-none focus:ring-2 focus:ring-primary/40 ${
    hasLoadedTextChannels ? "text-foreground" : "cursor-not-allowed text-muted-foreground opacity-50"
  }`;

  useEffect(() => {
    if (!channelLoadSuccess) return;
    const timeout = window.setTimeout(() => setChannelLoadSuccess(false), 2600);
    return () => window.clearTimeout(timeout);
  }, [channelLoadSuccess]);

  useEffect(() => {
    if (!setup || setup.setupComplete || setupVisitInitializedRef.current || revisitResetStartedRef.current) {
      if (setup?.setupComplete) {
        window.localStorage.removeItem(SETUP_ACTIVE_STORAGE_KEY);
      }
      return;
    }

    setupVisitInitializedRef.current = true;
    const hasActiveSetupDraft = window.localStorage.getItem(SETUP_ACTIVE_STORAGE_KEY) === "1";
    window.localStorage.setItem(SETUP_ACTIVE_STORAGE_KEY, "1");
    if (!hasActiveSetupDraft) return;

    revisitResetStartedRef.current = true;
    setBusyKey("setup-revisit-reset");
    setError(null);
    resetAbandonedSetupDraft()
      .then(() => reloadState())
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to reset incomplete setup");
      })
      .finally(() => {
        setBusyKey(null);
      });
  }, [setup]);

  useEffect(() => {
    const shouldBlock = () => !skipAbandonResetRef.current && !setupCompleteRef.current;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!shouldBlock()) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const handlePageHide = () => {
      if (!shouldBlock()) return;
      window.localStorage.setItem(SETUP_ACTIVE_STORAGE_KEY, "1");
      sendAbandonReset();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  useEffect(() => {
    if (!databaseValidateSuccess) return;
    const timeout = window.setTimeout(() => setDatabaseValidateSuccess(false), 2600);
    return () => window.clearTimeout(timeout);
  }, [databaseValidateSuccess]);

  useEffect(() => {
    if (!guildValidateSuccess) return;
    const timeout = window.setTimeout(() => setGuildValidateSuccess(false), 2600);
    return () => window.clearTimeout(timeout);
  }, [guildValidateSuccess]);

  useEffect(() => {
    if (!inviteCheckFeedback) return;
    const timeout = window.setTimeout(() => setInviteCheckFeedback(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [inviteCheckFeedback]);

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
          className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/20 disabled:hover:bg-transparent"
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
        {open ? <div className="setup-accordion-panel space-y-4 border-t border-border px-4 py-4">{children}</div> : null}
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
          className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/20 disabled:hover:bg-transparent"
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
        {open ? <div className="setup-accordion-panel space-y-4 border-t border-border px-4 py-4">{children}</div> : null}
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

  const finalStatusItems = [
    {
      title: "Database",
      ready: isDatabaseReady,
      detail: setup?.databaseValidatedAt
        ? `Supabase connection validated at ${new Date(setup.databaseValidatedAt).toLocaleString()}.`
        : "Supabase connection has not been validated yet.",
      issue: isDatabaseReady ? null : "Validate the database in Step 1 before completing setup.",
    },
    {
      title: "Discord App",
      ready: discordStep1Done,
      detail: discordStep1Done
        ? "Client ID is saved and the client secret is stored securely."
        : "Discord application credentials are incomplete.",
      issue: discordStep1Done ? null : "Save the Discord Client ID and Client Secret in Step 2.",
    },
    {
      title: "Bot Token",
      ready: discordStep4Done,
      detail: discordStep4Done
        ? setup?.botDisplayName
          ? `Bot token validated for ${setup.botDisplayName}.`
          : "Bot token is saved and ready for runtime use."
        : "Bot token has not been validated yet.",
      issue: discordStep4Done ? null : "Validate and save the Discord Bot Token in Step 2.",
    },
    {
      title: "Setup Owner",
      ready: discordStep3Done,
      detail: discordStep3Done
        ? `Setup owner is your Discord account (${currentUserId}).`
        : setup?.ownerDiscordId
          ? `Setup owner is ${setup.ownerDiscordId}, not the current account.`
          : "Setup owner has not been claimed.",
      issue: discordStep3Done ? null : "Claim setup ownership with the Discord account that should manage this dashboard.",
    },
    {
      title: "Guild",
      ready: guildStep1Done,
      detail: guildStep1Done
        ? `Configured server ID: ${setup?.selectedGuildId}.`
        : "No Discord server ID is configured.",
      issue: guildStep1Done ? null : "Validate the Guild ID in Step 3.",
    },
    {
      title: "Channels",
      ready: guildStep3Done,
      detail: guildStep3Done
        ? `Log channel is set to ${setup?.logChannelId}. ${setup?.lfgChannelId ? `LFG channel is set to ${setup.lfgChannelId}.` : "LFG channel will use fallback behavior."}`
        : "Log channel has not been selected.",
      issue: guildStep3Done ? null : "Load text channels and select a required log channel in Step 3.",
    },
  ];

  const finalPotentialIssues = [
    ...(alreadyInvited === true
      ? []
      : [
          alreadyInvited === false
            ? "Bot was not confirmed in the server. Use Invite Bot to Server, authorize it, then recheck status."
            : "Invite status has not been checked in this session. Check it if this is a fresh server setup.",
        ]),
    ...(!setup?.lfgChannelId
      ? ["No dedicated LFG channel is selected. LFG posts will use fallback behavior unless you set one."]
      : []),
    ...finalStatusItems
      .filter((item) => item.issue)
      .map((item) => item.issue as string),
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-lg shadow-black/5 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            Setup Wizard
          </h2>
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
                  <div className={`h-1 rounded-full transition-colors duration-200 ${active ? "bg-primary" : done ? "bg-primary/50" : "bg-muted"}`} />
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
            <div className="setup-step-panel space-y-4 rounded-lg border border-border bg-background p-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="db-url" className="text-sm font-semibold">Database URL</label>
                  <span className="rounded-full border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                    Required
                  </span>
                </div>
                <Input
                  id="db-url"
                  type="password"
                  value={dbUrlInput}
                  onChange={(event) => setDbUrlInput(event.target.value)}
                  placeholder="postgresql://...:6543/postgres?sslmode=require"
                />
                <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs leading-5 text-foreground">
                  <p className="font-semibold">Supabase connection details</p>
                  <p className="text-muted-foreground">
                    Use the Supabase Transaction Pooler URL on port <code>6543</code> and include <code>sslmode=require</code>.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={applySchema}
                  onChange={(event) => setApplySchema(event.target.checked)}
                />
                Apply baseline schema check
              </label>

              <div className="rounded-lg border border-border bg-muted/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">Schema SQL</p>
                    <p className="text-xs text-muted-foreground">
                      Baseline schema from <code>scripts/schema-postgres.sql</code>.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copySchemaSql}
                      disabled={!schemaSql.trim()}
                    >
                      {schemaCopied ? "Copied" : "Copy SQL"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSchemaOpen((current) => !current)}
                    >
                      {schemaOpen ? "Hide SQL" : "Show SQL"}
                      {schemaOpen ? <ChevronDown className="ml-1 h-4 w-4" /> : <ChevronRight className="ml-1 h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                {schemaOpen ? (
                  <pre className="mt-3 max-h-56 overflow-auto rounded-md border border-border bg-background p-3 text-[11px] leading-5 text-foreground">
                    <code>{schemaLoading ? "Loading schema SQL..." : schemaSql || "Schema SQL unavailable."}</code>
                  </pre>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={validateDatabase} disabled={busyKey === "database" || !dbUrlInput.trim()}>
                  {busyKey === "database" ? "Validating..." : "Validate Database"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {setup?.databaseValidatedAt ? `Validated at ${new Date(setup.databaseValidatedAt).toLocaleString()}` : "Not validated yet"}
                </span>
              </div>
              {databaseValidateSuccess ? (
                <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 shadow-sm shadow-emerald-500/10 animate-pulse">
                  <CheckCircle2 className="h-4 w-4" />
                  Database validated successfully. Continue to Discord setup.
                </div>
              ) : null}
            </div>
          ) : null}

          {phase === "B" ? (
            <div className="setup-step-panel space-y-3">
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
                <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">Required OAuth2 Redirect URI</p>
                      <p>Add this exact URI in Discord Developer Portal - OAuth2 - Redirects.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={copyOAuthRedirectUri}>
                      {oauthCopied ? "Copied" : "Copy OAuth URI"}
                    </Button>
                  </div>
                  <code className="block rounded bg-background px-2 py-1 break-all">
                    {OAUTH_REDIRECT_URI}
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
                <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="bot-token" className="text-sm font-semibold">Discord Bot Token</label>
                    <span className="rounded-full border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                      Required
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Paste the bot token from Discord Developer Portal. This is the only value needed in this step.
                  </p>
                  <Input
                    id="bot-token"
                    type="password"
                    value={tokenInput}
                    onChange={(event) => setTokenInput(event.target.value)}
                    placeholder={setup?.botTokenSet ? "Token already saved" : "Paste token"}
                  />
                </div>
                {setup?.botDisplayName ? (
                  <p className="text-sm text-muted-foreground">Bot detected: <strong>{setup.botDisplayName}</strong></p>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                    <p className="font-semibold text-foreground">Discord Client ID</p>
                    <p className="text-muted-foreground">Saved from the Discord app setup step.</p>
                    <code className="mt-2 block rounded bg-background px-2 py-1 break-all text-foreground">
                      {setup?.discordClientId || discordClientIdInput || "Not saved"}
                    </code>
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                    <p className="font-semibold text-foreground">Discord Client Secret</p>
                    <p className="text-muted-foreground">Stored securely and hidden after saving.</p>
                    <p className="mt-2 rounded bg-background px-2 py-1 text-foreground">
                      {setup?.discordClientSecretSet ? "Secret already saved" : "Not saved"}
                    </p>
                  </div>
                </div>

                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">OAuth2 Redirect URI</p>
                      <p>Copy this into Discord Developer Portal - OAuth2 - Redirects.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={copyOAuthRedirectUri}>
                      {oauthCopied ? "Copied" : "Copy OAuth URI"}
                    </Button>
                  </div>
                  <code className="block rounded bg-background px-2 py-1 break-all text-foreground">
                    {OAUTH_REDIRECT_URI}
                  </code>
                </div>

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
            <div className="setup-step-panel space-y-3">
              <GuildSubstepCard
                step={1}
                title="Add Guild ID"
                done={guildStep1Done}
              >
                <label htmlFor="guild-id" className="text-sm font-medium">Guild ID</label>
                <Input
                  id="guild-id"
                  value={guildIdInput}
                  onChange={(event) => {
                    setGuildIdInput(event.target.value);
                    setGuildValidateSuccess(false);
                    setInviteUrl(null);
                    setAlreadyInvited(null);
                    setInviteCheckFeedback(null);
                  }}
                  placeholder="670147766839803924"
                />
                <Button onClick={saveGuild} disabled={busyKey === "guild" || !guildIdInput.trim()}>
                  {busyKey === "guild" ? "Validating..." : guildStep1Done ? "Revalidate Guild" : "Validate Guild"}
                </Button>
                {guildValidateSuccess ? (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 shadow-sm shadow-emerald-500/10 animate-pulse">
                    <CheckCircle2 className="h-4 w-4" />
                    Guild ID validated successfully. Continue with the bot invite check.
                  </div>
                ) : null}
              </GuildSubstepCard>

              <GuildSubstepCard
                step={2}
                title="Invite Bot"
                done={guildStep2Done}
              >
                <p className="text-xs text-muted-foreground">
                  Invite the bot to this server, then use the status check to confirm Discord sees it.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={checkInvite} disabled={busyKey === "invite" || !setup?.selectedGuildId}>
                    {busyKey === "invite" ? "Checking..." : alreadyInvited === null ? "Check Invite Status" : "Recheck Invite Status"}
                  </Button>
                  {activeInviteUrl ? (
                    <Button asChild variant="outline">
                      <a href={activeInviteUrl} target="_blank" rel="noreferrer">
                        Invite Bot to Server
                      </a>
                    </Button>
                  ) : null}
                </div>
                {!activeInviteUrl ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    Save your Discord Client ID first to generate the bot invite link.
                  </div>
                ) : null}
                {alreadyInvited !== null ? (
                  <div
                    className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs shadow-sm ${
                      alreadyInvited
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 shadow-emerald-500/10"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-200 shadow-amber-500/10"
                    } ${inviteCheckFeedback ? "animate-pulse" : ""}`}
                  >
                    {alreadyInvited ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <ChevronRight className="mt-0.5 h-4 w-4" />}
                    <div className="space-y-1">
                      <p className="font-medium">
                        {alreadyInvited ? "Bot is already invited." : "Bot is not in this guild yet."}
                      </p>
                      <p>
                        {alreadyInvited
                          ? "You can continue to channel setup."
                          : "Use the invite button, authorize the bot, then recheck the status."}
                      </p>
                    </div>
                  </div>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="log-channel" className="text-sm font-semibold">Log Channel</label>
                    <span className="rounded-full border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                      Required
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Receives setup alerts, bot errors, voice activity logs, and operational notices.
                  </p>
                  <div className="relative">
                    <select
                      id="log-channel"
                      className={channelSelectClass}
                      value={logChannelId}
                      onChange={(event) => setLogChannelId(event.target.value)}
                      disabled={!hasLoadedTextChannels}
                    >
                      <option value="">{hasLoadedTextChannels ? "Select channel" : "Load text channels first"}</option>
                      {textChannels.map((channel) => (
                        <option key={channel.id} value={channel.id}>{channel.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pick a text channel the bot can view and send messages in.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="lfg-channel" className="text-sm font-semibold">LFG Channel</label>
                    <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Optional
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Destination for LFG posts sent from Join-to-Create voice controls.
                  </p>
                  <div className="relative">
                    <select
                      id="lfg-channel"
                      className={channelSelectClass}
                      value={lfgChannelId}
                      onChange={(event) => setLfgChannelId(event.target.value)}
                      disabled={!hasLoadedTextChannels}
                    >
                      <option value="">{hasLoadedTextChannels ? "Use fallback behavior" : "Load text channels first"}</option>
                      {textChannels.map((channel) => (
                        <option key={channel.id} value={channel.id}>{channel.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave empty to fall back to the log channel behavior.
                  </p>
                </div>
                <Button onClick={saveChannels} disabled={busyKey === "channels-save" || !hasLoadedTextChannels || !logChannelId}>
                  Save Channel Setup
                </Button>
              </GuildSubstepCard>
            </div>
          ) : null}

          {phase === "FINAL" ? (
            <div className="setup-step-panel space-y-5 rounded-lg border border-border bg-background p-5">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                    canFinalize
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  }`}
                >
                  {canFinalize ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                </span>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">
                    {canFinalize ? "Ready to complete setup" : "Setup needs attention"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Review each setup area before launching the dashboard and bot runtime.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {finalStatusItems.map((item) => (
                  <div
                    key={item.title}
                    className={`rounded-lg border px-4 py-3 ${
                      item.ready
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-amber-500/35 bg-amber-500/10"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                          item.ready
                            ? "border-emerald-500/40 text-emerald-300"
                            : "border-amber-500/40 text-amber-300"
                        }`}
                      >
                        {item.ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                      </span>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{item.title}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              item.ready
                                ? "bg-emerald-500/15 text-emerald-200"
                                : "bg-amber-500/15 text-amber-200"
                            }`}
                          >
                            {item.ready ? "Ready" : "Needs action"}
                          </span>
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">{item.detail}</p>
                        {item.issue ? (
                          <p className="text-xs leading-5 text-amber-200">{item.issue}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className={`rounded-lg border px-4 py-3 ${
                  finalPotentialIssues.length > 0
                    ? "border-amber-500/35 bg-amber-500/10"
                    : "border-emerald-500/30 bg-emerald-500/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                      finalPotentialIssues.length > 0
                        ? "border-amber-500/40 text-amber-300"
                        : "border-emerald-500/40 text-emerald-300"
                    }`}
                  >
                    {finalPotentialIssues.length > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  </span>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">
                      {finalPotentialIssues.length > 0 ? "Potential issues" : "No potential issues detected"}
                    </p>
                    {finalPotentialIssues.length > 0 ? (
                      <div className="space-y-1 text-xs leading-5 text-amber-100">
                        {finalPotentialIssues.map((issue) => (
                          <p key={issue}>{issue}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs leading-5 text-muted-foreground">
                        Required setup is complete and no optional warnings are currently visible.
                      </p>
                    )}
                  </div>
                </div>
              </div>
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              leaveSetup().catch(() => null);
            }}
            disabled={busyKey === "setup-abandon"}
          >
            Cancel
          </Button>
          <span className="text-xs text-muted-foreground">Leaving or refreshing resets unfinished setup.</span>
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
