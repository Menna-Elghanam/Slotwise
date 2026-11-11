import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardShell } from "./dashboard-shell";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · Dashboard" } };

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
