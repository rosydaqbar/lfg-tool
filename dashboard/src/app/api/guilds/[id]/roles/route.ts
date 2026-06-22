import { NextResponse } from "next/server";
import { requireDashboardGuildAccess } from "@/lib/session";
import { getDashboardBotToken } from "@/lib/runtime-secrets";

export const dynamic = "force-dynamic";

const ROLES_CACHE_TTL_MS = 10 * 60_000;

type RolesPayload = {
  roles: { id: string; name: string; color: number }[];
};

const rolesCache = new Map<string, { expiresAt: number; payload: RolesPayload }>();
const rolesInFlight = new Map<string, Promise<RolesPayload>>();

async function loadDiscordRoles(guildId: string, botToken: string) {
  const cacheKey = `${guildId}:${botToken.slice(0, 12)}`;
  const now = Date.now();
  const cached = rolesCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.payload;

  const active = rolesInFlight.get(cacheKey);
  if (active) return active;

  const request = (async () => {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/roles`,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
        cache: "no-store",
      }
    ).catch((error) => {
      console.error("Failed to fetch Discord guild roles:", error);
      return null;
    });

    if (!response) {
      if (cached) {
        console.warn("Using stale Discord role cache after lookup failure:", { guildId });
        return cached.payload;
      }
      throw new Error("Discord role lookup failed. Please retry.");
    }

    if (!response.ok) {
      const details = (await response.json().catch(() => null)) as { code?: number; message?: string } | null;
      if (response.status === 429 && cached) {
        console.warn("Using stale Discord role cache after rate limit:", {
          guildId,
          code: details?.code,
          message: details?.message,
        });
        return cached.payload;
      }
      console.error("Discord guild roles error:", {
        guildId,
        status: response.status,
        code: details?.code,
        message: details?.message,
      });
      const error = new Error(details?.message || "Failed to fetch roles") as Error & {
        status?: number;
        code?: number | null;
      };
      error.status = response.status >= 500 ? 502 : response.status;
      error.code = details?.code ?? null;
      throw error;
    }

    const roles = (await response.json()) as {
      id: string;
      name: string;
      color: number;
      position: number;
    }[];

    const payload = {
      roles: roles
        .filter((role) => role.id !== guildId)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.color,
        })),
    } satisfies RolesPayload;

    rolesCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + ROLES_CACHE_TTL_MS,
    });
    return payload;
  })();

  rolesInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    rolesInFlight.delete(cacheKey);
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDashboardGuildAccess(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const botToken = await getDashboardBotToken();
  if (!botToken) {
    return NextResponse.json(
      { error: "Missing bot token. Configure Step 3 in setup." },
      { status: 500 }
    );
  }

  try {
    return NextResponse.json(await loadDiscordRoles(id, botToken));
  } catch (error) {
    const details = error as Error & { status?: number; code?: number | null };
    return NextResponse.json(
      { error: details.message || "Failed to fetch roles", code: details.code ?? null },
      { status: details.status ?? 502 }
    );
  }
}
