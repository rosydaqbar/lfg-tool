import { memo } from "react";
import { Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { dashboardCard } from "@/components/ui/patterns";
import { useDashboardI18n } from "@/components/dashboard/dashboard-i18n";

const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "id", label: "Indonesia (Bahasa Indonesia)" },
] as const;

type LocalizationSectionProps = {
  loadingConfig: boolean;
  saving: boolean;
  value: "en" | "id";
  onChange: (next: "en" | "id") => void;
  onSave: () => void;
};

function LocalizationSectionComponent({
  loadingConfig,
  saving,
  value,
  onChange,
  onSave,
}: LocalizationSectionProps) {
  const { t } = useDashboardI18n();

  return (
    <Card className={`${dashboardCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-[350ms]`}>
      <CardHeader className="space-y-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Languages className="h-4 w-4" />
          {t("settings.language.title", "Language")}
        </CardTitle>
        <CardDescription>
          {t(
            "settings.language.description",
            "Sets one language for this server's dashboard and Discord bot output."
          )}
        </CardDescription>
        <Separator />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
          <div className="text-sm font-medium">
            {t("settings.language.label", "Language")}
          </div>
          <div className="mt-2">
            <Select
              value={value}
              onValueChange={(next) => onChange(next === "id" ? "id" : "en")}
              disabled={loadingConfig || saving}
            >
              <SelectTrigger className="h-11 w-full sm:w-72">
                <SelectValue
                  placeholder={t(
                    "settings.language.placeholder",
                    "Select language"
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {LOCALE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {t(
              "settings.language.help",
              "Dashboard translations use English as a fallback when a translated string is unavailable. New bot panels, notices, and DMs use the same setting."
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/70 pt-4">
          <Button onClick={onSave} disabled={saving || loadingConfig}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("common.saveConfiguration", "Save configuration")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const LocalizationSection = memo(LocalizationSectionComponent);
