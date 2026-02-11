import os from "os";
import { NextResponse } from "next/server";
import { getProcessMetrics, setProcessMetrics } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";

export const dynamic = "force-dynamic";

let lastCpuUsage: NodeJS.CpuUsage | null = null;
let lastCpuTime: bigint | null = null;

function getCpuPercent() {
  const now = process.hrtime.bigint();
  const previousUsage = lastCpuUsage ?? process.cpuUsage();
  const previousTime = lastCpuTime ?? now;
  const usage = process.cpuUsage(previousUsage);
  const elapsedUs = Number(now - previousTime) / 1000;

  lastCpuUsage = process.cpuUsage();
  lastCpuTime = now;

  if (elapsedUs <= 0) return 0;
  const totalCpuUs = usage.user + usage.system;
  const cores = os.cpus().length || 1;
  return (totalCpuUs / elapsedUs) * (100 / cores);
}

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memory = process.memoryUsage();
  const metrics = {
    pid: process.pid,
    cpuPercent: getCpuPercent(),
    memoryRss: memory.rss,
    memoryHeapUsed: memory.heapUsed,
    memoryHeapTotal: memory.heapTotal,
    uptimeSeconds: Math.floor(process.uptime()),
  };

  setProcessMetrics("dashboard", metrics);

  const rows = getProcessMetrics();
  return NextResponse.json({
    metrics: rows.map((row) => ({
      service: row.service,
      pid: row.pid,
      cpuPercent: row.cpu_percent,
      memoryRss: row.memory_rss,
      memoryHeapUsed: row.memory_heap_used,
      memoryHeapTotal: row.memory_heap_total,
      uptimeSeconds: row.uptime_seconds,
      updatedAt: row.updated_at,
    })),
  });
}
