import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";

export async function getSafeServerSession() {
  try {
    return await getServerSession(getAuthOptions());
  } catch {
    return null;
  }
}
