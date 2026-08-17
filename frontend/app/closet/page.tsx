"use client";

import { useRoleGuard, PAGE_ROLES } from "@/lib/roleAccess";
import { ClosetBuilder } from "@/components/closet/ClosetBuilder";

export default function ClosetPage() {
  useRoleGuard(PAGE_ROLES["/closet"]);
  return <ClosetBuilder />;
}
