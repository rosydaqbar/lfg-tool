"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { useDashboardI18n } from "@/components/dashboard/dashboard-i18n";

export function SignOutButton() {
  const { t } = useDashboardI18n();

  return (
    <Button variant="outline" onClick={() => signOut()}>
      <LogOut className="mr-2 h-4 w-4" />
      {t("common.signOut", "Sign out")}
    </Button>
  );
}
