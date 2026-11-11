import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const alertStyles = {
  error: { box: "border-destructive/30 bg-destructive/5 text-destructive", Icon: AlertCircle },
  success: { box: "border-success/30 bg-success/5 text-success", Icon: CheckCircle2 },
  info: { box: "border-border bg-muted text-foreground", Icon: Info },
} as const;

/** A message box. Errors use role="alert" so screen readers announce them immediately. */
export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof alertStyles;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = alertStyles[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border p-4 text-sm", box, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-foreground/90">{children}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
    >
      <span
        aria-hidden
        className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
      />
      {label}…
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>
      {children && <p className="max-w-md text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
