import "@/lib/env";
import type { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

const adminId = process.env.ADMIN_DISCORD_USER_ID;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: "identify guilds",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile, account, user }) {
      if (!adminId) return false;
      const discordId =
        profile?.id ?? account?.providerAccountId ?? (user?.id as string);
      return discordId === adminId;
    },
    async jwt({ token, account, profile, user }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      const discordId =
        profile?.id ?? account?.providerAccountId ?? (user?.id as string);
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
