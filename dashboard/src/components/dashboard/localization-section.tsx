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
  return (
    <Card className={`${dashboardCard} animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-[350ms]`}>
      <CardHeader className="space-y-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Languages className="h-4 w-4" />
          Language
        </CardTitle>
        <CardDescription>
          Sets the language the bot uses for this server&apos;s panels, notices, DMs, and replies.
        </CardDescription>
        <Separator />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
          <div className="text-sm font-medium">Bot language</div>
          <div className="mt-2">
            <Select
              value={value}
              onValueChange={(next) => onChange(next === "id" ? "id" : "en")}
              disabled={loadingConfig || saving}
            >
              <SelectTrigger className="h-11 w-full sm:w-72">
                <SelectValue placeholder="Select language" />
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
            New panels, notices, and DMs will use this language. Existing messages keep the language they were sent with until they are refreshed.
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/70 pt-4">
          <Button onClick={onSave} disabled={saving || loadingConfig}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const LocalizationSection = memo(LocalizationSectionComponent);
