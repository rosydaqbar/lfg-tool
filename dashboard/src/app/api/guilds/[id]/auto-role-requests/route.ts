import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import { resolveGuildUsernames } from "@/lib/discord-usernames";
import { getDashboardBotToken } from "@/lib/runtime-secrets";
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
  const getCounts = db.getVoiceAutoRoleRequestCounts;
  const counts =
    typeof getCounts === "function"
      ? await getCounts(id)
      : {
          pending: rows.filter((item) => item.status === "pending").length,
          approved: rows.filter((item) => item.status === "approved").length,
          denied: rows.filter((item) => item.status === "denied").length,
        };

  const names = await resolveGuildUsernames(
    id,
    rows.flatMap((row) => [row.userId, row.decidedBy || ""]).filter(Boolean)
  );

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDashboardGuildAccess(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as
    | { requestId?: number; action?: "approve" | "deny" }
    | null;
  const requestId = Number(body?.requestId);
  const action = body?.action;
  if (!Number.isFinite(requestId) || requestId <= 0) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }
  if (action !== "approve" && action !== "deny") {
    return NextResponse.json({ error: "action must be approve or deny" }, { status: 400 });
  }

  const getRequest = db.getVoiceAutoRoleRequestById;
  const updateStatus = db.updateVoiceAutoRoleRequestStatus;
  if (typeof getRequest !== "function" || typeof updateStatus !== "function") {
    return NextResponse.json(
      { error: "Auto role action functions unavailable. Restart dashboard dev server." },
      { status: 500 }
    );
  }

  const target = await getRequest(id, requestId);
  if (!target) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (target.status !== "pending") {
    return NextResponse.json(
      { error: `Request already processed (${target.status})` },
      { status: 409 }
    );
  }

  const botToken = await getDashboardBotToken();

  if (action === "approve") {
    if (!botToken) {
      return NextResponse.json({ error: "Bot token is missing" }, { status: 500 });
    }

    const roleResponse = await fetch(
      `https://discord.com/api/v10/guilds/${id}/members/${target.userId}/roles/${target.roleId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    ).catch(() => null);

    if (!roleResponse?.ok) {
      const payload = (await roleResponse?.json().catch(() => null)) as
        | { message?: string }
        | null
        | undefined;
      return NextResponse.json(
        {
          error:
            payload?.message ||
            "Bot failed to give the role. Check bot permissions and role hierarchy.",
        },
        { status: roleResponse?.status || 500 }
      );
    }
  }

  const updated = await updateStatus(
    id,
    requestId,
    action === "approve" ? "approved" : "denied",
    access.session.user?.id ?? null
  );
  if (!updated) {
    return NextResponse.json(
      { error: "Request was already processed or no longer exists" },
      { status: 409 }
    );
  }

  let approvalMessageDeleted = false;
  if (botToken && target.messageChannelId && target.messageId) {
    const deleteResponse = await fetch(
      `https://discord.com/api/v10/channels/${target.messageChannelId}/messages/${target.messageId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bot ${botToken}`,
        },
        cache: "no-store",
      }
    ).catch(() => null);
    approvalMessageDeleted = deleteResponse?.ok || deleteResponse?.status === 404;
  }

  return NextResponse.json({ ok: true, approvalMessageDeleted });
}
