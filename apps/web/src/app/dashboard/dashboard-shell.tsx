"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Alert, Spinner } from "@/components/ui/feedback";
import { errorMessage } from "@/lib/api";
import { RequireAuth, useWorkspace } from "@/lib/auth";
import { cn } from "@/lib/utils";

const OWNER_LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/schedule", label: "Schedule" },
  { href: "/dashboard/services", label: "Services" },
  { href: "/dashboard/team", label: "Team" },
  { href: "/dashboard/hours", label: "Hours & time off" },
  { href: "/dashboard/settings", label: "Settings" },
];

const STAFF_LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/schedule", label: "Schedule" },
  { href: "/dashboard/hours", label: "Hours & time off" },
];

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const workspace = useWorkspace();

  if (workspace.isPending) {
    return <Spinner label="Loading your workspace" />;
  }
  if (workspace.isError) {
    return (
      <Alert tone="error" title="Your dashboard couldn't be loaded">
        {errorMessage(workspace.error)}
      </Alert>
    );
  }

  const { business, staffMemberships } = workspace.data;
  const links = business ? OWNER_LINKS : staffMemberships.length > 0 ? STAFF_LINKS : [];

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      {links.length > 0 && (
        <nav aria-label="Dashboard" className="md:w-52 md:shrink-0">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {business?.name ?? staffMemberships[0]?.business.name}
          </p>
          <ul className="flex gap-1 overflow-x-auto md:flex-col">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium",
                      active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <Shell>{children}</Shell>
    </RequireAuth>
  );
}
