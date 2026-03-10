import "./env";
import fs from "fs";
import path from "path";
import type { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { decryptSetupValue } from "@/lib/setup-crypto";

const DASHBOARD_DIR_NAME = "dashboard";

function getWorkspaceRoot() {
  return path.basename(process.cwd()).toLowerCase() === DASHBOARD_DIR_NAME
    ? path.resolve(process.cwd(), "..")
    : process.cwd();
}

function loadDiscordOAuthCredentials() {
  const envClientId = process.env.DISCORD_CLIENT_ID;
  const envClientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }

  const setupStatePath = path.resolve(getWorkspaceRoot(), ".setup-state.json");

  try {
    if (fs.existsSync(setupStatePath)) {
      const raw = fs.readFileSync(setupStatePath, "utf8");
      const parsed = JSON.parse(raw) as {
        discordClientId?: string;
        discordClientSecretEncrypted?: string;
        discordClientSecret?: string;
      };
      if (parsed.discordClientId) {
        if (parsed.discordClientSecret && parsed.discordClientSecret.trim()) {
          return {
            clientId: parsed.discordClientId,
            clientSecret: parsed.discordClientSecret.trim(),
          };
        }

        if (parsed.discordClientSecretEncrypted) {
          return {
            clientId: parsed.discordClientId,
            clientSecret: decryptSetupValue(parsed.discordClientSecretEncrypted),
          };
        }
      }
    }
  } catch {
    // ignore fallback parse/decrypt errors
  }

  return { clientId: "", clientSecret: "" };
}

function getDiscordProfileId(profile: unknown) {
  if (!profile || typeof profile !== "object") return undefined;
  const value = profile as { id?: unknown };
  return typeof value.id === "string" ? value.id : undefined;
}

export function getAuthOptions(): NextAuthOptions {
  const discordOAuth = loadDiscordOAuthCredentials();

  return {
    session: { strategy: "jwt" },
    logger: {
      error(code, metadata) {
        if (code === "JWT_SESSION_ERROR") {
          return;
        }
        console.error("[next-auth][error]", code, metadata ?? {});
      },
      warn(code) {
        console.warn("[next-auth][warn]", code);
      },
      debug(code, metadata) {
        if (process.env.NODE_ENV !== "development") return;
        console.debug("[next-auth][debug]", code, metadata ?? {});
      },
    },
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
      async signIn() {
        return true;
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
}

export const authOptions = getAuthOptions();
