"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import {
  normalizeDashboardLocale,
  translateDashboard,
  type DashboardLocale,
  type TranslationVariables,
} from "@/i18n";

type DashboardI18nValue = {
  locale: DashboardLocale;
  t: (
    key: string,
    fallback?: string,
    variables?: TranslationVariables
  ) => string;
};

const DashboardI18nContext = createContext<DashboardI18nValue | null>(null);

export function DashboardI18nProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: DashboardLocale;
}) {
  const normalizedLocale = normalizeDashboardLocale(locale);

  useEffect(() => {
    document.documentElement.lang = normalizedLocale;
  }, [normalizedLocale]);

  return (
    <DashboardI18nContext.Provider
      value={{
        locale: normalizedLocale,
        t: (key, fallback, variables) =>
          translateDashboard(normalizedLocale, key, fallback, variables),
      }}
    >
      {children}
    </DashboardI18nContext.Provider>
  );
}

export function useDashboardI18n() {
  const context = useContext(DashboardI18nContext);
  if (!context) {
    throw new Error("useDashboardI18n must be used inside DashboardI18nProvider");
  }
  return context;
}
