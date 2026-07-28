"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import { useDashboardI18n } from "@/components/dashboard/dashboard-i18n";

export function ThemeToggle() {
  const { t } = useDashboardI18n();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground">
        <Sun className="h-3.5 w-3.5" />
        <span>{t("common.theme.light", "Light")}</span>
      </div>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground">
      <Sun className="h-3.5 w-3.5" />
      <Switch
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        aria-label={t("common.theme.toggleDarkMode", "Toggle dark mode")}
      />
      <Moon className="h-3.5 w-3.5" />
    </div>
  );
}
