"use client";

import clsx from "clsx";
import {
  AlertOctagon,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  FlaskConical,
  GitCommit,
  HeartPulse,
  Lightbulb,
  ListChecks,
  MessageSquarePlus,
  MousePointer2,
  Network,
  Pin,
  Repeat,
  Siren,
  Timer,
  TrendingUp,
  Waypoints,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatMetric, hhmm, hhmmss, metric, rangeFor } from "@/data/metrics";
import { ENDPOINT_BY_ID, EVENT_BY_ID, INCIDENT_BY_ID, PAYOUTS, SERVICE_BY_ID, TIMELINE_EVENTS, TRACE_BY_ID } from "@/data/mock";
import type { EvidenceItem, IncidentStatus, ServiceId, TimelineEvent, TimelineEventType } from "@/data/types";
import { statusLabel, useInvestigation, type ViewId } from "@/lib/store";
import { MetricChart } from "../charts";
import { Button, ConfirmDialog, EmptyState, EvidenceTag, InfoTip, Panel, SectionLabel } from "../ui";
import { PageHeader } from "./HealthView";

const Y_W = 112;
const RIGHT = 8;

const LANES: { id: string; label: string; types: TimelineEventType[] }[] = [
  { id: "changes", label: "Changes", types: ["deployment", "config-change"] },
  { id: "signals", label: "Metric signals", types: ["latency-anomaly", "error-rate-change", "retries"] },
  { id: "health", label: "Health", types: ["health-transition"] },
  { id: "payouts", label: "Payouts", types: ["payout-lifecycle"] },
  { id: "incident", label: "Incident", types: ["incident-detection"] },
];

const TYPE_META: Record<TimelineEventType, { label: string; icon: LucideIcon; color: string }> = {
  deployment: { label: "Deployment", icon: GitCommit, color: "#8FA6FF" },
  "config-change": { label: "Configuration change", icon: GitCommit, color: "#8FA6FF" },
  "latency-anomaly": { label: "Latency anomaly", icon: Timer, color: "#F5A524" },
  "error-rate-change": { label: "Error-rate change", icon: TrendingUp, color: "#F5A524" },
  retries: { label: "Increased retries", icon: Repeat, color: "#F5A524" },
  "health-transition": { label: "Service health transition", icon: HeartPulse, color: "#F97316" },
  "payout-lifecycle": { label: "Payout lifecycle", icon: Clock, color: "#5FD4E4" },
  "incident-detection": { label: "Incident detection", icon: Siren, color: "#EF4444" },
};

const CHARTS: { keys: string[]; title: string; note?: string }[] = [
  { keys: ["create-payout.rpm"], title: "Create Payout requests / min", note: "Stable" },
  { keys: ["create-payout.p95"], title: "Create Payout P95" },
  { keys: ["payment-orchestration.self"], title: "Orchestration self time P95" },
  { keys: ["partner-rail-a.p95"], title: "Partner Rail A P95", note: "Within band" },
  { keys: ["payment-orchestration.retries"], title: "Retries to Rail A / min" },
  { keys: ["create-payout.errorRate"], title: "Create Payout error rate" },
  { keys: ["payouts.pendingBeyondWindow"], title: "Payouts pending beyond window" },
];

export function IncidentView() {
  const { state, patch, markJourney } = useInvestigation();
  const inc = INCIDENT_BY_ID[state.incidentId];
  const t = state.clock;
  const range = rangeFor(state.timeRange, t);
  const events = TIMELINE_EVENTS.filter((e) => e.minute <= t);
  const hidden = events.filter((e) => e.minute < range.from).length;
  const selected = state.eventId ? EVENT_BY_ID[state.eventId] : null;
  const highlight = selected ? { from: selected.minute - 1, to: selected.minute + 1 } : null;

  const selectEvent = (id: string | null) => {
    patch({ eventId: id });
    if (id) markJourney("correlate");
  };

  return (
    <div className="mx-auto max-w-[1700px] space-y-4">
      <PageHeader
        title="Incident Correlation"
        description="Rebuild what happened by lining up changes, metric signals, health transitions and payout events on one time axis. Order in time is shown; cause is only claimed with evidence."
      />

      <IncidentHeader />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0 space-y-4">
          <Panel
            title="Correlated timeline"
            subtitle="Select an event to highlight its time window across every signal. Drag across a chart to set an investigation window."
            bodyClassName="px-3 pb-3 pt-2"
            actions={
              <div className="flex gap-2">
                <Button size="xs" variant="ghost" onClick={() => patch({ window: { from: inc.startMinute - 3, to: t } })}>
                  Window: incident period
                </Button>
                {state.window && (
                  <Button size="xs" variant="ghost" icon={X} onClick={() => patch({ window: null })}>
                    Clear window
                  </Button>
                )}
              </div>
            }
          >
            {hidden > 0 && (
              <div className="mb-2 flex items-center gap-2 rounded-md border border-status-elevated/30 bg-status-elevated/5 px-3 py-1.5 text-2xs text-text-secondary">
                {hidden} earlier event{hidden > 1 ? "s" : ""} fall outside the selected time range ({range.label.toLowerCase()}).
                <IncidentRangeFix />
              </div>
            )}
            <EventLane events={events} from={range.from} to={range.to} selectedId={state.eventId} onSelect={selectEvent} window={state.window} />
            {selected && <EventDetail ev={selected} onClose={() => selectEvent(null)} />}
            <div className="mt-2 space-y-0.5">
              {CHARTS.map((c, i) => (
                <div key={c.title}>
                  <div className="flex items-baseline gap-2 pl-1 pt-1 text-2xs" style={{ paddingLeft: Y_W - 40 }}>
                    <span className="text-text-secondary">{c.title}</span>
                    <span className="font-mono text-text-primary">{formatMetric(c.keys[0], t)}</span>
                    {c.note && <span className="text-text-muted">· {c.note}</span>}
                  </div>
                  <MetricChart
                    keys={c.keys}
                    from={range.from}
                    to={range.to}
                    step={range.step}
                    height={i === CHARTS.length - 1 ? 74 : 54}
                    yAxisWidth={Y_W}
                    hideXAxis={i !== CHARTS.length - 1}
                    window={state.window}
                    highlight={highlight}
                    markers={[
                      { t: inc.startMinute, label: "Incident start", tone: "incident" as const },
                      ...(selected ? [{ t: selected.minute, label: selected.title, tone: "selected" as const }] : []),
                    ]}
                    onSelectWindow={(w) => patch({ window: w })}
                    syncId="incident"
                    ariaLabel={`${c.title}: now ${formatMetric(c.keys[0], t)}`}
                    compact
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5 pl-1 text-2xs text-text-muted">
              <MousePointer2 className="h-3 w-3" aria-hidden />
              Events that happen close together are not necessarily related. Use the evidence panel to see what each claim rests on.
            </div>
          </Panel>

          <EventLog events={events} selectedId={state.eventId} onSelect={selectEvent} />
        </div>

        <IncidentDetail />
      </div>
    </div>
  );
}

function IncidentRangeFix() {
  const { setRange } = useInvestigation();
  return (
    <button type="button" className="ml-auto text-accent-soft underline underline-offset-2" onClick={() => setRange("1h")}>
      Show last hour
    </button>
  );
}

/* ------------------------------------------------------------------ */

function IncidentHeader() {
  const { state, setStatus, addNote, go } = useInvestigation();
  const inc = INCIDENT_BY_ID[state.incidentId];
  const t = state.clock;
  const [pending, setPending] = useState<IncidentStatus | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const statuses: IncidentStatus[] = ["triggered", "acknowledged", "investigating", "mitigated", "resolved"];
  const idx = statuses.indexOf(state.incidentStatus);

  const request = (s: IncidentStatus) => {
    if (s === state.incidentStatus) return;
    if (s === "acknowledged") setStatus(s);
    else setPending(s);
  };

  return (
    <section aria-label="Incident summary" className="rounded-lg border border-ink-700 bg-ink-850/80">
      <div className="flex flex-wrap items-start gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-status-unavailable" aria-hidden />
            <h2 className="text-base font-semibold text-text-primary">{inc.title}</h2>
            <span className="rounded border border-status-unavailable/50 bg-status-unavailable/10 px-1.5 font-mono text-2xs text-red-300">{inc.severity}</span>
            <span className="font-mono text-2xs text-text-muted">{inc.id}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
            <span>
              Started <span className="font-mono text-text-secondary">{hhmm(inc.startMinute)} UTC</span>
            </span>
            <span>
              Detected <span className="font-mono text-text-secondary">{hhmm(inc.detectedMinute)} UTC</span>
            </span>
            <span>
              Duration <span className="font-mono text-text-secondary">{t - inc.startMinute} min</span>
            </span>
            <span className="flex items-center gap-1">
              Detector <InfoTip content={inc.detector} />
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-2xs uppercase tracking-wider text-text-muted">Affected</span>
            {inc.affectedEndpoints.map((e) => (
              <button key={e} type="button" onClick={() => go("health", { endpointId: e })} className="rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-2xs text-text-secondary hover:text-text-primary">
                {ENDPOINT_BY_ID[e].method} {ENDPOINT_BY_ID[e].path}
              </button>
            ))}
            {inc.affectedServices.map((s) => (
              <button key={s} type="button" onClick={() => go("topology", { serviceId: s })} className="rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 text-2xs text-text-secondary hover:text-text-primary">
                {SERVICE_BY_ID[s].name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <ol className="flex flex-wrap items-center gap-1" aria-label="Incident status">
            {statuses.map((s, i) => (
              <li key={s} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => request(s)}
                  aria-current={s === state.incidentStatus ? "step" : undefined}
                  className={clsx(
                    "rounded px-2 py-1 text-2xs font-medium transition-colors",
                    s === state.incidentStatus ? "bg-accent text-white" : i < idx ? "text-accent-soft hover:bg-ink-750" : "text-text-muted hover:bg-ink-750 hover:text-text-secondary",
                  )}
                >
                  {i < idx && <Check className="mr-0.5 inline h-3 w-3" aria-hidden />}
                  {statusLabel(s)}
                </button>
                {i < statuses.length - 1 && <span aria-hidden className="h-px w-2 bg-ink-600" />}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            {state.incidentStatus === "triggered" && (
              <Button variant="primary" icon={CheckCircle2} onClick={() => setStatus("acknowledged")}>
                Acknowledge
              </Button>
            )}
            <Button icon={MessageSquarePlus} onClick={() => setNoteOpen((v) => !v)} aria-expanded={noteOpen}>
              Add investigation note
            </Button>
          </div>
        </div>
      </div>

      {noteOpen && (
        <form
          className="border-t border-ink-700 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim().length < 3) {
              setNoteError("Write at least a few words so teammates can follow your reasoning.");
              return;
            }
            addNote(note.trim());
            setNote("");
            setNoteError("");
            setNoteOpen(false);
          }}
        >
          <label htmlFor="note" className="text-xs font-medium text-text-secondary">
            Investigation note <span className="font-normal text-text-muted">(timestamped {hhmm(t)} UTC, visible to responders)</span>
          </label>
          <textarea
            id="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={!!noteError}
            aria-describedby={noteError ? "note-err" : undefined}
            className="mt-1.5 w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-xs text-text-primary placeholder:text-text-muted"
            placeholder="eg. Slow traces appear on both v3.18.1 and v3.18.2 instances. Canary alone does not explain it."
          />
          {noteError && (
            <p id="note-err" className="mt-1 text-2xs text-status-elevated">
              {noteError}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Add note
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={`Set incident status to ${pending ? statusLabel(pending) : ""}?`}
        body={
          pending === "resolved" ? (
            <>
              Resolving closes the incident and stops paging. The evidence still shows elevated latency at {hhmm(t)} UTC, and the hypothesis is not confirmed. Make sure that is
              intended.
            </>
          ) : pending === "mitigated" ? (
            <>Mitigated tells responders customer impact has stopped. Current telemetry still shows Create Payout P95 at {formatMetric("create-payout.p95", t)}.</>
          ) : (
            <>This updates the status for everyone following {inc.id} and is recorded in the activity log.</>
          )
        }
        confirmLabel={`Set to ${pending ? statusLabel(pending) : ""}`}
        tone={pending === "resolved" ? "danger" : "primary"}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) setStatus(pending);
          setPending(null);
        }}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(800);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function EventLane({ events, from, to, selectedId, onSelect, window: win }: { events: TimelineEvent[]; from: number; to: number; selectedId: string | null; onSelect: (id: string | null) => void; window: { from: number; to: number } | null }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const laneH = 26;
  const h = LANES.length * laneH + 6;
  const plotW = Math.max(10, width - Y_W - RIGHT);
  const x = (m: number) => Y_W + ((m - from) / (to - from)) * plotW;
  const visible = events.filter((e) => e.minute >= from && e.minute <= to);

  // Stagger markers that would overlap within a lane so each stays clickable.
  const lastX: Record<number, number> = {};
  const flip: Record<number, number> = {};
  const placed = [...visible]
    .sort((a, b) => a.minute - b.minute)
    .map((e) => {
      const lane = LANES.findIndex((l) => l.types.includes(e.type));
      const cx = x(e.minute);
      let cy = lane * laneH + 3 + (laneH - 2) / 2;
      if (lastX[lane] !== undefined && cx - lastX[lane] < 13) {
        flip[lane] = (flip[lane] ?? 0) + 1;
        cy += flip[lane] % 2 ? -5 : 5;
      } else flip[lane] = 0;
      lastX[lane] = cx;
      return { e, lane, cx, cy };
    });

  return (
    <div ref={ref} className="relative">
      <svg width="100%" height={h} role="group" aria-label="Timeline events by category. Use Tab to move between events and Enter to select.">
        {LANES.map((l, i) => (
          <g key={l.id}>
            <rect x={Y_W} y={i * laneH + 3} width={plotW} height={laneH - 2} fill={i % 2 ? "#0E1729" : "#101B30"} />
            <text x={0} y={i * laneH + 18} fontSize={10.5} fill="#8492B4">
              {l.label}
            </text>
          </g>
        ))}
        {win && <rect x={x(Math.max(from, win.from))} y={0} width={Math.max(0, x(Math.min(to, win.to)) - x(Math.max(from, win.from)))} height={h} fill="#1AA3B8" opacity={0.1} />}
        {placed.map(({ e, cx, cy }) => {
          const sel = e.id === selectedId;
          const meta = TYPE_META[e.type];
          return (
            <g
              key={e.id}
              role="button"
              tabIndex={0}
              aria-pressed={sel}
              aria-label={`${hhmm(e.minute)} UTC. ${meta.label}: ${e.title}`}
              className="cursor-pointer"
              onClick={() => onSelect(sel ? null : e.id)}
              onKeyDown={(k) => {
                if (k.key === "Enter" || k.key === " ") {
                  k.preventDefault();
                  onSelect(sel ? null : e.id);
                }
              }}
            >
              <title>{`${hhmm(e.minute)} ${e.title}`}</title>
              {sel && <line x1={cx} x2={cx} y1={0} y2={h} stroke="#5FD4E4" strokeWidth={1.5} />}
              <circle className="focus-ring" cx={cx} cy={cy} r={9} fill="none" stroke="transparent" opacity={0} pointerEvents="none" />
              <rect x={cx - 5} y={cy - 5} width={10} height={10} rx={e.type === "incident-detection" ? 5 : 2} transform={`rotate(${e.type.includes("change") || e.type === "deployment" ? 45 : 0} ${cx} ${cy})`} fill={sel ? meta.color : "#0E1729"} stroke={meta.color} strokeWidth={2} pointerEvents="none" />
              <rect x={cx - 6} y={cy - 7} width={12} height={14} fill="transparent" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function EventDetail({ ev, onClose }: { ev: TimelineEvent; onClose: () => void }) {
  const { go, patch, pin } = useInvestigation();
  const meta = TYPE_META[ev.type];
  return (
    <div className="my-2 rounded-md border border-accent-cyan/40 bg-accent-cyan/[0.05] p-3 animate-fade-in" role="region" aria-label="Selected event">
      <div className="flex items-start gap-2">
        <meta.icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: meta.color }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-accent-cyanSoft">{hhmm(ev.minute)} UTC</span>
            <span className="text-2xs uppercase tracking-wider text-text-muted">{meta.label}</span>
            <span className="text-2xs text-text-muted">· Source: {ev.source}</span>
          </div>
          <h3 className="mt-1 text-sm font-medium text-text-primary">{ev.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">{ev.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-2xs uppercase tracking-wider text-text-muted">Services</span>
            {ev.services.map((s: ServiceId) => (
              <button key={s} type="button" onClick={() => go("topology", { serviceId: s })} className="inline-flex items-center gap-1 rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 text-2xs text-text-secondary hover:text-text-primary">
                <Network className="h-3 w-3" aria-hidden />
                {SERVICE_BY_ID[s].name}
              </button>
            ))}
          </div>
          {ev.metricKeys.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 text-2xs text-text-muted">
              {ev.metricKeys.map((k) => (
                <span key={k}>
                  {metric(k).label} at {hhmm(ev.minute)}: <span className="font-mono text-text-secondary">{formatMetric(k, ev.minute)}</span>
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {ev.traceIds.map((id) => {
              const tr = TRACE_BY_ID[id];
              const sp = tr.spans.find((s) => s.service === "payment-orchestration")?.id ?? null;
              return (
                <Button key={id} size="xs" variant="primary" icon={Waypoints} onClick={() => go("traces", { traceId: id, spanId: sp, serviceId: "payment-orchestration" })}>
                  Open {id}
                </Button>
              );
            })}
            {ev.traceIds.length === 0 && <span className="self-center text-2xs text-text-muted">No sampled traces attached to this event.</span>}
            <Button size="xs" icon={Clock} onClick={() => patch({ window: { from: ev.minute - 3, to: ev.minute + 3 } })}>
              Use ±3 min as investigation window
            </Button>
            <Button size="xs" variant="ghost" icon={Pin} onClick={() => pin({ id: `evt-${ev.id}`, label: `${hhmm(ev.minute)} ${ev.title}`, detail: ev.source, view: "incident", ref: { eventId: ev.id } })}>
              Pin
            </Button>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close event details" className="rounded p-1 text-text-muted hover:text-text-primary">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function EventLog({ events, selectedId, onSelect }: { events: TimelineEvent[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <Panel title="Event log" subtitle="The same events as a list, in time order." bodyClassName="p-0">
      <ol className="divide-y divide-ink-700/60">
        {events.map((e) => {
          const meta = TYPE_META[e.type];
          const sel = e.id === selectedId;
          return (
            <li key={e.id}>
              <button
                type="button"
                aria-pressed={sel}
                onClick={() => onSelect(e.id)}
                className={clsx("flex w-full items-start gap-3 px-4 py-2 text-left text-xs transition-colors", sel ? "bg-accent-cyan/[0.07]" : "hover:bg-ink-800")}
              >
                <span className="w-10 shrink-0 font-mono text-text-muted">{hhmm(e.minute)}</span>
                <meta.icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: meta.color }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-text-primary">{e.title}</span>
                  <span className="block text-2xs text-text-muted">
                    {meta.label} · {e.services.map((s) => SERVICE_BY_ID[s].name).join(", ")}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

type Tab = "hypothesis" | "evidence" | "payouts" | "activity";

function IncidentDetail() {
  const { state, markJourney } = useInvestigation();
  const [tab, setTab] = useState<Tab>("hypothesis");
  const tabs: { id: Tab; label: string; icon: LucideIcon; count?: number }[] = [
    { id: "hypothesis", label: "Hypothesis", icon: Lightbulb },
    { id: "evidence", label: "Evidence", icon: FlaskConical, count: INCIDENT_BY_ID[state.incidentId].evidence.length + state.pinned.length },
    { id: "payouts", label: "Payouts", icon: Clock },
    { id: "activity", label: "Notes", icon: MessageSquarePlus, count: state.notes.length || undefined },
  ];

  const hypRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tab !== "hypothesis" || !hypRef.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && markJourney("hypothesis"), { threshold: 0.2 });
    io.observe(hypRef.current);
    return () => io.disconnect();
  }, [tab, markJourney]);

  return (
    <aside id="hypothesis" className="min-w-0 rounded-lg border border-ink-700 bg-ink-850/80 xl:sticky xl:top-[120px] xl:max-h-[calc(100vh-136px)] xl:overflow-y-auto" aria-label="Incident details">
      <div role="tablist" aria-label="Incident detail sections" className="sticky top-0 z-10 flex border-b border-ink-700 bg-ink-850">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            role="tab"
            id={`tab-${tb.id}`}
            aria-selected={tab === tb.id}
            aria-controls={`panel-${tb.id}`}
            onClick={() => setTab(tb.id)}
            onKeyDown={(e) => {
              const i = tabs.findIndex((x) => x.id === tab);
              if (e.key === "ArrowRight") setTab(tabs[(i + 1) % tabs.length].id);
              if (e.key === "ArrowLeft") setTab(tabs[(i - 1 + tabs.length) % tabs.length].id);
            }}
            className={clsx(
              "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-xs transition-colors",
              tab === tb.id ? "border-accent text-text-primary" : "border-transparent text-text-muted hover:text-text-secondary",
            )}
          >
            <tb.icon className="h-3.5 w-3.5" aria-hidden />
            {tb.label}
            {tb.count ? <span className="rounded bg-ink-700 px-1 text-2xs">{tb.count}</span> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="p-4">
        {tab === "hypothesis" && (
          <div ref={hypRef}>
            <HypothesisTab />
          </div>
        )}
        {tab === "evidence" && <EvidenceTab />}
        {tab === "payouts" && <PayoutsTab />}
        {tab === "activity" && <ActivityTab />}
      </div>
    </aside>
  );
}

function navigateTo(go: ReturnType<typeof useInvestigation>["go"], patch: ReturnType<typeof useInvestigation>["patch"], ref: EvidenceItem["sources"][number]["ref"]) {
  const v: ViewId = ref.view;
  if (v === "traces") go("traces", { traceId: ref.id ?? null, spanId: ref.spanId ?? null });
  else if (v === "topology") go("topology", { serviceId: (ref.id as ServiceId) ?? null });
  else if (v === "health") go("health", ref.id ? { endpointId: ref.id as never } : undefined);
  else {
    patch({ eventId: ref.id ?? null });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function HypothesisTab() {
  const { state, go, patch, toggleStep } = useInvestigation();
  const inc = INCIDENT_BY_ID[state.incidentId];
  const observed = inc.evidence.filter((e) => e.kind === "observed").slice(2, 7);
  const hyps = inc.evidence.filter((e) => e.kind === "hypothesis");

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-accent/40 bg-gradient-to-b from-accent/10 to-transparent p-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-accent-soft" aria-hidden />
          <span className="text-2xs font-semibold uppercase tracking-wider text-accent-soft">Investigation summary</span>
          <span className="ml-auto rounded border border-dashed border-ink-500 px-1.5 text-2xs text-text-secondary">Not confirmed</span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-text-primary">{inc.summary}</p>
        <div className="mt-2 flex items-center gap-1.5 text-2xs text-text-muted">
          <span>Leading candidate:</span>
          <button type="button" onClick={() => go("topology", { serviceId: inc.primaryService })} className="text-accent-soft underline underline-offset-2">
            {SERVICE_BY_ID[inc.primaryService].name}
          </button>
          <span>· Underlying cause: unknown</span>
        </div>
      </div>

      <div>
        <SectionLabel>Supporting evidence</SectionLabel>
        <ul className="space-y-2">
          {observed.map((e) => (
            <li key={e.id} className="text-xs leading-relaxed">
              <div className="flex items-start gap-2">
                <EvidenceTag kind={e.kind} />
                <span className="text-text-secondary">{e.statement}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 pl-[70px]">
                {e.sources.map((s) => (
                  <button key={s.label} type="button" onClick={() => navigateTo(go, patch, s.ref)} className="inline-flex items-center gap-1 text-2xs text-accent-soft hover:underline">
                    <ArrowRight className="h-3 w-3" aria-hidden />
                    {s.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <SectionLabel>Suspected causes and alternatives</SectionLabel>
        <ul className="space-y-1.5">
          {hyps.map((h, i) => (
            <li key={h.id} className="rounded-md border border-dashed border-ink-600 px-3 py-2 text-xs">
              <div className="flex items-start gap-2">
                <span className="font-mono text-2xs text-text-muted">H{i + 1}</span>
                <span className="text-text-secondary">{h.statement}</span>
              </div>
              <div className="mt-1 pl-6 text-2xs text-text-muted">
                {h.supporting?.length ?? 0} supporting · {h.against?.length ?? 0} against · {h.missing?.length ?? 0} missing data
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-2xs text-text-muted">Details in the Evidence tab. None of these are verified.</p>
      </div>

      <div>
        <SectionLabel>Next diagnostic steps</SectionLabel>
        <ol className="space-y-1">
          {inc.nextSteps.map((s, i) => {
            const done = state.checkedSteps.includes(i);
            return (
              <li key={s}>
                <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs hover:bg-ink-800">
                  <input type="checkbox" checked={done} onChange={() => toggleStep(i)} className="mt-0.5 accent-[#5B7BF0]" />
                  <span className={clsx("leading-relaxed", done ? "text-text-muted line-through" : "text-text-secondary")}>{s}</span>
                </label>
              </li>
            );
          })}
        </ol>
      </div>

      <div>
        <SectionLabel>Supporting traces</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {inc.supportingTraceIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => go("traces", { traceId: id, spanId: TRACE_BY_ID[id].spans.find((s) => s.service === "payment-orchestration")?.id ?? null })}
              className="inline-flex items-center gap-1 rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-2xs text-text-secondary hover:text-text-primary"
            >
              <Waypoints className="h-3 w-3" aria-hidden />
              {id}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EvidenceTab() {
  const { state, go, patch, unpin } = useInvestigation();
  const inc = INCIDENT_BY_ID[state.incidentId];
  const groups: { kind: EvidenceItem["kind"]; title: string; blurb: string }[] = [
    { kind: "observed", title: "Observed facts", blurb: "Measured directly. Each links to its source." },
    { kind: "inferred", title: "Inferred relationships", blurb: "Drawn from several observations. Could be wrong." },
    { kind: "hypothesis", title: "Unverified hypotheses", blurb: "Candidate explanations to test." },
  ];
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.kind}>
          <div className="mb-2 flex items-center gap-2">
            <EvidenceTag kind={g.kind} />
            <h3 className="text-xs font-semibold text-text-primary">{g.title}</h3>
          </div>
          <p className="mb-2 text-2xs text-text-muted">{g.blurb}</p>
          <ul className="space-y-2">
            {inc.evidence
              .filter((e) => e.kind === g.kind)
              .map((e) => (
                <li key={e.id} className={clsx("rounded-md border p-2.5 text-xs", g.kind === "hypothesis" ? "border-dashed border-ink-600" : "border-ink-700 bg-ink-900/40")}>
                  <p className="leading-relaxed text-text-secondary">{e.statement}</p>
                  {e.confidence && <p className="mt-1 text-2xs text-text-muted">Confidence: {e.confidence}</p>}
                  {e.supporting && <MiniList label="Supporting" items={e.supporting} tone="text-status-healthy" />}
                  {e.against && <MiniList label="Against" items={e.against} tone="text-status-elevated" />}
                  {e.missing && <MiniList label="Missing data" items={e.missing} tone="text-text-muted" />}
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {e.sources.map((s) => (
                      <button key={s.label} type="button" onClick={() => navigateTo(go, patch, s.ref)} className="inline-flex items-center gap-1 text-2xs text-accent-soft hover:underline">
                        <ArrowRight className="h-3 w-3" aria-hidden />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-primary">
          <Pin className="h-3.5 w-3.5" aria-hidden /> Pinned by you
        </h3>
        {state.pinned.length === 0 ? (
          <EmptyState icon={Pin} title="Nothing pinned yet">
            Use Pin on a service, span or timeline event to collect evidence here as you investigate.
          </EmptyState>
        ) : (
          <ul className="space-y-1.5">
            {state.pinned.map((p) => (
              <li key={p.id} className="flex items-start gap-2 rounded-md border border-ink-700 bg-ink-900/40 px-2.5 py-2 text-xs">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() =>
                    p.view === "traces"
                      ? go("traces", { traceId: p.ref.traceId, spanId: p.ref.spanId })
                      : p.view === "topology"
                        ? go("topology", { serviceId: p.ref.serviceId })
                        : patch({ eventId: p.ref.eventId })
                  }
                >
                  <span className="block truncate text-text-primary">{p.label}</span>
                  <span className="block text-2xs text-text-muted">{p.detail}</span>
                </button>
                <button type="button" onClick={() => unpin(p.id)} aria-label={`Unpin ${p.label}`} className="text-text-muted hover:text-text-primary">
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MiniList({ label, items, tone }: { label: string; items: string[]; tone: string }) {
  return (
    <div className="mt-1.5">
      <span className={clsx("text-2xs font-semibold uppercase tracking-wider", tone)}>{label}</span>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-2xs leading-relaxed text-text-muted">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

const STATE_STYLE: Record<string, string> = {
  COMPLETED: "text-status-healthy",
  PENDING_BEYOND_WINDOW: "text-status-elevated",
  PENDING_UNKNOWN: "text-status-unavailable",
  SUBMITTED_TO_PARTNER: "text-accent-soft",
};

function PayoutsTab() {
  const { state, go } = useInvestigation();
  const t = state.clock;
  const rows = PAYOUTS.filter((p) => p.createdMinute <= t);
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-text-secondary">
        <span className="font-mono text-text-primary">{formatMetric("payouts.pendingBeyondWindow", t)}</span> payouts are pending past the 5 minute window right now. Sampled
        payouts with traces:
      </p>
      <ul className="space-y-2">
        {rows.map((p) => (
          <li key={p.payoutId} className="rounded-md border border-ink-700 bg-ink-900/40 p-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono text-text-primary">{p.payoutId}</span>
              <span className="text-2xs text-text-muted">
                {p.corridor} · {p.rail}
              </span>
              <span className={clsx("ml-auto font-mono text-2xs", STATE_STYLE[p.currentState] ?? "text-text-secondary")}>{p.currentState}</span>
            </div>
            <ol className="mt-1.5 flex flex-wrap items-center gap-1 text-2xs text-text-muted">
              {p.events
                .filter((e) => e.minute <= t)
                .map((e, i) => (
                  <li key={i} className="flex items-center gap-1">
                    {i > 0 && <ArrowRight className="h-2.5 w-2.5" aria-hidden />}
                    <span className="font-mono">{hhmmss(e.minute, e.second)}</span>
                    <span className={STATE_STYLE[e.state]}>{e.state.replace(/_/g, " ").toLowerCase()}</span>
                  </li>
                ))}
            </ol>
            {p.traceId && (
              <button type="button" onClick={() => go("traces", { traceId: p.traceId!, spanId: null })} className="mt-1.5 inline-flex items-center gap-1 text-2xs text-accent-soft hover:underline">
                <Waypoints className="h-3 w-3" aria-hidden /> {p.traceId}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityTab() {
  const { state } = useInvestigation();
  const items = [
    ...state.activity.map((a) => ({ ...a, kind: "activity" as const })),
    ...state.notes.map((n) => ({ id: n.id, minute: n.minute, text: n.text, kind: "note" as const, author: n.author })),
  ].sort((a, b) => a.minute - b.minute);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-2xs text-text-muted">
        <ListChecks className="h-3.5 w-3.5" aria-hidden /> Status changes, notes and paging, oldest first. Add a note from the incident header.
      </div>
      <ol className="space-y-2 border-l border-ink-600 pl-3">
        {items.map((a) => (
          <li key={a.id} className="relative text-xs">
            <span aria-hidden className={clsx("absolute -left-[17px] top-1.5 h-2 w-2 rounded-full", a.kind === "note" ? "bg-accent-cyan" : "bg-ink-500")} />
            <span className="font-mono text-2xs text-text-muted">{hhmm(a.minute)} UTC</span>
            {a.kind === "note" ? (
              <div className="mt-0.5 rounded-md border border-accent-cyan/30 bg-accent-cyan/[0.05] px-2.5 py-1.5">
                <span className="text-2xs font-medium text-accent-cyanSoft">{"author" in a ? a.author : ""} noted</span>
                <p className="mt-0.5 text-text-primary">{a.text}</p>
              </div>
            ) : (
              <p className="text-text-secondary">{a.text}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
