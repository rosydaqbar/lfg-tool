export type Locale = "en" | "id";

export const SUPPORTED_LOCALES: Locale[] = ["en", "id"];

export function normalizeLocale(value: unknown): Locale {
  return value === "id" ? "id" : "en";
}

const dictionary = {
  en: {
    spamCatcherNotice: {
      title: "# 🚫 Do Not Send Messages in This Channel",
      body: "⚠️ This channel is made to catch spammers. If you send a message in this channel, {action} {appeal}",
      warningTitle: "## 😈 Don't Even Think About Trying",
      warningBody: "Even if you are just testing, the system will still catch you.",
      caughtCount: "-# Caught users in this channel: `{count}`",
      integrityCount: "-# Humans who read this message: `{count}`",
      integrityButton: "I have read this ✅",
      actionImmediate: "you will be `banned` immediately.",
      actionAfterTimeout:
        "you will receive a `timeout` for {timeout}, then be `banned` when the timeout ends.",
      actionDelayed:
        "you will receive a `timeout` for {timeout}, then be `banned` after a {delay} appeal window.",
      actionTimeoutOnly: "you will receive a `timeout` for {timeout}.",
      appealImmediate: "If this was a mistake, please contact a server admin.",
      appealTimeout:
        "If you are timed out, please send a private message to one of the online admins or use the appeal button if available.",
    },
  },
  id: {
    spamCatcherNotice: {
      title: "# 🚫 Dilarang Mengirim Pesan di Channel Ini",
      body: "⚠️ Channel ini dibuat untuk menangkap spammer. Jika kamu mengirim pesan di channel ini, {action} {appeal}",
      warningTitle: "## 😈 Jangan Berani-Berani Mencoba",
      warningBody: "Kalau cuma mau tes, sistem tetap akan menangkap kamu.",
      caughtCount: "-# Jumlah user yang sudah tertangkap di channel ini: `{count}`",
      integrityCount: "-# Manusia yang membaca pesan ini: `{count}`",
      integrityButton: "Saya sudah membaca ✅",
      actionImmediate: "kamu akan langsung terkena `ban`.",
      actionAfterTimeout:
        "kamu akan terkena `timeout` selama {timeout}, lalu terkena `ban` saat timeout berakhir.",
      actionDelayed:
        "kamu akan terkena `timeout` selama {timeout}, lalu terkena `ban` setelah periode appeal selama {delay}.",
      actionTimeoutOnly: "kamu akan terkena `timeout` selama {timeout}.",
      appealImmediate: "Jika ini adalah kesalahan, silakan hubungi admin server.",
      appealTimeout:
        "Jika kamu terkena timeout, silakan kirim private message ke salah satu admin yang sedang online atau gunakan tombol appeal jika tersedia.",
    },
  },
} as const;

export function spamCatcherNoticeStrings(locale: Locale) {
  return dictionary[locale].spamCatcherNotice;
}

export function interpolate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
}
