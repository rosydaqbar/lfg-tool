import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { requireSetupSession } from "@/lib/setup-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSetupSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dashboardDirName = "dashboard";
  const workspaceRoot =
    path.basename(process.cwd()).toLowerCase() === dashboardDirName
      ? path.resolve(process.cwd(), "..")
      : process.cwd();
  const schemaPath = path.resolve(workspaceRoot, "scripts", "schema-postgres.sql");

  try {
    const schemaSql = await readFile(schemaPath, "utf8");
    return NextResponse.json({ schemaSql });
  } catch {
    return NextResponse.json(
      { error: "Failed to load scripts/schema-postgres.sql" },
      { status: 500 }
    );
  }
}
