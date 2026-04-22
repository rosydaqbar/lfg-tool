import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import { resolveGuildUsernames } from "@/lib/discord-usernames";
import { requireDashboardGuildAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDashboardGuildAccess(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") || "100", 10);
  const offset = Number.parseInt(searchParams.get("offset") || "0", 10);
  const rawStatus = searchParams.get("status") || "";
  const status =
    rawStatus === "pending" || rawStatus === "approved" || rawStatus === "denied"
      ? rawStatus
      : undefined;

  const getRequests = db.getVoiceAutoRoleRequests;
  if (typeof getRequests !== "function") {
    return NextResponse.json(
      { error: "Auto role requests function unavailable. Restart dashboard dev server." },
      { status: 500 }
    );
  }

  const rows = await getRequests(
    id,
    Number.isNaN(limit) ? 100 : limit,
    Number.isNaN(offset) ? 0 : offset,
    status
  );

  const names = await resolveGuildUsernames(
    id,
    rows.flatMap((row) => [row.userId, row.decidedBy || ""]).filter(Boolean)
  );

  const counts = {
    pending: rows.filter((item) => item.status === "pending").length,
    approved: rows.filter((item) => item.status === "approved").length,
    denied: rows.filter((item) => item.status === "denied").length,
  };

  return NextResponse.json({
    requests: rows.map((row) => ({
      ...row,
      userName: names.get(row.userId) ?? null,
      decidedByName: row.decidedBy ? names.get(row.decidedBy) ?? null : null,
    })),
    counts,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDashboardGuildAccess(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as
    | { requestId?: number }
    | null;
  const requestId = Number(body?.requestId);
  if (!Number.isFinite(requestId) || requestId <= 0) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const deleteRequest = db.deleteVoiceAutoRoleRequest;
  if (typeof deleteRequest !== "function") {
    return NextResponse.json(
      { error: "Auto role delete function unavailable. Restart dashboard dev server." },
      { status: 500 }
    );
  }

  const deleted = await deleteRequest(id, requestId);
  if (!deleted) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
