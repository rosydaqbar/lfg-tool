import { NextResponse } from "next/server";
import { requireDashboardGuildAccess } from "@/lib/session";
import { getDashboardBotToken } from "@/lib/runtime-secrets";

export const dynamic = "force-dynamic";

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
    const details = (await response.json().catch(() => null)) as { message?: string } | null;
    return NextResponse.json(
      { error: details?.message || "Failed to fetch roles" },
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
