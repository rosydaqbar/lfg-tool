"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button variant="outline" onClick={() => signOut()}>
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </Button>
  );
}
