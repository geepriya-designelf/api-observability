"use client";

import clsx from "clsx";
import { ArrowLeft, ArrowRight, Info, Layers, Maximize2, Pin, Waypoints, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { STATUS_META, serviceHealth } from "@/data/health";
import { formatDelta, formatMetric, formatValue, baselineAt, hhmm, metric } from "@/data/metrics";
import {
  EDGES,
  ENDPOINT_BY_ID,
  INCIDENT_BY_ID,
  SERVICES,
  SERVICE_BY_ID,
  TIMELINE_EVENTS,
  TRACES,
  downstreamOf,
  upstreamOf,
} from "@/data/mock";
import type { ServiceId } from "@/data/types";
import { useInvestigation } from "@/lib/store";
import { MetricChart } from "../charts";
import { Button, EmptyState, InfoTip, Panel, SectionLabel, StatusBadge } from "../ui";
import { PageHeader } from "./HealthView";

const W = 184;
const H = 92;
const POS: Record<ServiceId, { x: number; y: number }> = {
  "api-gateway": { x: 4, y: 170 },
  "payout-service": { x: 232, y: 170 },
  "compliance-service": { x: 460, y: 24 },
  "fx-service": { x: 460, y: 300 },
  "wallet-service": { x: 460, y: 410 },
  "payment-orchestration": { x: 688, y: 170 },
  "partner-rail-a": { x: 940, y: 60 },
  "partner-rail-b": { x: 940, y: 290 },
};

function edgePath(from: ServiceId, to: ServiceId) {
  const a = POS[from];
  const b = POS[to];
  const x1 = a.x + W;
  const y1 = a.y + H / 2;
  const x2 = b.x - 6;
  const y2 = b.y + H / 2;
  const mx = (x1 + x2) / 2;
  return { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, lx: mx, ly: (y1 + y2) / 2 };
}

export function TopologyView() {
  const { state, go, patch, pin, markJourney } = useInvestigation();
  const t = state.clock;
  const inc = INCIDENT_BY_ID[state.incidentId];
  const [focusIncident, setFocusIncident] = useState(true);
  const selected = state.serviceId;
  const endpoint = state.endpointId ? ENDPOINT_BY_ID[state.endpointId] : null;

  const health = useMemo(() => Object.fromEntries(SERVICES.map((s) => [s.id, serviceHealth(s.id, t)])) as Record<ServiceId, ReturnType<typeof serviceHealth>>, [t]);

  const related = useMemo(() => {
    if (!selected) return null;
    return { up: new Set(upstreamOf(selected)), down: new Set(downstreamOf(selected)) };
  }, [selected]);

  const select = useCallback(
    (id: ServiceId | null) => {
      patch({ serviceId: id });
      if (id === "payment-orchestration") markJourney("dependencies");
    },
    [patch, markJourney],
  );

  useEffect(() => {
    if (state.serviceId === "payment-orchestration") markJourney("dependencies");
  }, [state.serviceId, markJourney]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.serviceId) patch({ serviceId: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.serviceId, patch]);

  const incidentSet = new Set<ServiceId>(state.incidentStatus !== "resolved" ? inc.affectedServices : []);
  const pathSet = new Set<ServiceId>(endpoint ? endpoint.path_services : SERVICES.map((s) => s.id));

  const nodeEmphasis = (id: ServiceId): "selected" | "related" | "normal" | "dim" => {
    if (selected) {
      if (id === selected) return "selected";
      if (related?.up.has(id) || related?.down.has(id)) return "related";
      return "dim";
    }
    if (focusIncident && incidentSet.size && !incidentSet.has(id) && health[id].status === "healthy") return "dim";
    if (!pathSet.has(id)) return "dim";
    return "normal";
  };

  const edgeEmphasis = (from: ServiceId, to: ServiceId): "hot" | "normal" | "dim" => {
    if (selected && related) {
      const upSide = (n: ServiceId) => n === selected || related.up.has(n);
      const downSide = (n: ServiceId) => n === selected || related.down.has(n);
      // Hot when the edge lies on a call chain into or out of the selected service.
      return (upSide(from) && upSide(to)) || (downSide(from) && downSide(to)) ? "hot" : "dim";
    }
    if (focusIncident && incidentSet.size && !(incidentSet.has(to) || to === "payout-service")) return "dim";
    return "normal";
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <PageHeader
        title="Dependency Topology"
        description="How a payout request moves through services. Select a service to highlight what calls it (upstream) and what it calls (downstream), and to see why it is flagged."
      >
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Graph emphasis" className="flex rounded-md border border-ink-600 bg-ink-800 p-0.5 text-xs">
            {[
              { v: true, l: "Emphasise incident" },
              { v: false, l: "All services" },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                role="radio"
                aria-checked={focusIncident === o.v}
                onClick={() => setFocusIncident(o.v)}
                className={clsx("rounded px-2.5 py-1", focusIncident === o.v ? "bg-ink-600 text-text-primary" : "text-text-secondary hover:text-text-primary")}
              >
                {o.l}
              </button>
            ))}
          </div>
          <Button icon={Maximize2} onClick={() => patch({ serviceId: null, endpointId: null })} disabled={!selected && !endpoint}>
            Show complete graph
          </Button>
        </div>
      </PageHeader>

      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel
          title={endpoint ? `Request path: ${endpoint.method} ${endpoint.path}` : "All services"}
          subtitle={
            endpoint
              ? `Services a ${endpoint.name} request can touch. Other services are faded.`
              : "Complete dependency graph for the simulated payout ecosystem."
          }
          bodyClassName="p-2"
          actions={
            <div className="hidden items-center gap-3 text-2xs text-text-muted md:flex">
              {(["healthy", "elevated", "degraded", "unavailable"] as const).map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm border-2" style={{ borderColor: STATUS_META[s].hex }} />
                  {STATUS_META[s].label}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <Wrench className="h-3 w-3" aria-hidden /> Planned
              </span>
            </div>
          }
        >
          <div className="relative overflow-x-auto">
            <svg viewBox="0 0 1128 512" className="min-w-[760px]" role="group" aria-label="Service dependency graph. Use Tab to move between services and Enter to select.">
              <defs>
                {["normal", "hot", "dim"].map((k) => (
                  <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill={k === "hot" ? "#5FD4E4" : k === "dim" ? "#2A3A5E" : "#5B6E97"} />
                  </marker>
                ))}
              </defs>

              {/* Client entry */}
              <g aria-hidden>
                <text x={4} y={156} fill="#8492B4" fontSize={12}>
                  Client API request
                </text>
              </g>

              {EDGES.map((e) => {
                const p = edgePath(e.from, e.to);
                const emph = edgeEmphasis(e.from, e.to);
                const retries = e.retryMetric ? valueRetries(e.retryMetric, t) : null;
                const retryAbnormal = e.retryMetric ? formatDelta(e.retryMetric, t).abnormal : false;
                const paused = e.to === "partner-rail-b" && health["partner-rail-b"].planned;
                return (
                  <g key={e.id} opacity={emph === "dim" ? 0.25 : 1}>
                    <path
                      d={p.d}
                      fill="none"
                      stroke={emph === "hot" ? "#5FD4E4" : retryAbnormal ? "#F5A524" : "#5B6E97"}
                      strokeWidth={emph === "hot" ? 2 : 1.5}
                      strokeDasharray={paused ? "4 4" : undefined}
                      markerEnd={`url(#arrow-${emph})`}
                    />
                    {retries !== null && (
                      <g transform={`translate(${POS[e.to].x}, ${POS[e.to].y + H + 8})`}>
                        <rect width={W} height={24} rx={4} fill="#0E1729" stroke={retryAbnormal ? "#F5A524" : "#2A3A5E"} />
                        <text x={W / 2} y={16} textAnchor="middle" fontSize={12} fill={retryAbnormal ? "#F5A524" : "#A9B6D3"}>
                          ↻ Retries in: {retries}/min
                        </text>
                      </g>
                    )}
                    {paused && (
                      <text x={POS[e.to].x} y={POS[e.to].y + H + 20} fontSize={12} fill="#8492B4">
                        Route paused for maintenance
                      </text>
                    )}
                  </g>
                );
              })}

              {SERVICES.map((s) => {
                const pos = POS[s.id];
                const h = health[s.id];
                const emph = nodeEmphasis(s.id);
                const color = h.planned ? "#8492B4" : STATUS_META[h.status].hex;
                const inIncident = incidentSet.has(s.id);
                const isSel = emph === "selected";
                return (
                  <g
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSel}
                    aria-label={`${s.name}. ${h.label}. P95 ${formatMetric(s.metrics.p95, t)}, error rate ${formatMetric(s.metrics.errorRate, t)}.${inIncident ? " Part of the active incident." : ""}`}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    opacity={emph === "dim" ? 0.42 : 1}
                    className="cursor-pointer transition-opacity"
                    onClick={() => select(isSel ? null : s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        select(isSel ? null : s.id);
                      }
                    }}
                  >
                    <rect className="focus-ring" x={-5} y={-5} width={W + 10} height={H + 10} rx={10} fill="none" stroke="transparent" opacity={0} />
                    {inIncident && !isSel && <rect x={-3} y={-3} width={W + 6} height={H + 6} rx={9} fill="none" stroke="#EF4444" strokeOpacity={0.35} strokeDasharray="2 3" />}
                    <rect
                      width={W}
                      height={H}
                      rx={7}
                      fill={isSel ? "#17233D" : "#0E1729"}
                      stroke={isSel ? "#5FD4E4" : color}
                      strokeWidth={isSel ? 2 : h.status === "healthy" ? 1 : 1.75}
                      strokeDasharray={h.planned ? "5 4" : undefined}
                    />
                    <rect width={4} height={H} rx={2} fill={color} />
                    <text x={14} y={23} fontSize={14} fontWeight={600} fill="#E6ECF8">
                      {s.name}
                    </text>
                    <g transform="translate(14, 31)">
                      <circle cx={4} cy={7} r={4} fill={color} />
                      <text x={13} y={11} fontSize={12} fill={color}>
                        {h.label}
                      </text>
                    </g>
                    {h.planned ? (
                      <text x={14} y={76} fontSize={12} fill="#8492B4">
                        Maintenance until {hhmm(s.maintenance!.end)}
                      </text>
                    ) : (
                      <>
                        <text x={14} y={63} fontSize={11} fill="#8492B4">
                          P95
                        </text>
                        <text x={14} y={80} fontSize={13} fontFamily="var(--font-mono)" fill={formatDelta(s.metrics.p95, t).abnormal ? "#F5A524" : "#E6ECF8"}>
                          {formatMetric(s.metrics.p95, t)}
                        </text>
                        <text x={100} y={63} fontSize={11} fill="#8492B4">
                          Errors
                        </text>
                        <text x={100} y={80} fontSize={13} fontFamily="var(--font-mono)" fill={formatDelta(s.metrics.errorRate, t).abnormal ? "#F5A524" : "#E6ECF8"}>
                          {formatMetric(s.metrics.errorRate, t)}
                        </text>
                      </>
                    )}
                    {s.kind === "external" && !h.planned && (
                      <text x={W - 10} y={42} textAnchor="end" fontSize={10} letterSpacing={0.6} fill="#8492B4">
                        EXTERNAL
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-700/70 px-3 pt-2 text-2xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <Info className="h-3 w-3" aria-hidden />
              Arrows show request direction. A connection shows who calls whom, not what caused what.
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-4 rounded border border-dashed border-status-unavailable/60" /> Part of the active incident
            </span>
          </div>
        </Panel>

        {selected ? (
          <ServicePanel id={selected} onSelect={select} onPin={() => pin({ id: `svc-${selected}`, label: SERVICE_BY_ID[selected].name, detail: `${health[selected].label} at ${hhmm(t)} UTC`, view: "topology", ref: { serviceId: selected } })} />
        ) : (
          <PathSummary onSelect={select} go={go} />
        )}
      </div>
    </div>
  );
}

function valueRetries(key: string, t: number) {
  return formatMetric(key, t);
}

/* ------------------------------------------------------------------ */

function PathSummary({ onSelect, go }: { onSelect: (id: ServiceId) => void; go: ReturnType<typeof useInvestigation>["go"] }) {
  const { state } = useInvestigation();
  const t = state.clock;
  const endpoint = state.endpointId ? ENDPOINT_BY_ID[state.endpointId] : null;
  const services = (endpoint ? endpoint.path_services : SERVICES.map((s) => s.id)).map((id) => ({ id, h: serviceHealth(id, t) }));
  const flagged = services.filter((s) => s.h.status !== "healthy" && !s.h.planned);
  const selfDegraded = flagged.filter((s) => s.h.status === "degraded");

  return (
    <Panel title={endpoint ? `${endpoint.name} path` : "Services"} subtitle="Select a service in the graph or below for details.">
      {selfDegraded.length > 0 && (
        <div className="mb-3 rounded-md border border-status-degraded/40 bg-status-degraded/5 p-3 text-xs leading-relaxed text-text-secondary">
          <span className="font-medium text-text-primary">
            {selfDegraded.map((s) => SERVICE_BY_ID[s.id].name).join(", ")} {selfDegraded.length === 1 ? "is" : "are"} degraded on this path
          </span>{" "}
          by its own self time. Services marked <i>Elevated (downstream)</i> are slower only because they wait on it.
          <div className="mt-2">
            <Button size="xs" variant="primary" icon={ArrowRight} onClick={() => onSelect(selfDegraded[0].id)}>
              Inspect {SERVICE_BY_ID[selfDegraded[0].id].name}
            </Button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-ink-700/70">
        {services.map(({ id, h }) => (
          <li key={id}>
            <button type="button" onClick={() => onSelect(id)} className="flex w-full items-center gap-3 rounded px-1 py-2 text-left hover:bg-ink-800">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-text-primary">{SERVICE_BY_ID[id].name}</span>
                <span className="block font-mono text-2xs text-text-muted">
                  P95 {formatMetric(SERVICE_BY_ID[id].metrics.p95, t)} · err {formatMetric(SERVICE_BY_ID[id].metrics.errorRate, t)}
                </span>
              </span>
              <StatusBadge status={h.status} label={h.label} planned={h.planned} size="xs" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button size="xs" icon={Layers} onClick={() => go("incident")}>
          Open incident
        </Button>
        <Button size="xs" icon={Waypoints} onClick={() => go("traces")}>
          Browse traces
        </Button>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function ServicePanel({ id, onSelect, onPin }: { id: ServiceId; onSelect: (id: ServiceId | null) => void; onPin: () => void }) {
  const { state, go } = useInvestigation();
  const t = state.clock;
  const s = SERVICE_BY_ID[id];
  const h = serviceHealth(id, t);
  const inc = INCIDENT_BY_ID[state.incidentId];
  const up = upstreamOf(id);
  const down = downstreamOf(id);
  const selfKey = `${id}.self`;
  const retryKey = EDGES.find((e) => e.from === id && e.retryMetric)?.retryMetric;

  const events = TIMELINE_EVENTS.filter((e) => e.services.includes(id) && e.minute <= t).sort((a, b) => b.minute - a.minute);
  const traces = TRACES.filter((tr) => tr.spans.some((sp) => sp.service === id) && tr.startMinute <= t).sort(
    (a, b) => ({ failed: 0, slow: 1, healthy: 2 })[a.outcome] - ({ failed: 0, slow: 1, healthy: 2 })[b.outcome] || b.durationMs - a.durationMs,
  );
  const primary = traces.find((tr) => tr.id === inc.primaryTraceId) ?? traces[0];
  const spanFor = (traceId: string) => TRACES.find((x) => x.id === traceId)?.spans.find((sp) => sp.service === id)?.id ?? null;
  const inIncident = inc.affectedServices.includes(id);

  const rows: { k: string; label: string }[] = [
    { k: s.metrics.p95, label: "P95 latency" },
    { k: selfKey, label: "Self time P95" },
    { k: s.metrics.p99, label: "P99 latency" },
    { k: s.metrics.errorRate, label: "Error rate" },
    { k: s.metrics.rpm, label: "Requests / min" },
    ...(retryKey ? [{ k: retryKey, label: "Retries / min" }] : []),
  ];

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => onSelect(null)} aria-label="Back to all services" className="rounded p-0.5 text-text-muted hover:text-text-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          {s.name}
        </span>
      }
      subtitle={`${s.owner} · ${s.kind === "external" ? "External system" : "Internal service"}`}
      actions={
        <Button size="xs" variant="ghost" icon={Pin} onClick={onPin} aria-label={`Pin ${s.name} to the investigation`}>
          Pin
        </Button>
      }
      className="animate-fade-in"
      bodyClassName="space-y-4 p-4"
    >
      <div>
        <div className="flex items-center gap-2">
          <StatusBadge status={h.status} label={h.label} planned={h.planned} />
          {inIncident && state.incidentStatus !== "resolved" && <span className="rounded border border-status-unavailable/40 px-1.5 text-2xs text-red-300">In {inc.id}</span>}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-text-secondary">{s.description}</p>
      </div>

      <div className={clsx("rounded-md border p-3", h.status === "healthy" || h.planned ? "border-ink-700 bg-ink-900/50" : "border-status-degraded/40 bg-status-degraded/5")}>
        <SectionLabel>{h.status === "healthy" ? "Why it looks healthy" : "Why it is flagged"}</SectionLabel>
        <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-text-secondary">
          {h.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>

      {!h.planned && (
        <div>
          <SectionLabel>Telemetry now vs baseline</SectionLabel>
          <table className="w-full text-xs">
            <tbody>
              {rows.map((r) => {
                const d = formatDelta(r.k, t);
                return (
                  <tr key={r.k} className="border-b border-ink-700/50 last:border-0">
                    <th scope="row" className="py-1.5 text-left font-normal text-text-muted">
                      <span className="inline-flex items-center gap-1">
                        {r.label}
                        <InfoTip content={metric(r.k).definition} />
                      </span>
                    </th>
                    <td className="py-1.5 text-right font-mono text-text-primary">{formatMetric(r.k, t)}</td>
                    <td className="py-1.5 pl-3 text-right font-mono text-2xs text-text-muted">{formatValue(r.k, baselineAt(r.k, t))}</td>
                    <td className={clsx("w-16 py-1.5 text-right text-2xs", d.abnormal ? "text-status-elevated" : "text-text-muted")}>{d.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-2xs text-text-muted">
              <span>P95 (indigo) and self time (cyan), last 45 minutes</span>
            </div>
            <MetricChart keys={[s.metrics.p95, selfKey]} from={t - 45} to={t} step={1} height={110} ariaLabel={`${s.name} P95 and self time over 45 minutes`} markers={[{ t: inc.startMinute, label: "Incident start", tone: "incident" }]} window={state.window} compact />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <DepList title="Upstream (calls it)" ids={up} onSelect={onSelect} t={t} />
        <DepList title="Downstream (it calls)" ids={down} onSelect={onSelect} t={t} />
      </div>

      <div>
        <SectionLabel>Recent events</SectionLabel>
        {events.length === 0 ? (
          <EmptyState title="No events for this service">Nothing recorded in the incident timeline up to {hhmm(t)} UTC.</EmptyState>
        ) : (
          <ul className="space-y-1">
            {events.slice(0, 5).map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => go("incident", { eventId: e.id })} className="flex w-full gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-ink-800">
                  <span className="font-mono text-text-muted">{hhmm(e.minute)}</span>
                  <span className="text-text-secondary">{e.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <SectionLabel>Related traces</SectionLabel>
        {traces.length === 0 ? (
          <EmptyState title="No sampled traces include this service" />
        ) : (
          <ul className="space-y-1">
            {traces.slice(0, 4).map((tr) => (
              <li key={tr.id}>
                <button
                  type="button"
                  onClick={() => go("traces", { traceId: tr.id, spanId: spanFor(tr.id), serviceId: id })}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-ink-800"
                >
                  <span className={clsx("h-1.5 w-1.5 rounded-full", tr.outcome === "failed" ? "bg-status-unavailable" : tr.outcome === "slow" ? "bg-status-elevated" : "bg-status-healthy")} aria-hidden />
                  <span className="font-mono text-text-secondary">{tr.id}</span>
                  <span className="ml-auto font-mono text-text-muted">{tr.durationMs.toLocaleString("en-US")} ms</span>
                  <span className="sr-only">{tr.outcome}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-ink-700 pt-3">
        {primary && (
          <Button variant="primary" icon={Waypoints} onClick={() => go("traces", { traceId: primary.id, spanId: spanFor(primary.id), serviceId: id })}>
            Open related trace
          </Button>
        )}
        {inIncident && (
          <Button icon={Layers} onClick={() => go("incident", { eventId: events[events.length - 1]?.id ?? null })}>
            Open incident
          </Button>
        )}
      </div>
      <p className="text-2xs leading-relaxed text-text-muted">
        A degraded service on the request path is a place to look, not a confirmed cause. Check traces and the incident timeline before drawing conclusions.
      </p>
    </Panel>
  );
}

function DepList({ title, ids, onSelect, t }: { title: string; ids: ServiceId[]; onSelect: (id: ServiceId) => void; t: number }) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      {ids.length === 0 ? (
        <p className="text-2xs text-text-muted">None</p>
      ) : (
        <ul className="space-y-0.5">
          {ids.map((d) => {
            const h = serviceHealth(d, t);
            return (
              <li key={d}>
                <button type="button" onClick={() => onSelect(d)} className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-text-secondary hover:bg-ink-800 hover:text-text-primary">
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: h.planned ? "#8492B4" : STATUS_META[h.status].hex }} />
                  <span className="truncate">{SERVICE_BY_ID[d].name}</span>
                  <span className="sr-only">{h.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
