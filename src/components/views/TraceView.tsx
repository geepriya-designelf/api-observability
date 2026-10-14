"use client";

import clsx from "clsx";
import { AlertTriangle, CheckCircle2, CircleAlert, FileWarning, Layers, Network, Pin, Search, Timer, Waypoints, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { hhmm, hhmmss } from "@/data/metrics";
import { ENDPOINT_BY_ID, INCIDENT_BY_ID, SERVICE_BY_ID, TRACES, TRACE_BY_ID, orderedSpans, selfTimeMs, slowestSpan, spanDepth } from "@/data/mock";
import type { Span, SpanStatus, Trace, TraceOutcome } from "@/data/types";
import { useInvestigation } from "@/lib/store";
import { Button, EmptyState, KeyValue, Panel, SectionLabel, Tooltip } from "../ui";
import { PageHeader } from "./HealthView";

const BASELINE_TRACE_ID = "trace-payout-0987";

const OUTCOME_META: Record<TraceOutcome, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  healthy: { label: "Healthy", cls: "text-status-healthy border-status-healthy/40 bg-status-healthy/10", icon: CheckCircle2 },
  slow: { label: "Slow", cls: "text-status-elevated border-status-elevated/40 bg-status-elevated/10", icon: Timer },
  failed: { label: "Failed", cls: "text-status-unavailable border-status-unavailable/50 bg-status-unavailable/10", icon: CircleAlert },
};

const SPAN_COLOR: Record<SpanStatus, string> = { ok: "#5B7BF0", warning: "#F5A524", error: "#EF4444" };

function OutcomeBadge({ outcome }: { outcome: TraceOutcome }) {
  const m = OUTCOME_META[outcome];
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded border px-1.5 text-2xs font-medium", m.cls)}>
      <m.icon className="h-3 w-3" aria-hidden />
      {m.label}
    </span>
  );
}

const absTime = (tr: Trace, offsetMs: number) => {
  const totalMs = tr.startSecond * 1000 + offsetMs;
  const minute = tr.startMinute + Math.floor(totalMs / 60000);
  const rem = totalMs % 60000;
  return `${hhmmss(minute, Math.floor(rem / 1000))}.${String(rem % 1000).padStart(3, "0")}`;
};

export function TraceView() {
  const { state, patch, go, pin, markJourney } = useInvestigation();
  const t = state.clock;
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<"all" | TraceOutcome>("all");
  const [useWindow, setUseWindow] = useState(true);
  const [useService, setUseService] = useState(true);
  const [overlay, setOverlay] = useState(true);

  const trace = state.traceId ? TRACE_BY_ID[state.traceId] : null;
  const span = trace && state.spanId ? trace.spans.find((s) => s.id === state.spanId) ?? null : null;

  useEffect(() => {
    if (trace && span && span.service === "payment-orchestration" && trace.outcome !== "healthy") markJourney("trace");
  }, [trace, span, markJourney]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TRACES.filter((tr) => tr.startMinute <= t)
      .filter((tr) => outcome === "all" || tr.outcome === outcome)
      .filter((tr) => !(useWindow && state.window) || (tr.startMinute >= state.window!.from && tr.startMinute <= state.window!.to))
      .filter((tr) => !(useService && state.serviceId) || tr.spans.some((s) => s.service === state.serviceId))
      .filter((tr) => {
        if (!q) return true;
        const ep = ENDPOINT_BY_ID[tr.endpoint];
        const hay = [tr.id, tr.payoutId ?? "", ep.name, ep.path, tr.summary, ...tr.spans.map((s) => `${SERVICE_BY_ID[s.service].name} ${s.operation} ${s.id}`)].join(" ").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.startMinute * 60 + b.startSecond - (a.startMinute * 60 + a.startSecond));
  }, [query, outcome, useWindow, useService, state.window, state.serviceId, t]);

  const openTrace = (tr: Trace) => {
    const slow = slowestSpan(tr);
    patch({ traceId: tr.id, spanId: tr.outcome === "healthy" ? null : slow.id });
  };

  return (
    <div className="mx-auto max-w-[1700px] space-y-4">
      <PageHeader
        title="Trace Explorer"
        description="Follow one request through every service it touched. The waterfall shows where the time went. Select a span for attributes, logs and errors."
      />

      <div className="grid items-start gap-4 xl:grid-cols-[272px_minmax(0,1fr)] min-[1800px]:grid-cols-[280px_minmax(0,1fr)_400px]">
        {/* Trace list */}
        <Panel className="xl:row-span-2 min-[1800px]:row-span-1" title="Sampled traces" subtitle={`${list.length} of ${TRACES.filter((x) => x.startMinute <= t).length} up to ${hhmm(t)} UTC`} bodyClassName="p-3">
          <label className="relative block">
            <span className="sr-only">Search traces</span>
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Trace ID, payout ID, service, endpoint"
              className="w-full rounded-md border border-ink-600 bg-ink-900 py-1.5 pl-8 pr-2 text-xs text-text-primary placeholder:text-text-muted"
            />
          </label>
          <div role="radiogroup" aria-label="Filter by outcome" className="mt-2 flex gap-1">
            {(["all", "healthy", "slow", "failed"] as const).map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={outcome === o}
                onClick={() => setOutcome(o)}
                className={clsx("rounded px-2 py-0.5 text-2xs capitalize", outcome === o ? "bg-ink-600 text-text-primary" : "text-text-muted hover:text-text-secondary")}
              >
                {o}
              </button>
            ))}
          </div>
          {(state.window || state.serviceId) && (
            <div className="mt-2 space-y-1 text-2xs text-text-secondary">
              {state.window && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={useWindow} onChange={(e) => setUseWindow(e.target.checked)} className="accent-[#1AA3B8]" />
                  Only in window {hhmm(state.window.from)} to {hhmm(state.window.to)}
                </label>
              )}
              {state.serviceId && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={useService} onChange={(e) => setUseService(e.target.checked)} className="accent-[#5B7BF0]" />
                  Only touching {SERVICE_BY_ID[state.serviceId].name}
                </label>
              )}
            </div>
          )}
          <ul className="mt-3 space-y-1.5" aria-label="Traces">
            {list.length === 0 && (
              <li>
                <EmptyState icon={Search} title="No traces match">
                  Try clearing the search or widening the investigation window.
                </EmptyState>
              </li>
            )}
            {list.map((tr) => {
              const sel = tr.id === state.traceId;
              return (
                <li key={tr.id}>
                  <button
                    type="button"
                    aria-pressed={sel}
                    onClick={() => openTrace(tr)}
                    className={clsx(
                      "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                      sel ? "border-accent/60 bg-accent/10" : "border-ink-700 bg-ink-900/40 hover:border-ink-600 hover:bg-ink-800",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-[11.5px] text-text-primary">{tr.id}</span>
                      <span className="ml-auto">
                        <OutcomeBadge outcome={tr.outcome} />
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-2xs text-text-muted">
                      <span>{ENDPOINT_BY_ID[tr.endpoint].name}</span>
                      <span aria-hidden>·</span>
                      <span className="font-mono">{hhmmss(tr.startMinute, tr.startSecond)}</span>
                      <span className="ml-auto font-mono text-text-secondary">{tr.durationMs.toLocaleString("en-US")} ms</span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-2xs leading-snug text-text-muted">{tr.summary}</div>
                    {tr.incidentId && <div className="mt-1 text-2xs text-red-300/90">Linked to {tr.incidentId}</div>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Waterfall */}
        <div className="min-w-0 space-y-4">
          {trace ? (
            <Waterfall trace={trace} selectedSpanId={state.spanId} onSelect={(id) => patch({ spanId: id })} overlay={overlay} setOverlay={setOverlay} />
          ) : (
            <Panel title="No trace selected">
              <EmptyState icon={Waypoints} title="Select a trace to see its waterfall" action={
                <Button variant="primary" onClick={() => openTrace(TRACE_BY_ID[INCIDENT_BY_ID[state.incidentId].primaryTraceId])}>
                  Open the incident&apos;s slow payout trace
                </Button>
              }>
                Start with a slow or failed payout. A healthy trace from before the incident is available for comparison.
              </EmptyState>
            </Panel>
          )}
        </div>

        {/* Span detail: beneath the waterfall on laptops, its own column on wide screens */}
        <div className="min-w-0 xl:col-start-2 min-[1800px]:col-start-3 min-[1800px]:row-start-1">
          {trace && span ? (
            <SpanDetail
              trace={trace}
              span={span}
              onClose={() => patch({ spanId: null })}
              onPin={() => pin({ id: `span-${trace.id}-${span.id}`, label: `${span.id} (${trace.id})`, detail: `${SERVICE_BY_ID[span.service].name}: ${span.durationMs.toLocaleString("en-US")} ms`, view: "traces", ref: { traceId: trace.id, spanId: span.id } })}
              go={go}
            />
          ) : (
            <Panel title="Span details">
              <EmptyState title="No span selected">Select a row in the waterfall to inspect its attributes, logs and errors.</EmptyState>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Waterfall({ trace, selectedSpanId, onSelect, overlay, setOverlay }: { trace: Trace; selectedSpanId: string | null; onSelect: (id: string) => void; overlay: boolean; setOverlay: (v: boolean) => void }) {
  const { go } = useInvestigation();
  const spans = orderedSpans(trace);
  const slow = slowestSpan(trace);
  const slowSelf = selfTimeMs(trace, slow);
  const share = Math.round((slow.durationMs / trace.durationMs) * 100);
  const baseline = trace.endpoint === "create-payout" && trace.id !== BASELINE_TRACE_ID ? TRACE_BY_ID[BASELINE_TRACE_ID] : null;
  const scale = Math.max(trace.durationMs, overlay && baseline ? baseline.durationMs : 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(scale * f));
  const ep = ENDPOINT_BY_ID[trace.endpoint];

  return (
    <>
      <Panel
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{trace.id}</span>
            <OutcomeBadge outcome={trace.outcome} />
          </span>
        }
        subtitle={`${ep.method} ${ep.path} · started ${hhmmss(trace.startMinute, trace.startSecond)} UTC · HTTP ${trace.httpStatus}${trace.payoutId ? ` · ${trace.payoutId}` : ""}`}
        actions={
          <div className="flex gap-2">
            {trace.incidentId && (
              <Button size="xs" icon={Layers} onClick={() => go("incident")}>
                Open incident
              </Button>
            )}
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="grid gap-px border-b border-ink-700 bg-ink-700 sm:grid-cols-3">
          <Stat label="Total duration" value={`${trace.durationMs.toLocaleString("en-US")} ms`} />
          <Stat label="Spans" value={String(trace.spans.length)} />
          <Stat label="Services" value={String(new Set(trace.spans.map((s) => s.service)).size)} />
        </div>

        {trace.outcome !== "healthy" && (
          <div className="flex flex-wrap items-start gap-3 border-b border-ink-700 bg-accent-cyan/[0.05] px-4 py-3">
            <Timer className="mt-0.5 h-4 w-4 shrink-0 text-accent-cyanSoft" aria-hidden />
            <div className="min-w-0 flex-1 text-xs leading-relaxed">
              <div className="text-text-primary">
                <span className="font-medium">Most self time: </span>
                <button type="button" className="font-mono text-accent-cyanSoft underline decoration-dotted underline-offset-2" onClick={() => onSelect(slow.id)}>
                  {slow.id}
                </button>{" "}
                in {SERVICE_BY_ID[slow.service].name}, {slowSelf.toLocaleString("en-US")} ms of its own time. The span covers {share}% of the request.
              </div>
              <div className="mt-1 flex items-start gap-1.5 text-text-muted">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-status-elevated" aria-hidden />
                <span>
                  This shows <b className="font-medium text-text-secondary">where</b> time was spent, not <b className="font-medium text-text-secondary">why</b>. Check the span&apos;s logs and the
                  incident timeline before treating it as the cause.
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 pb-4 pt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <SectionLabel className="mb-0">Waterfall</SectionLabel>
            {baseline && (
              <label className="flex items-center gap-2 text-2xs text-text-secondary">
                <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} className="accent-[#8492B4]" />
                Overlay healthy baseline (<span className="font-mono">{BASELINE_TRACE_ID}</span>, {baseline.durationMs} ms)
              </label>
            )}
          </div>
          <div className="relative overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[260px_minmax(0,1fr)] text-2xs text-text-muted">
                <div className="py-1">Span</div>
                <div className="relative h-5">
                  {ticks.map((tk, i) => (
                    <span key={i} className="absolute top-1 -translate-x-1/2 font-mono" style={{ left: `${(tk / scale) * 100}%`, transform: i === ticks.length - 1 ? "translateX(-100%)" : i === 0 ? "none" : undefined }}>
                      {tk} ms
                    </span>
                  ))}
                </div>
              </div>
              <ul role="listbox" aria-label="Spans" className="relative">
                {spans.map((s) => {
                  const depth = spanDepth(trace, s);
                  const sel = s.id === selectedSpanId;
                  const isSlow = s.id === slow.id && trace.outcome !== "healthy";
                  const base = overlay && baseline ? baseline.spans.find((b) => b.id === s.id) : null;
                  const self = selfTimeMs(trace, s);
                  return (
                    <li key={s.id} role="option" aria-selected={sel}>
                      <button
                        type="button"
                        onClick={() => onSelect(s.id)}
                        aria-label={`${SERVICE_BY_ID[s.service].name} ${s.operation}, starts at ${s.startMs} ms, lasts ${s.durationMs} ms, status ${s.status}${isSlow ? ", most self time" : ""}`}
                        className={clsx(
                          "grid w-full grid-cols-[260px_minmax(0,1fr)] items-center rounded text-left transition-colors",
                          sel ? "bg-accent/10 ring-1 ring-inset ring-accent/50" : "hover:bg-ink-800",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1.5 py-1.5 pr-2" style={{ paddingLeft: 6 + depth * 14 }}>
                          {depth > 0 && <span aria-hidden className="h-px w-2 shrink-0 bg-ink-500" />}
                          {s.status === "error" ? (
                            <CircleAlert className="h-3 w-3 shrink-0 text-status-unavailable" aria-hidden />
                          ) : s.status === "warning" ? (
                            <AlertTriangle className="h-3 w-3 shrink-0 text-status-elevated" aria-hidden />
                          ) : (
                            <span aria-hidden className="h-3 w-3 shrink-0" />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-xs text-text-primary">{SERVICE_BY_ID[s.service].name}</span>
                            <span className="block truncate font-mono text-2xs text-text-muted">{s.operation}</span>
                          </span>
                        </span>
                        <span className="relative block h-8">
                          {ticks.slice(1, -1).map((tk, i) => (
                            <span key={i} aria-hidden className="absolute inset-y-0 w-px bg-ink-700/60" style={{ left: `${(tk / scale) * 100}%` }} />
                          ))}
                          {base && (
                            <span
                              aria-hidden
                              className="absolute top-[22px] h-1 rounded-full bg-text-muted/50"
                              style={{ left: `${(base.startMs / scale) * 100}%`, width: `max(2px, ${(base.durationMs / scale) * 100}%)` }}
                              title={`Baseline ${base.durationMs} ms`}
                            />
                          )}
                          <span
                            className={clsx("absolute top-2 h-3.5 rounded-sm", isSlow && "ring-2 ring-accent-cyanSoft ring-offset-1 ring-offset-ink-850")}
                            style={{ left: `${(s.startMs / scale) * 100}%`, width: `max(3px, ${(s.durationMs / scale) * 100}%)`, background: SPAN_COLOR[s.status], opacity: sel || isSlow ? 1 : 0.8 }}
                          />
                          <span
                            className={clsx(
                              "absolute top-[7px] whitespace-nowrap px-1.5 font-mono text-2xs",
                              labelPos(s, scale) === "inside" ? "font-semibold text-ink-950" : "text-text-secondary",
                            )}
                            style={labelStyle(s, scale)}
                          >
                            {s.durationMs.toLocaleString("en-US")} ms
                            {self !== s.durationMs && <span className={labelPos(s, scale) === "inside" ? "" : "text-text-muted"}> · self {self.toLocaleString("en-US")}</span>}
                            {isSlow && <span className={clsx("ml-1 rounded px-1", labelPos(s, scale) === "inside" ? "bg-ink-950/25" : "bg-accent-cyan/20 text-accent-cyanSoft")}>most self time</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap gap-4 text-2xs text-text-muted">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-2.5 w-4 rounded-sm" style={{ background: SPAN_COLOR.ok }} /> OK
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-2.5 w-4 rounded-sm" style={{ background: SPAN_COLOR.warning }} /> Warning
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-2.5 w-4 rounded-sm" style={{ background: SPAN_COLOR.error }} /> Error
                </span>
                {baseline && overlay && (
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="h-1 w-4 rounded-full bg-text-muted/50" /> Same span in healthy baseline
                  </span>
                )}
                <Tooltip content="Self time is the part of a span not covered by its child spans: work or waiting inside that service itself.">
                  <span tabIndex={0} className="underline decoration-dotted underline-offset-2">
                    What is self time?
                  </span>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      </Panel>
    </>
  );
}

/** Where a duration label fits: after the bar, inside a long bar, or before a bar near the end. */
function labelPos(s: Span, scale: number): "after" | "inside" | "before" {
  const end = (s.startMs + s.durationMs) / scale;
  if (end <= 0.72) return "after";
  return s.durationMs / scale >= 0.35 ? "inside" : "before";
}

function labelStyle(s: Span, scale: number): React.CSSProperties {
  const pos = labelPos(s, scale);
  const end = ((s.startMs + s.durationMs) / scale) * 100;
  if (pos === "after") return { left: `${end}%` };
  if (pos === "inside") return { right: `${100 - end}%` };
  return { right: `${100 - (s.startMs / scale) * 100}%` };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-850 px-4 py-2.5">
      <div className="text-2xs uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-text-primary">{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SpanDetail({ trace, span, onClose, onPin, go }: { trace: Trace; span: Span; onClose: () => void; onPin: () => void; go: ReturnType<typeof useInvestigation>["go"] }) {
  const self = selfTimeMs(trace, span);
  const svc = SERVICE_BY_ID[span.service];
  const parent = span.parentId ? trace.spans.find((s) => s.id === span.parentId) : null;

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {svc.name}
          <span className={clsx("rounded border px-1.5 text-2xs font-medium", span.status === "error" ? "border-status-unavailable/50 text-status-unavailable" : span.status === "warning" ? "border-status-elevated/50 text-status-elevated" : "border-status-healthy/40 text-status-healthy")}>
            {span.status.toUpperCase()}
          </span>
        </span>
      }
      subtitle={span.operation}
      actions={
        <>
          <Button size="xs" variant="ghost" icon={Pin} onClick={onPin} aria-label="Pin span to the investigation">
            Pin
          </Button>
          <button type="button" onClick={onClose} aria-label="Close span details" className="rounded p-1 text-text-muted hover:text-text-primary">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </>
      }
      className="animate-fade-in"
      bodyClassName="space-y-4"
    >
      <dl>
        <KeyValue k="Service" v={svc.name} />
        <KeyValue k="Span ID" v={span.id} mono />
        <KeyValue k="Trace ID" v={span.traceId} mono />
        <KeyValue k="Parent span" v={parent ? parent.id : "None (root)"} mono />
        <KeyValue k="Start" v={`${absTime(trace, span.startMs)} UTC (+${span.startMs} ms)`} mono />
        <KeyValue k="Duration" v={`${span.durationMs.toLocaleString("en-US")} ms (${Math.round((span.durationMs / trace.durationMs) * 100)}% of trace)`} mono />
        <KeyValue k="Self time" v={`${self.toLocaleString("en-US")} ms`} mono />
        <KeyValue k="Status" v={span.status} mono />
      </dl>

      {span.error && (
        <div className="rounded-md border border-status-unavailable/50 bg-status-unavailable/10 p-3 text-xs" role="alert">
          <div className="flex items-center gap-1.5 font-medium text-red-300">
            <CircleAlert className="h-3.5 w-3.5" aria-hidden />
            {span.error.type}
          </div>
          <p className="mt-1 text-text-secondary">{span.error.message}</p>
        </div>
      )}

      <div>
        <SectionLabel>Attributes</SectionLabel>
        <dl className="rounded-md border border-ink-700 bg-ink-900/50 px-3 py-1">
          {Object.entries(span.attributes).map(([k, v]) => (
            <KeyValue key={k} k={<span className="font-mono text-[11px]">{k}</span>} v={String(v)} mono />
          ))}
        </dl>
      </div>

      <div>
        <SectionLabel>Logs ({span.logs.length})</SectionLabel>
        {span.logsUnavailableReason ? (
          <EmptyState icon={FileWarning} title="Logs unavailable for this span">
            {span.logsUnavailableReason}
          </EmptyState>
        ) : span.logs.length === 0 ? (
          <EmptyState title="No logs emitted by this span" />
        ) : (
          <ol className="space-y-1.5">
            {span.logs.map((l) => (
              <li key={l.id} className="rounded-md border border-ink-700 bg-ink-900/60 p-2 font-mono text-[11px]">
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      "rounded px-1 text-2xs font-semibold",
                      l.level === "ERROR" && "bg-status-unavailable/20 text-red-300",
                      l.level === "WARN" && "bg-status-elevated/20 text-amber-300",
                      l.level === "INFO" && "bg-accent/20 text-accent-soft",
                      l.level === "DEBUG" && "bg-ink-700 text-text-muted",
                    )}
                  >
                    {l.level}
                  </span>
                  <span className="text-text-muted">+{l.offsetMs} ms</span>
                </div>
                <p className="mt-1 font-sans text-xs text-text-primary">{l.message}</p>
                {l.attributes && (
                  <p className="mt-1 break-words text-text-muted">
                    {Object.entries(l.attributes)
                      .map(([k, v]) => `${k}=${v}`)
                      .join("  ")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-ink-700 pt-3">
        <Button size="xs" icon={Network} onClick={() => go("topology", { serviceId: span.service })}>
          View {svc.name} in topology
        </Button>
        {trace.incidentId && (
          <Button size="xs" icon={Layers} onClick={() => go("incident")}>
            Open {trace.incidentId}
          </Button>
        )}
      </div>
    </Panel>
  );
}
