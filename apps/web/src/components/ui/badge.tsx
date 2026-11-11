import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/format";
import type { BookingStatus } from "@/lib/types";

const tones = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
  accent: "bg-accent text-accent-foreground",
} as const;

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const statusTones: Record<BookingStatus, keyof typeof tones> = {
  PENDING: "warning",
  CONFIRMED: "success",
  COMPLETED: "accent",
  NO_SHOW: "danger",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={statusTones[status]}>{STATUS_LABELS[status]}</Badge>;
}
