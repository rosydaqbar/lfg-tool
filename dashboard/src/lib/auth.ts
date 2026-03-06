import "@/lib/env";
import fs from "fs";
import path from "path";
import type { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { decryptSetupValue } from "@/lib/setup-crypto";

const adminId = process.env.ADMIN_DISCORD_USER_ID;

function loadDiscordOAuthCredentials() {
  const envClientId = process.env.DISCORD_CLIENT_ID;
  const envClientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }

  const candidates = [
    path.resolve(process.cwd(), ".setup-state.json"),
    path.resolve(process.cwd(), "dashboard", ".setup-state.json"),
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as {
        discordClientId?: string;
        discordClientSecretEncrypted?: string;
      };
      if (!parsed.discordClientId || !parsed.discordClientSecretEncrypted) continue;
      return {
        clientId: parsed.discordClientId,
        clientSecret: decryptSetupValue(parsed.discordClientSecretEncrypted),
      };
    } catch {
      // ignore fallback parse/decrypt errors
    }
  }

  return { clientId: "", clientSecret: "" };
}

const discordOAuth = loadDiscordOAuthCredentials();

function getDiscordProfileId(profile: unknown) {
  if (!profile || typeof profile !== "object") return undefined;
  const value = profile as { id?: unknown };
  return typeof value.id === "string" ? value.id : undefined;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    DiscordProvider({
      clientId: discordOAuth.clientId,
      clientSecret: discordOAuth.clientSecret,
      authorization: {
        params: {
          scope: "identify guilds",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile, account, user }) {
      const discordId =
        getDiscordProfileId(profile) ??
        account?.providerAccountId ??
        (user?.id as string);
      if (!adminId) return Boolean(discordId);
      return discordId === adminId;
    },
    async jwt({ token, account, profile, user }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      const discordId =
        getDiscordProfileId(profile) ??
        account?.providerAccountId ??
        (user?.id as string);
      if (discordId) token.discordId = discordId;
      return token;
    },
    async session({ session, token }) {
      session.user = session.user ?? {};
      session.user.id = token.discordId as string | undefined;
      session.accessToken = token.accessToken as string | undefined;
      return session;
    },
  },
};
