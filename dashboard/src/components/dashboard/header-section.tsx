import { memo } from "react";
import { BadgeCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/sign-out-button";

type HeaderSectionProps = {
  userName: string;
  selectedGuildId: string;
};

function HeaderSectionComponent({ userName, selectedGuildId }: HeaderSectionProps) {
  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Voice Log Console
        </p>
        <h1 className="font-[var(--font-display)] text-4xl text-foreground">
          Welcome back, {userName}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Set log/LFG channels and configure Join-to-Create lobbies.
        </p>
        <Badge variant="outline" className="rounded-full px-3 py-1">
          Guild ID: <span className="font-mono">{selectedGuildId}</span>
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ThemeToggle />
        <Badge variant="secondary" className="gap-2 rounded-full px-4 py-1">
          <BadgeCheck className="h-3.5 w-3.5" />
          Admin
        </Badge>
        <SignOutButton />
      </div>
    </header>
  );
}

export const HeaderSection = memo(HeaderSectionComponent);
