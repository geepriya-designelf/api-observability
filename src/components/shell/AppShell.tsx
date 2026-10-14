"use client";

import clsx from "clsx";
import {
  Activity,
  AlertOctagon,
  Check,
  CheckCircle2,
  Clock,
  Crosshair,
  GitBranch,
  Layers,
  Network,
  Pause,
  Pin,
  Play,
  Radio,
  RotateCcw,
  Server,
  Siren,
  Waypoints,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { serviceHealth } from "@/data/health";
import { MAX_CLOCK, TIME_RANGES, hhmm } from "@/data/metrics";
import { ENDPOINT_BY_ID, EVENT_BY_ID, INCIDENT_BY_ID, PRIMARY_SPAN_ID, PRIMARY_TRACE_ID, SERVICES, SERVICE_BY_ID } from "@/data/mock";
import { JOURNEY, VIEW_PATHS, statusLabel, useInvestigation, type JourneyStep, type ViewId } from "@/lib/store";
import { Button, Chip, ConfirmDialog, Tooltip } from "../ui";

const NAV: { id: ViewId; label: string; icon: LucideIcon; blurb: string }[] = [
  { id: "health", label: "Service Health", icon: Activity, blurb: "Which APIs and services need attention" },
  { id: "topology", label: "Dependency Topology", icon: Network, blurb: "How services depend on each other" },
  { id: "traces", label: "Trace Explorer", icon: Waypoints, blurb: "Where a single request spent its time" },
  { id: "incident", label: "Incident Correlation", icon: Layers, blurb: "What happened, in what order" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded focus:bg-ink-800 focus:px-3 focus:py-2 focus:text-sm">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <ContextBar />
        <main id="main" className="min-w-0 flex-1 px-5 pb-10 pt-4">
          {children}
        </main>
      </div>
      <Toasts />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Sidebar() {
  const { view, state, go } = useInvestigation();
  const inc = INCIDENT_BY_ID[state.incidentId];
  const degraded = SERVICES.filter((s) => {
    const h = serviceHealth(s.id, state.clock);
    return h.status !== "healthy" && !h.planned;
  }).length;
  const active = state.incidentStatus !== "resolved";

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ink-700 bg-ink-900 lg:flex" aria-label="Primary">
      <div className="border-b border-ink-700 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-accent to-accent-cyan">
            <Activity className="h-4 w-4 text-white" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight">Nium API Observability</div>
            <div className="truncate text-2xs text-text-muted">Payment Infrastructure Intelligence</div>
          </div>
        </div>
      </div>

      <nav className="px-2 py-3" aria-label="Views">
        <ul className="space-y-0.5">
          {NAV.map((n, i) => {
            const isActive = view === n.id;
            return (
              <li key={n.id}>
                <Link
                  href={VIEW_PATHS[n.id]}
                  aria-current={isActive ? "page" : undefined}
                  className={clsx(
                    "group flex items-start gap-3 rounded-md px-2.5 py-2 transition-colors",
                    isActive ? "bg-accent/15 text-text-primary" : "text-text-secondary hover:bg-ink-800 hover:text-text-primary",
                  )}
                >
                  <n.icon className={clsx("mt-0.5 h-4 w-4 shrink-0", isActive ? "text-accent-soft" : "text-text-muted")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[13px] font-medium">
                      <span className="text-2xs text-text-muted">{i + 1}</span>
                      {n.label}
                      {n.id === "health" && degraded > 0 && (
                        <span className="ml-auto rounded bg-status-degraded/15 px-1.5 text-2xs text-status-degraded" aria-label={`${degraded} services need attention`}>
                          {degraded}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-2xs text-text-muted">{n.blurb}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-3">
        <button
          type="button"
          onClick={() => go("incident")}
          className={clsx(
            "w-full rounded-md border p-3 text-left transition-colors",
            active ? "border-status-unavailable/40 bg-status-unavailable/5 hover:bg-status-unavailable/10" : "border-status-healthy/30 bg-status-healthy/5",
          )}
        >
          <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider">
            {active ? <Siren className="h-3.5 w-3.5 text-status-unavailable" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5 text-status-healthy" aria-hidden />}
            <span className={active ? "text-red-300" : "text-status-healthy"}>{active ? "Active incident" : "Resolved"}</span>
            <span className="ml-auto font-mono text-text-muted">{inc.severity}</span>
          </div>
          <div className="mt-1.5 text-[13px] font-medium text-text-primary">{inc.title}</div>
          <div className="mt-1 flex items-center gap-2 text-2xs text-text-muted">
            <span>Started {hhmm(inc.startMinute)} UTC</span>
            <span aria-hidden>·</span>
            <span>{statusLabel(state.incidentStatus)}</span>
          </div>
        </button>
      </div>

      <DemoGuide />

      <div className="mt-auto border-t border-ink-700 px-4 py-3">
        <div className="inline-flex items-center gap-1.5 rounded border border-accent-cyan/30 bg-accent-cyan/5 px-2 py-1 text-2xs font-medium text-accent-cyanSoft">
          <Radio className="h-3 w-3" aria-hidden />
          Portfolio concept · Simulated telemetry
        </div>
        <p className="mt-1.5 text-2xs leading-snug text-text-muted">UX concept. Not a Nium production system. All data is synthetic.</p>
      </div>
    </aside>
  );
}

function DemoGuide() {
  const { state, go, markJourney } = useInvestigation();
  const done = Object.values(state.journey).filter(Boolean).length;

  const run = (id: JourneyStep) => {
    switch (id) {
      case "detect":
        go("health", { endpointId: "create-payout" });
        break;
      case "dependencies":
        go("topology", { endpointId: "create-payout", serviceId: "payment-orchestration" });
        markJourney("dependencies");
        break;
      case "trace":
        go("traces", { traceId: PRIMARY_TRACE_ID, spanId: PRIMARY_SPAN_ID, serviceId: "payment-orchestration" });
        markJourney("trace");
        break;
      case "correlate":
        go("incident", { eventId: "evt-orch-latency" });
        markJourney("correlate");
        break;
      case "hypothesis":
        go("incident");
        markJourney("hypothesis");
        window.setTimeout(() => document.getElementById("hypothesis")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
        break;
    }
  };

  return (
    <div className="mt-4 px-3">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-2xs font-semibold uppercase tracking-wider text-text-muted">Investigation walkthrough</span>
        <span className="text-2xs text-text-muted">
          {done}/{JOURNEY.length}
        </span>
      </div>
      <ol className="space-y-0.5">
        {JOURNEY.map((s, i) => {
          const complete = state.journey[s.id];
          return (
            <li key={s.id}>
              <Tooltip content={s.hint} className="w-full">
                <button type="button" onClick={() => run(s.id)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-text-secondary hover:bg-ink-800 hover:text-text-primary">
                  <span
                    className={clsx(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold",
                      complete ? "border-accent-cyan bg-accent-cyan/20 text-accent-cyanSoft" : "border-ink-500 text-text-muted",
                    )}
                    aria-hidden
                  >
                    {complete ? <Check className="h-2.5 w-2.5" /> : i + 1}
                  </span>
                  <span className="truncate">{s.title}</span>
                  <span className="sr-only">{complete ? "(completed)" : ""}</span>
                </button>
              </Tooltip>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Header() {
  const { state, view, setRange, setLive, setPaused, reset, go } = useInvestigation();
  const [confirmReset, setConfirmReset] = useState(false);
  const inc = INCIDENT_BY_ID[state.incidentId];
  const active = state.incidentStatus !== "resolved";
  const atEnd = state.clock >= MAX_CLOCK;

  return (
    <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-900/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <Server className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">Environment</span>
          <select className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-text-primary" defaultValue="prod-sim" aria-label="Environment">
            <option value="prod-sim">Production (Simulated)</option>
            <option value="staging" disabled>
              Staging (not in this demo)
            </option>
          </select>
        </label>

        <div role="radiogroup" aria-label="Time range" className="flex rounded-md border border-ink-600 bg-ink-800 p-0.5">
          {TIME_RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={state.timeRange === r.id}
              onClick={() => setRange(r.id)}
              className={clsx(
                "rounded px-2.5 py-1 text-xs transition-colors",
                state.timeRange === r.id ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-text-muted" aria-live="polite">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          Updated <span className="font-mono text-text-secondary">{hhmm(state.clock)}:00 UTC</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={state.live}
            onClick={() => setLive(!state.live)}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-text-secondary hover:text-text-primary"
          >
            <span className={clsx("relative h-4 w-7 rounded-full transition-colors", state.live ? "bg-accent-cyan" : "bg-ink-600")} aria-hidden>
              <span className={clsx("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", state.live ? "left-3.5" : "left-0.5")} />
            </span>
            Live simulation
          </button>
          <Button
            size="xs"
            variant="ghost"
            icon={state.paused || atEnd ? Play : Pause}
            disabled={!state.live || atEnd}
            onClick={() => setPaused(!state.paused)}
            aria-label={state.paused ? "Resume simulation" : "Pause simulation"}
          >
            {atEnd && state.live ? "End of scenario" : state.paused ? "Resume" : "Pause"}
          </Button>
          <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
            Reset demo
          </Button>
        </div>

        <button
          type="button"
          onClick={() => go("incident")}
          className={clsx(
            "ml-auto flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium",
            active ? "border-status-unavailable/50 bg-status-unavailable/10 text-red-200 hover:bg-status-unavailable/20" : "border-status-healthy/40 bg-status-healthy/10 text-green-200",
          )}
          aria-label={active ? `1 active incident: ${inc.title}, ${inc.severity}, ${statusLabel(state.incidentStatus)}` : "No active incidents"}
        >
          {active ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-2 w-2 rounded-full bg-status-unavailable animate-pulse-ring" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-status-unavailable" />
            </span>
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          )}
          {active ? (
            <>
              1 active incident
              <span className="rounded bg-status-unavailable/20 px-1 font-mono text-2xs">{inc.severity}</span>
              <span className="text-2xs font-normal text-red-200/80">{statusLabel(state.incidentStatus)}</span>
            </>
          ) : (
            "No active incidents"
          )}
        </button>
      </div>
      <nav aria-label="Views (compact)" className="flex items-center gap-1 overflow-x-auto border-t border-ink-700/70 px-5 py-1.5 lg:hidden">
        {NAV.map((n) => (
          <Link
            key={n.id}
            href={VIEW_PATHS[n.id]}
            aria-current={view === n.id ? "page" : undefined}
            className={clsx("flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs", view === n.id ? "bg-accent/15 text-text-primary" : "text-text-secondary")}
          >
            <n.icon className="h-3.5 w-3.5" aria-hidden />
            {n.label}
          </Link>
        ))}
        <span className="ml-auto shrink-0 text-2xs text-accent-cyanSoft">Portfolio concept · Simulated telemetry</span>
      </nav>
      <ConfirmDialog
        open={confirmReset}
        title="Reset the demo?"
        body="This returns the simulated clock to 14:24 UTC and clears the selected service, trace, timeline event, notes, pinned evidence and incident status changes."
        confirmLabel="Reset demo"
        tone="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          reset();
        }}
      />
    </header>
  );
}

/* ------------------------------------------------------------------ */

function ContextBar() {
  const { state, patch, go } = useInvestigation();
  const inc = INCIDENT_BY_ID[state.incidentId];
  const range = TIME_RANGES.find((r) => r.id === state.timeRange)!;
  const ev = state.eventId ? EVENT_BY_ID[state.eventId] : null;

  return (
    <div className="border-b border-ink-700/80 bg-ink-900/60 px-5 py-2" role="region" aria-label="Investigation context">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-text-muted">
          <Crosshair className="h-3 w-3" aria-hidden />
          Context
        </span>
        <button type="button" onClick={() => go("incident")} className="rounded-md">
          <Chip tone="accent" icon={AlertOctagon}>
            <span className="font-mono">{inc.id}</span> · {statusLabel(state.incidentStatus)}
          </Chip>
        </button>
        <Chip icon={Clock}>{range.label}</Chip>
        {state.window && (
          <Chip tone="cyan" icon={Clock} onRemove={() => patch({ window: null })}>
            Window {hhmm(state.window.from)} to {hhmm(state.window.to)}
          </Chip>
        )}
        {state.endpointId && (
          <Chip icon={GitBranch} onRemove={() => patch({ endpointId: null })}>
            {ENDPOINT_BY_ID[state.endpointId].method} {ENDPOINT_BY_ID[state.endpointId].path}
          </Chip>
        )}
        {state.serviceId && (
          <button type="button" className="rounded-md" onClick={() => go("topology")} aria-label={`Open ${SERVICE_BY_ID[state.serviceId].name} in topology`}>
            <Chip icon={Network}>{SERVICE_BY_ID[state.serviceId].name}</Chip>
          </button>
        )}
        {state.traceId && (
          <button type="button" className="rounded-md" onClick={() => go("traces")} aria-label={`Open ${state.traceId} in trace explorer`}>
            <Chip icon={Waypoints}>
              <span className="font-mono">
                {state.traceId}
                {state.spanId ? ` / ${state.spanId}` : ""}
              </span>
            </Chip>
          </button>
        )}
        {ev && (
          <button type="button" className="rounded-md" onClick={() => go("incident")} aria-label={`Open event ${ev.title}`}>
            <Chip icon={Layers}>
              {hhmm(ev.minute)} {ev.title}
            </Chip>
          </button>
        )}
        {state.pinned.length > 0 && (
          <button type="button" className="rounded-md" onClick={() => go("incident")} aria-label="Open pinned evidence">
            <Chip icon={Pin}>{state.pinned.length} pinned</Chip>
          </button>
        )}
        {(state.serviceId || state.traceId || state.eventId || state.window) && (
          <button
            type="button"
            className="ml-auto flex items-center gap-1 text-2xs text-text-muted hover:text-text-secondary"
            onClick={() => patch({ serviceId: null, traceId: null, spanId: null, eventId: null, window: null })}
          >
            <X className="h-3 w-3" aria-hidden />
            Clear selections
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Toasts() {
  const { state, dismissToast } = useInvestigation();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-80 flex-col gap-2" aria-live="polite" role="status">
      {state.toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "pointer-events-auto flex items-start gap-2 rounded-md border bg-ink-850 px-3 py-2.5 text-xs shadow-xl animate-fade-in",
            t.tone === "success" && "border-status-healthy/40",
            t.tone === "info" && "border-accent/40",
            t.tone === "warning" && "border-status-elevated/40",
          )}
        >
          <CheckCircle2 className={clsx("mt-0.5 h-3.5 w-3.5 shrink-0", t.tone === "success" ? "text-status-healthy" : "text-accent-soft")} aria-hidden />
          <span className="flex-1 text-text-secondary">{t.text}</span>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Dismiss notification" className="text-text-muted hover:text-text-primary">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
