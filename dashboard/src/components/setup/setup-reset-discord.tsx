"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SetupResetDiscordButton({
  endpoint,
  label = "Reset saved credentials",
}: {
  endpoint: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to reset credentials");
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset credentials");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" onClick={reset} disabled={busy}>
        {label}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
