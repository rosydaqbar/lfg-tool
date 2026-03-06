import NextAuth from "next-auth";
import { getAuthOptions } from "@/lib/auth";

function createHandler() {
  return NextAuth(getAuthOptions());
}

export async function GET(request: Request, context: unknown) {
  return createHandler()(request, context as never);
}

export async function POST(request: Request, context: unknown) {
  return createHandler()(request, context as never);
}
