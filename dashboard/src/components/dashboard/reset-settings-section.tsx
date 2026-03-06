import { memo, useState } from "react";
import { AlertTriangle } from "lucide-react";
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
  onResetComplete: () => void;
};

function ResetSettingsSectionComponent({
  selectedGuildId,
  onResetComplete,
}: ResetSettingsSectionProps) {
  const [confirmValue, setConfirmValue] = useState("");
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const trimmedGuildId = selectedGuildId.trim();
  const isConfirmMatch = confirmValue.trim() === trimmedGuildId;

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
      onResetComplete();
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
  );
}

export const ResetSettingsSection = memo(ResetSettingsSectionComponent);
