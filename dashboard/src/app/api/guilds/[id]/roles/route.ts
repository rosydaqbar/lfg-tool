import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const botToken = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json(
      { error: "Missing DISCORD_TOKEN" },
      { status: 500 }
    );
  }

  const response = await fetch(
    `https://discord.com/api/v10/guilds/${id}/roles`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: "Failed to fetch roles" },
      { status: response.status }
    );
  }

  const roles = (await response.json()) as {
    id: string;
    name: string;
    color: number;
    position: number;
  }[];

  const filtered = roles
    .filter((role) => role.id !== id)
    .sort((a, b) => b.position - a.position)
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
    }));

  return NextResponse.json({ roles: filtered });
}
