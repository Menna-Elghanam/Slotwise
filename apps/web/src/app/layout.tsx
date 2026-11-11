import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Booking Platform", template: "%s · Booking Platform" },
  description: "Book appointments with barbers, clinics, tutors and gyms near you.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Providers>
          <SiteHeader />
          <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            {children}
          </main>
          <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
            Booking Platform — a portfolio project. Payments run in Stripe test mode.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
