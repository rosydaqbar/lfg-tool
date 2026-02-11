import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdminSession();
  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "Missing Discord access token. Sign out and sign in again." },
      { status: 401 }
    );
  }

  const response = await fetch("https://discord.com/api/v10/users/@me/guilds", {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let errorMessage = "Failed to fetch guilds";
    try {
      const errorBody = (await response.json()) as { message?: string };
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      // ignore parse errors
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: response.status }
    );
  }

  const guilds = (await response.json()) as {
    id: string;
    name: string;
    icon: string | null;
  }[];

  return NextResponse.json({
    guilds: guilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
    })),
  });
}
