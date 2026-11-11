"use client";

import { CalendarCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useLogout, useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button, ButtonLink } from "./ui/button";

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export function SiteHeader() {
  const { data: user, isPending } = useMe();
  const logout = useLogout();

  return (
    <header className="border-b border-border bg-card">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <CalendarCheck aria-hidden className="size-6 text-primary" />
          Booking Platform
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
          <NavLink href="/businesses">Browse</NavLink>
          {user && (
            <>
              <NavLink href="/bookings">My bookings</NavLink>
              <NavLink href="/dashboard">For businesses</NavLink>
              {user.isAdmin && <NavLink href="/admin">Admin</NavLink>}
            </>
          )}
          {!isPending &&
            (user ? (
              <Button
                variant="ghost"
                size="sm"
                pending={logout.isPending}
                onClick={() => logout.mutate()}
              >
                Log out
              </Button>
            ) : (
              <>
                <NavLink href="/login">Log in</NavLink>
                <ButtonLink href="/register" size="sm">
                  Sign up
                </ButtonLink>
              </>
            ))}
        </nav>
      </div>
    </header>
  );
}
