"use client";

import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Info, OctagonX, Wrench, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { STATUS_META } from "@/data/health";
import type { HealthStatus } from "@/data/types";

/* ------------------------------------------------------------------ */

const STATUS_ICON: Record<HealthStatus, LucideIcon> = {
  healthy: CheckCircle2,
  elevated: AlertTriangle,
  degraded: AlertTriangle,
  unavailable: OctagonX,
};

export function StatusBadge({ status, label, planned, size = "sm" }: { status: HealthStatus; label?: string; planned?: boolean; size?: "xs" | "sm" }) {
  const m = STATUS_META[status];
  const Icon = planned ? Wrench : STATUS_ICON[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded border font-medium",
        size === "xs" ? "px-1.5 py-0 text-2xs" : "px-2 py-0.5 text-xs",
        planned ? "border-text-muted/40 bg-ink-700/60 text-text-secondary" : [m.text, m.bg, m.border],
      )}
    >
      <Icon className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
      {label ?? m.label}
    </span>
  );
}

export function StatusDot({ status, className }: { status: HealthStatus; className?: string }) {
  return <span aria-hidden className={clsx("inline-block h-2 w-2 shrink-0 rounded-full", STATUS_META[status].dot, className)} />;
}

/* ------------------------------------------------------------------ */

export function Tooltip({ content, children, side = "top", className }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom"; className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className={clsx("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          id={id}
          className={clsx(
            "pointer-events-none absolute left-1/2 z-50 w-64 -translate-x-1/2 rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-text-secondary shadow-xl animate-fade-in",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}

export function InfoTip({ content, label = "More information" }: { content: ReactNode; label?: string }) {
  return (
    <Tooltip content={content}>
      <button type="button" aria-label={label} className="rounded text-text-muted hover:text-text-secondary">
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */

export function Panel({ title, subtitle, actions, children, className, bodyClassName, id }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return (
    <section id={id} className={clsx("min-w-0 rounded-lg border border-ink-700 bg-ink-850/80", className)} aria-label={typeof title === "string" ? title : undefined}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-700/80 px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-text-primary">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({ variant = "secondary", size = "sm", icon: Icon, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "xs" | "sm"; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "xs" ? "px-2 py-1 text-2xs" : "px-3 py-1.5 text-xs",
        variant === "primary" && "border-accent bg-accent text-white hover:bg-accent/90",
        variant === "secondary" && "border-ink-600 bg-ink-800 text-text-primary hover:border-ink-500 hover:bg-ink-750",
        variant === "ghost" && "border-transparent text-text-secondary hover:bg-ink-750 hover:text-text-primary",
        variant === "danger" && "border-status-unavailable/50 bg-status-unavailable/10 text-red-300 hover:bg-status-unavailable/20",
        className,
      )}
    >
      {Icon && <Icon className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />}
      {children}
    </button>
  );
}

export function Chip({ children, onRemove, tone = "default", icon: Icon }: { children: ReactNode; onRemove?: () => void; tone?: "default" | "accent" | "cyan"; icon?: LucideIcon }) {
  return (
    <span
      className={clsx(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs",
        tone === "default" && "border-ink-600 bg-ink-800 text-text-secondary",
        tone === "accent" && "border-accent/40 bg-accent/10 text-accent-soft",
        tone === "cyan" && "border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyanSoft",
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden />}
      <span className="truncate">{children}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} className="-mr-0.5 rounded p-0.5 text-text-muted hover:text-text-primary" aria-label="Remove">
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </span>
  );
}

export function EmptyState({ icon: Icon = Info, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-ink-600 px-4 py-8 text-center">
      <Icon className="h-5 w-5 text-text-muted" aria-hidden />
      <p className="text-sm font-medium text-text-secondary">{title}</p>
      {children && <div className="max-w-sm text-xs text-text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-pulse rounded bg-ink-700/60", className)} />;
}

export function KeyValue({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(7rem,38%)_1fr] gap-2 py-1 text-xs">
      <dt className="text-text-muted">{k}</dt>
      <dd className={clsx("min-w-0 break-words text-text-primary", mono && "font-mono text-[11.5px]")}>{v}</dd>
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={clsx("mb-2 text-2xs font-semibold uppercase tracking-wider text-text-muted", className)}>{children}</h3>;
}

/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = "primary",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>("button");
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-[2px]" onMouseDown={onCancel}>
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-lg border border-ink-600 bg-ink-850 p-5 shadow-2xl animate-fade-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-sm font-semibold text-text-primary">
          {title}
        </h2>
        <div className="mt-2 text-xs leading-relaxed text-text-secondary">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function EvidenceTag({ kind }: { kind: "observed" | "inferred" | "hypothesis" }) {
  const meta = {
    observed: { label: "Observed", cls: "border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyanSoft", tip: "Directly measured in telemetry. Click a source to verify." },
    inferred: { label: "Inferred", cls: "border-accent/40 bg-accent/10 text-accent-soft", tip: "A relationship drawn from two or more observations. Could be wrong." },
    hypothesis: { label: "Unverified", cls: "border-ink-500 bg-ink-750 text-text-secondary border-dashed", tip: "A candidate explanation. Not yet tested against data." },
  }[kind];
  return (
    <Tooltip content={meta.tip}>
      <span tabIndex={0} className={clsx("inline-flex rounded border px-1.5 py-0 text-2xs font-semibold uppercase tracking-wide", meta.cls)}>
        {meta.label}
      </span>
    </Tooltip>
  );
}
