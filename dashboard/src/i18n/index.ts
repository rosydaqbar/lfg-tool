import en from "@/i18n/locales/en";
import id from "@/i18n/locales/id";

export type DashboardLocale = "en" | "id";
export type DashboardMessages = {
  [key: string]: string | DashboardMessages;
};
export type TranslationVariables = Record<string, string | number>;

const dictionaries: Record<DashboardLocale, DashboardMessages> = {
  en: en as DashboardMessages,
  id: id as DashboardMessages,
};

export function normalizeDashboardLocale(value: unknown): DashboardLocale {
  return value === "id" ? "id" : "en";
}

function resolveMessage(messages: DashboardMessages, key: string) {
  let value: string | DashboardMessages | undefined = messages;
  for (const part of key.split(".")) {
    if (!value || typeof value === "string") return undefined;
    value = value[part];
  }
  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, variables: TranslationVariables = {}) {
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    String(variables[name] ?? "")
  );
}

export function translateDashboard(
  locale: DashboardLocale,
  key: string,
  fallback = key,
  variables: TranslationVariables = {}
) {
  const normalizedLocale = normalizeDashboardLocale(locale);
  const template =
    resolveMessage(dictionaries[normalizedLocale], key) ??
    resolveMessage(dictionaries.en, key) ??
    fallback;
  return interpolate(template, variables);
}
