"use client";

import clsx from "clsx";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, Minus, MousePointer2, Siren } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { assessMetrics, serviceHealth, type HealthAssessment } from "@/data/health";
import { baselineAt, formatDelta, formatMetric, formatValue, hhmm, isOutsideBand, metric, rangeFor, valueAt } from "@/data/metrics";
import { ENDPOINTS, INCIDENT_BY_ID, SERVICES } from "@/data/mock";
import type { EndpointId, HealthStatus, ServiceId } from "@/data/types";
import { useInvestigation } from "@/lib/store";
import { MetricChart, SERIES_COLORS, Sparkline, type ChartMarker } from "../charts";
import { Button, InfoTip, Panel, Skeleton, StatusBadge } from "../ui";

const STATUS_ORDER: Record<HealthStatus, number> = { degraded: 0, unavailable: 1, elevated: 2, healthy: 3 };

export function HealthView() {
  const { state, go, patch, markJourney } = useInvestigation();
  const t = state.clock;
  const range = rangeFor(state.timeRange, t);
  const inc = INCIDENT_BY_ID[state.incidentId];
  const active = state.incidentStatus !== "resolved";

  useEffect(() => markJourney("detect"), [markJourney]);

  const markers: ChartMarker[] = [{ t: inc.startMinute, label: `Incident start ${hhmm(inc.startMinute)}`, tone: "incident" }];
  const onSelectWindow = (w: { from: number; to: number }) => patch({ window: w });

  const cpRatio = valueAt("create-payout.p95", t) / baselineAt("create-payout.p95", t);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <PageHeader
        title="Service Health"
        description="Which payment APIs and services are healthy, which are changing, and where to look next. Every value is compared with a baseline for the same hour over the previous 7 days."
      />

      {active && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-status-degraded/40 bg-gradient-to-r from-status-degraded/10 to-transparent px-4 py-3" role="status">
          <Siren className="h-4 w-4 shrink-0 text-status-degraded" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-medium text-text-primary">Create Payout P95 is {cpRatio.toFixed(1)}× its baseline</span>
            <span className="text-text-secondary">
              {" "}
              while request volume ({formatMetric("total.rpm", t)}/min) and gateway availability ({formatMetric("gateway.availability", t)}) stay inside their normal bands.
              The API layer looks healthy; the slowdown is somewhere behind it.
            </span>
          </div>
          <Button
            variant="primary"
            icon={ArrowRight}
            onClick={() => {
              markJourney("detect");
              go("topology", { endpointId: "create-payout", serviceId: null });
            }}
          >
            Trace Create Payout dependencies
          </Button>
        </div>
      )}

      <KpiRow />

      <div className="flex flex-wrap items-center gap-2 text-2xs text-text-muted">
        <MousePointer2 className="h-3 w-3" aria-hidden />
        Drag across any chart to set an investigation window. It follows you to the trace list and the incident timeline.
        <span className="ml-auto flex flex-wrap items-center gap-3">
          <LegendSwatch kind="band" /> Normal variation band
          <LegendSwatch kind="base" /> 7-day baseline
          <LegendSwatch kind="incident" /> Incident start
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartPanel title="Request volume" sub="All API requests per minute" keys={["total.rpm"]} range={range} markers={markers} onSelectWindow={onSelectWindow} />
        <ChartPanel
          title="Response latency (P95)"
          sub="Create Payout compared with all APIs"
          keys={["create-payout.p95", "total.p95"]}
          names={["Create Payout", "All APIs"]}
          range={range}
          markers={markers}
          onSelectWindow={onSelectWindow}
        />
        <ChartPanel
          title="Error rate"
          sub="5xx and timeouts, end to end"
          keys={["create-payout.errorRate", "total.errorRate"]}
          names={["Create Payout", "All APIs"]}
          range={range}
          markers={markers}
          onSelectWindow={onSelectWindow}
        />
        <ChartPanel
          title="Payout outcomes"
          sub="Payouts pending past the 5 minute processing window"
          keys={["payouts.pendingBeyondWindow"]}
          range={range}
          markers={markers}
          onSelectWindow={onSelectWindow}
          footer={
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-text-muted">
              <span>
                Failed in the last minute: <span className="font-mono text-text-secondary">{formatMetric("payouts.failed", t)}</span> (baseline about 1)
              </span>
              <span>
                Pending beyond window now: <span className="font-mono text-text-secondary">{formatMetric("payouts.pendingBeyondWindow", t)}</span>
              </span>
            </div>
          }
        />
      </div>

      <HealthTable />
      <StatusLegend />
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function PageHeader({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-3xl">
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h1>
        <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

function LegendSwatch({ kind }: { kind: "band" | "base" | "incident" }) {
  if (kind === "band") return <span aria-hidden className="inline-block h-2.5 w-4 rounded-sm bg-text-muted/20" />;
  if (kind === "base") return <span aria-hidden className="inline-block w-4 border-t border-dashed border-text-muted" />;
  return <span aria-hidden className="inline-block h-3 border-l border-dashed border-status-unavailable" />;
}

/* ------------------------------------------------------------------ */

function KpiRow() {
  const { state, go } = useInvestigation();
  const t = state.clock;
  const tiles: { key: string; label: string; suffix?: string; invert?: boolean }[] = [
    { key: "total.rpm", label: "API requests / min" },
    { key: "total.errorRate", label: "API error rate" },
    { key: "total.p95", label: "P95 latency" },
    { key: "total.p99", label: "P99 latency" },
    { key: "gateway.availability", label: "API availability", invert: true },
  ];
  const active = state.incidentStatus !== "resolved";

  if (state.loading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {tiles.map((k) => (
        <KpiTile key={k.key} metricKey={k.key} label={k.label} t={t} />
      ))}
      <div className={clsx("rounded-lg border p-3", active ? "border-status-unavailable/40 bg-status-unavailable/5" : "border-ink-700 bg-ink-850/80")}>
        <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-text-muted">
          Active incidents
          <InfoTip content="Open incidents in this environment." />
        </div>
        <div className="mt-1.5 font-mono text-2xl font-semibold text-text-primary">{active ? 1 : 0}</div>
        <div className="mt-1 text-2xs text-text-muted">{active ? "SEV-2 · Create Payout latency" : "None open"}</div>
        {active && (
          <button type="button" onClick={() => go("incident")} className="mt-0.5 inline-flex items-center gap-1 text-2xs text-red-300 hover:underline">
            Open incident <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>
      <KpiTile metricKey="payouts.pendingBeyondWindow" label="Payouts delayed" t={t} note="beyond 5 min window" />
    </div>
  );
}

function KpiTile({ metricKey, label, t, note }: { metricKey: string; label: string; t: number; note?: string }) {
  const d = metric(metricKey);
  const delta = formatDelta(metricKey, t);
  const abnormal = delta.abnormal;
  const DirIcon = delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : Minus;
  return (
    <div className={clsx("rounded-lg border p-3", abnormal ? "border-status-elevated/40 bg-status-elevated/[0.04]" : "border-ink-700 bg-ink-850/80")}>
      <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-text-muted">
        <span className="truncate">{label}</span>
        <InfoTip content={d.definition} label={`About ${label}`} />
      </div>
      <div className="mt-1.5 font-mono text-2xl font-semibold text-text-primary">{formatMetric(metricKey, t)}</div>
      <div className="mt-1 flex items-center gap-1.5 text-2xs">
        <span className={clsx("inline-flex items-center gap-0.5 font-medium", abnormal ? "text-status-elevated" : "text-text-muted")}>
          <DirIcon className="h-3 w-3" aria-hidden />
          {delta.text}
        </span>
        <span className="truncate text-text-muted">vs {formatValue(metricKey, baselineAt(metricKey, t))} baseline</span>
      </div>
      <div className={clsx("mt-0.5 text-2xs", abnormal ? "text-status-elevated" : "text-text-muted")}>{abnormal ? "Outside normal band" : note ?? "Within normal band"}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ChartPanel({
  title,
  sub,
  keys,
  names,
  range,
  markers,
  onSelectWindow,
  footer,
}: {
  title: string;
  sub: string;
  keys: string[];
  names?: string[];
  range: { from: number; to: number; step: number };
  markers: ChartMarker[];
  onSelectWindow: (w: { from: number; to: number }) => void;
  footer?: React.ReactNode;
}) {
  const { state } = useInvestigation();
  const t = state.clock;
  return (
    <Panel
      title={title}
      subtitle={sub}
      bodyClassName="px-2 pb-3 pt-2"
      actions={
        <div className="flex items-center gap-3">
          {keys.map((k, i) => (
            <span key={k} className="flex items-center gap-1.5 text-2xs text-text-secondary">
              {keys.length > 1 && <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: SERIES_COLORS[i] }} />}
              {names?.[i] && <span>{names[i]}</span>}
              <span className="font-mono text-text-primary">{formatMetric(k, t)}</span>
            </span>
          ))}
          <InfoTip content={metric(keys[0]).definition} />
        </div>
      }
    >
      {state.loading ? (
        <Skeleton className="mx-2 h-[160px]" />
      ) : (
        <MetricChart
          keys={keys}
          from={range.from}
          to={range.to}
          step={range.step}
          height={160}
          markers={markers}
          window={state.window}
          onSelectWindow={onSelectWindow}
          ariaLabel={`${title}: ${keys.map((k) => `${metric(k).label} ${formatMetric(k, t)}, baseline ${formatValue(k, baselineAt(k, t))}`).join("; ")}`}
          syncId="health"
        />
      )}
      {footer && <div className="px-2 pt-2">{footer}</div>}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

interface Row {
  kind: "endpoint" | "service";
  id: string;
  name: string;
  detail: string;
  health: HealthAssessment;
  keys: { rpm: string; errorRate: string; p95: string; p99: string };
  incidents: number;
}

function HealthTable() {
  const { state, go } = useInvestigation();
  const t = state.clock;
  const [onlyAttention, setOnlyAttention] = useState(false);
  const inc = INCIDENT_BY_ID[state.incidentId];
  const incidentOpen = state.incidentStatus !== "resolved";

  const rows = useMemo<Row[]>(() => {
    const ep: Row[] = ENDPOINTS.map((e) => ({
      kind: "endpoint",
      id: e.id,
      name: e.name,
      detail: `${e.method} ${e.path}`,
      health: assessMetrics(e.id, e.metrics, t),
      keys: e.metrics,
      incidents: incidentOpen && inc.affectedEndpoints.includes(e.id) ? 1 : 0,
    }));
    const sv: Row[] = SERVICES.map((s) => ({
      kind: "service",
      id: s.id,
      name: s.name,
      detail: s.kind === "external" ? `External · ${s.owner}` : s.owner,
      health: serviceHealth(s.id, t),
      keys: s.metrics,
      incidents: incidentOpen && inc.affectedServices.includes(s.id) ? 1 : 0,
    }));
    // Planned maintenance is expected, so it sorts after real problems.
    const rank = (r: Row) => (r.health.planned ? 2.5 : STATUS_ORDER[r.health.status]);
    const sort = (a: Row, b: Row) => rank(a) - rank(b);
    return [...ep.sort(sort), ...sv.sort(sort)];
  }, [t, inc, incidentOpen]);

  const visible = onlyAttention ? rows.filter((r) => r.health.status !== "healthy") : rows;

  const open = (r: Row) => {
    if (r.kind === "endpoint") go("topology", { endpointId: r.id as EndpointId, serviceId: null });
    else go("topology", { serviceId: r.id as ServiceId });
  };

  const isSelected = (r: Row) => (r.kind === "endpoint" ? state.endpointId === r.id : state.serviceId === r.id);

  return (
    <Panel
      title="APIs and services"
      subtitle="Select a row to see its dependencies in the topology. Sorted by status."
      bodyClassName="p-0"
      actions={
        <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
          <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} className="h-3.5 w-3.5 rounded border-ink-500 bg-ink-800 accent-[#5B7BF0]" />
          Only rows needing attention
        </label>
      }
    >
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-xs">
          <thead className="border-b border-ink-700 text-2xs uppercase tracking-wider text-text-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">
                API or service
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Status
              </th>
              <Th label="Req / min" tip="Requests per minute now, with change against baseline." />
              <Th label="Error rate" tip={metric("total.errorRate").definition} />
              <Th label="P95" tip="95th percentile latency, end to end through this API or service." />
              <Th label="P99" tip="99th percentile latency, end to end." />
              <th scope="col" className="px-3 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  Trend (P95, 30 min) <InfoTip content="Shaded area marks minutes outside the normal variation band." />
                </span>
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Incidents
              </th>
              <th scope="col" className="w-8 px-3 py-2">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const showGroup = i === 0 || visible[i - 1].kind !== r.kind;
              const trend = Array.from({ length: 31 }, (_, j) => valueAt(r.keys.p95, t - 30 + j));
              const abnormalFrom = trend.findIndex((_, j) => isOutsideBand(r.keys.p95, t - 30 + j));
              return (
                <RowGroup key={r.id} showGroup={showGroup} kind={r.kind}>
                  <tr
                    tabIndex={0}
                    aria-selected={isSelected(r)}
                    onClick={() => open(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open(r);
                      }
                    }}
                    className={clsx(
                      "group cursor-pointer border-b border-ink-700/60 transition-colors hover:bg-ink-800/80 focus-visible:bg-ink-800",
                      isSelected(r) && "bg-accent/[0.07]",
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-text-primary">{r.name}</div>
                      <div className="font-mono text-2xs text-text-muted">{r.detail}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">
                        <StatusBadge status={r.health.status} label={r.health.label} planned={r.health.planned} size="xs" />
                        <InfoTip content={<ul className="list-disc space-y-1 pl-4">{r.health.reasons.map((x) => <li key={x}>{x}</li>)}</ul>} label={`Why ${r.name} is ${r.health.label}`} />
                      </span>
                    </td>
                    <MetricCell k={r.keys.rpm} t={t} planned={r.health.planned} />
                    <MetricCell k={r.keys.errorRate} t={t} planned={r.health.planned} />
                    <MetricCell k={r.keys.p95} t={t} planned={r.health.planned} />
                    <MetricCell k={r.keys.p99} t={t} planned={r.health.planned} />
                    <td className="px-3 py-2.5">
                      {r.health.planned ? (
                        <span className="text-2xs text-text-muted">Paused</span>
                      ) : (
                        <Sparkline values={trend} baseline={baselineAt(r.keys.p95, t)} abnormalFrom={abnormalFrom >= 0 ? abnormalFrom : undefined} label={`${r.name} P95 trend over 30 minutes`} color={abnormalFrom >= 0 ? "#F5A524" : "#5B7BF0"} />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {r.incidents > 0 ? <span className="rounded bg-status-unavailable/15 px-1.5 py-0.5 text-red-300">{r.incidents}</span> : <span className="text-text-muted">0</span>}
                    </td>
                    <td className="px-3 py-2.5 text-text-muted group-hover:text-text-primary">
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </td>
                  </tr>
                </RowGroup>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function RowGroup({ showGroup, kind, children }: { showGroup: boolean; kind: Row["kind"]; children: React.ReactNode }) {
  return (
    <>
      {showGroup && (
        <tr className="bg-ink-900/60">
          <th scope="rowgroup" colSpan={9} className="px-4 py-1.5 text-2xs font-semibold uppercase tracking-wider text-text-muted">
            {kind === "endpoint" ? "API endpoints" : "Services and dependencies"}
          </th>
        </tr>
      )}
      {children}
    </>
  );
}

function Th({ label, tip }: { label: string; tip: string }) {
  return (
    <th scope="col" className="px-3 py-2 font-medium">
      <span className="inline-flex items-center gap-1">
        {label}
        <InfoTip content={tip} label={`About ${label}`} />
      </span>
    </th>
  );
}

function MetricCell({ k, t, planned }: { k: string; t: number; planned?: boolean }) {
  if (planned) return <td className="px-3 py-2.5 font-mono text-text-muted">—</td>;
  const d = formatDelta(k, t);
  return (
    <td className="px-3 py-2.5">
      <div className="font-mono text-text-primary">{formatMetric(k, t)}</div>
      <div className={clsx("text-2xs", d.abnormal ? "text-status-elevated" : "text-text-muted")}>
        {d.text} <span className="text-text-muted">vs base</span>
      </div>
    </td>
  );
}

function StatusLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850/60">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-text-secondary hover:text-text-primary">
        <ChevronDown className={clsx("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        How status is determined
        <span className="ml-auto hidden flex-wrap gap-2 sm:flex">
          <StatusBadge status="healthy" size="xs" />
          <StatusBadge status="elevated" size="xs" />
          <StatusBadge status="degraded" size="xs" />
          <StatusBadge status="unavailable" size="xs" />
        </span>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-ink-700 px-4 py-3 text-xs text-text-secondary md:grid-cols-2">
          <ul className="space-y-1.5">
            <li>
              <b className="text-status-healthy">Healthy</b>: latency and error rate inside their normal variation bands.
            </li>
            <li>
              <b className="text-status-elevated">Elevated</b>: end-to-end P95 above 1.5× baseline, or error rate above 2×, for 5+ minutes. <i>Elevated (downstream)</i> means the
              service&apos;s own self time is normal and it is waiting on a dependency.
            </li>
            <li>
              <b className="text-status-degraded">Degraded</b>: self time P95 above 3× baseline, or error rate above 3× that originates in this service, for 5+ minutes.
            </li>
            <li>
              <b className="text-status-unavailable">Unavailable</b>: no successful requests. <i>Planned</i> marks a declared maintenance window and is not treated as a fault.
            </li>
          </ul>
          <p className="text-text-muted">
            There is no composite health score. Status is a rule applied to visible metrics, and every badge lists the exact reason. Baselines use the same hour of day across
            the previous 7 days (simulated). The normal band is the range where values usually sit.
          </p>
        </div>
      )}
    </div>
  );
}
