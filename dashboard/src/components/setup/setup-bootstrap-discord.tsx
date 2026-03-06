"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SetupBootstrapDiscordApp() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveDiscordApp() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/setup/bootstrap-discord-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to save Discord app credentials");
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save credentials");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="bootstrap-client-id" className="text-sm font-medium">
          Discord Client ID
        </label>
        <Input
          id="bootstrap-client-id"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          placeholder="1234567890"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="bootstrap-client-secret" className="text-sm font-medium">
          Discord Client Secret
        </label>
        <Input
          id="bootstrap-client-secret"
          type="password"
          value={clientSecret}
          onChange={(event) => setClientSecret(event.target.value)}
          placeholder="Paste secret"
        />
      </div>

      <Button onClick={saveDiscordApp} disabled={busy || !clientId.trim() || !clientSecret.trim()}>
        Save and Enable Login
      </Button>
    </div>
  );
}
