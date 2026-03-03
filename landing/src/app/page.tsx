const featureSections = [
  {
    title: "Join-to-Create Voice Channels",
    items: [
      "Turn one lobby into unlimited temporary voice channels",
      "Auto-move owner to their channel and delete when empty",
      "Per-lobby role pairing and independent LFG control",
    ],
  },
  {
    title: "In-Channel Voice Controls",
    items: [
      "Rename, lock/unlock, transfer owner, claim ownership, and region switch",
      "Live settings prompt updates as members join or leave",
      "No command memorization needed, everything is one click away",
    ],
  },
  {
    title: "LFG Posting Flow",
    items: [
      "Post squad calls directly from the voice settings panel",
      "Cooldown protection to prevent channel spam",
      "Persistent LFG listing keeps discoverability high",
    ],
  },
  {
    title: "Voice Logs and Analytics",
    items: [
      "Automatic temp-channel snapshots when channels end",
      "Manual voice-log channels with in-chat session tracking",
      "Global stats from both temp and manual sessions",
    ],
  },
  {
    title: "Actionable Stats",
    items: [
      "`/stats me` for personal progress and activity",
      "Admin user lookup and top leaderboard ranking",
      "Consistent output in command and button flows",
    ],
  },
  {
    title: "Dashboard Control Center",
    items: [
      "Manage lobbies, channels, and role mappings in one place",
      "Track active temp channels and mixed voice-log history",
      "Fine-tune session logging without touching bot code",
    ],
  },
];

const screenshotPlaceholders = [
  "docs/screenshots/bot-join-to-create-prompt.png",
  "docs/screenshots/bot-voice-settings-panel.png",
  "docs/screenshots/bot-lfg-post.png",
  "docs/screenshots/bot-manual-voice-log-panel.png",
  "docs/screenshots/dashboard-settings.png",
  "docs/screenshots/dashboard-voice-log-tab.png",
];

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
      <section className="card relative overflow-hidden p-6 md:p-10">
        <div className="pointer-events-none absolute -left-14 -top-14 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-10 h-52 w-52 rounded-full bg-amber-300/20 blur-3xl" />

        <div className="relative space-y-5">
          <p className="inline-flex rounded-full border border-[--border] bg-[--muted] px-3 py-1 text-xs text-[--muted-foreground]">
            Built for active Discord communities
          </p>
          <h1 className="max-w-3xl text-3xl leading-tight font-semibold md:text-5xl" style={{ fontFamily: "var(--font-fraunces), serif" }}>
            Keep your voice channels organized, discoverable, and measurable.
          </h1>
          <p className="max-w-2xl text-sm text-[--muted-foreground] md:text-base">
            This Discord bot combines Join-to-Create automation, rich voice controls, smart LFG posting,
            and session-level analytics so your server grows without turning into chaos.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://github.com/rosydaqbar/lfg-tool"
              className="rounded-full bg-[--primary] px-5 py-2 text-sm font-medium text-[--primary-foreground]"
            >
              Start Using It
            </a>
            <a
              href="https://github.com/rosydaqbar/lfg-tool#readme"
              className="rounded-full border border-[--border] bg-[--card] px-5 py-2 text-sm font-medium"
            >
              Explore Features
            </a>
          </div>
          <div className="grid gap-3 pt-2 text-xs text-[--muted-foreground] sm:grid-cols-3">
            <div className="rounded-xl border border-[--border] bg-black/10 px-3 py-2">Join-to-Create + ownership flows</div>
            <div className="rounded-xl border border-[--border] bg-black/10 px-3 py-2">Manual + temp voice session logging</div>
            <div className="rounded-xl border border-[--border] bg-black/10 px-3 py-2">Global `/stats` and leaderboard</div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {featureSections.map((section) => (
          <article key={section.title} className="card p-5 md:p-6">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <ul className="mt-3 space-y-2 text-sm text-[--muted-foreground]">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[--primary]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="card p-5 md:p-6">
        <h2 className="text-xl font-semibold">How It Feels in Practice</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-xl border border-[--border] bg-[--muted] p-4">
            <div className="text-xs text-[--muted-foreground]">Step 1</div>
            <div className="mt-1 font-medium">Users join lobby</div>
            <div className="mt-2 text-[--muted-foreground]">Personal squad channel is created instantly.</div>
          </div>
          <div className="rounded-xl border border-[--border] bg-[--muted] p-4">
            <div className="text-xs text-[--muted-foreground]">Step 2</div>
            <div className="mt-1 font-medium">They control session</div>
            <div className="mt-2 text-[--muted-foreground]">Settings, transfer, claim, and LFG are one click away.</div>
          </div>
          <div className="rounded-xl border border-[--border] bg-[--muted] p-4">
            <div className="text-xs text-[--muted-foreground]">Step 3</div>
            <div className="mt-1 font-medium">You track outcomes</div>
            <div className="mt-2 text-[--muted-foreground]">Logs and stats show who is active and for how long.</div>
          </div>
        </div>
      </section>

      <section className="card p-5 md:p-6">
        <h2 className="text-xl font-semibold">Screenshot Placeholders</h2>
        <p className="mt-1 text-sm text-[--muted-foreground]">
          Add these files to show visuals for each feature.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {screenshotPlaceholders.map((path) => (
            <div
              key={path}
              className="rounded-xl border border-dashed border-[--border] bg-[--card] p-3"
            >
              <div className="text-xs text-[--muted-foreground]">{path}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card flex flex-col items-start gap-3 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Ready to level up your community voice flow?</h2>
          <p className="mt-1 text-sm text-[--muted-foreground]">
            Deploy the bot, map your lobbies, and start tracking real voice engagement.
          </p>
        </div>
        <a
          href="https://github.com/rosydaqbar/lfg-tool#readme"
          className="rounded-full bg-[--primary] px-5 py-2 text-sm font-medium text-[--primary-foreground]"
        >
          Open Setup Guide
        </a>
      </section>

      <footer className="pb-4 text-center text-xs text-[--muted-foreground]">
        CC0 1.0 - use freely. Please review code and deploy responsibly.
      </footer>
    </main>
  );
}
