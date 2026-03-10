import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type HealthPayload = {
  status?: string;
  uptimeSeconds?: number;
  timestamp?: string;
};

export async function GET() {
  const healthUrl = (process.env.BOT_HEALTHCHECK_URL || "http://127.0.0.1:80").trim();
  const checkedAt = new Date().toISOString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return NextResponse.json({
        online: false,
        healthUrl,
        checkedAt,
        error: `Health endpoint returned ${response.status}`,
      });
    }

    const payload = (await response.json().catch(() => null)) as HealthPayload | null;

    return NextResponse.json({
      online: true,
      healthUrl,
      checkedAt,
      payload,
    });
  } catch {
    return NextResponse.json({
      online: false,
      healthUrl,
      checkedAt,
      error: "Bot health check failed",
    });
  } finally {
    clearTimeout(timeout);
  }
}
