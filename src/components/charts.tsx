"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatValue, hhmm, metric, series, type SeriesRow } from "@/data/metrics";

/** Validated categorical slots for the dark surface (see README: chart colors). */
export const SERIES_COLORS = ["#5B7BF0", "#1AA3B8"];
const GRID = "#1E2B48";
const AXIS = "#8492B4";
const BAND = "#8492B4";

export interface ChartMarker {
  t: number;
  label: string;
  tone?: "incident" | "event" | "selected";
}

interface MetricChartProps {
  keys: string[];
  from: number;
  to: number;
  step: number;
  height?: number;
  markers?: ChartMarker[];
  window?: { from: number; to: number } | null;
  showBand?: boolean;
  onSelectWindow?: (w: { from: number; to: number }) => void;
  ariaLabel: string;
  syncId?: string;
  compact?: boolean;
  /** Fixed y-axis width so external lanes can align with the plot area. */
  yAxisWidth?: number;
  /** Secondary highlight (eg. a selected timeline event). */
  highlight?: { from: number; to: number } | null;
  hideXAxis?: boolean;
}

function ChartTooltip({ active, payload, keys }: { active?: boolean; payload?: { payload: SeriesRow }[]; keys: string[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-ink-600 bg-ink-950/95 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-mono text-text-muted">{hhmm(row.t)} UTC</div>
      {keys.map((k, i) => {
        const v = row[k] as number;
        const b = row[`${k}__base`] as number;
        const band = row[`${k}__band`] as [number, number];
        const out = v < band[0] || v > band[1];
        return (
          <div key={k} className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: SERIES_COLORS[i] }} aria-hidden />
              <span className="text-text-secondary">{metric(k).label}</span>
              <span className="ml-auto pl-3 font-mono font-semibold text-text-primary">{formatValue(k, v)}</span>
            </div>
            <div className="flex justify-between gap-4 pl-5 text-text-muted">
              <span>Baseline {formatValue(k, b)}</span>
              <span className={out ? "text-status-elevated" : ""}>{out ? "Outside normal band" : "Within normal band"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MetricChart({ keys, from, to, step, height = 150, markers = [], window: win, showBand = true, onSelectWindow, ariaLabel, syncId, compact, yAxisWidth, highlight, hideXAxis }: MetricChartProps) {
  const data = useMemo(() => series(keys, from, to, step), [keys, from, to, step]);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const unit = metric(keys[0]).unit;

  const tickFmt = (v: number) => hhmm(v);
  const yFmt = (v: number) => {
    if (unit === "ms") return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}`;
    if (unit === "%") return `${v.toFixed(v < 1 ? 1 : 0)}%`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return `${Math.round(v)}`;
  };

  const tFromEvent = (e: unknown): number | null => {
    const ev = e as { activeTooltipIndex?: number | string | null; activeLabel?: number | string };
    const idx = ev?.activeTooltipIndex;
    if (idx !== undefined && idx !== null && data[Number(idx)]) return data[Number(idx)].t;
    if (ev?.activeLabel !== undefined) return Number(ev.activeLabel);
    return null;
  };

  return (
    <div role="img" aria-label={ariaLabel} className="select-none">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={data}
          syncId={syncId}
          margin={yAxisWidth ? { top: 4, right: 8, bottom: 0, left: 0 } : { top: 6, right: 8, bottom: 0, left: compact ? -12 : -4 }}
          onMouseDown={(e) => {
            if (!onSelectWindow) return;
            const t = tFromEvent(e);
            if (t !== null) setDrag({ a: t, b: t });
          }}
          onMouseMove={(e) => {
            if (!drag) return;
            const t = tFromEvent(e);
            if (t !== null) setDrag((d) => (d ? { ...d, b: t } : d));
          }}
          onMouseUp={() => {
            if (drag && onSelectWindow && Math.abs(drag.b - drag.a) >= step) {
              onSelectWindow({ from: Math.min(drag.a, drag.b), to: Math.max(drag.a, drag.b) });
            }
            setDrag(null);
          }}
          onMouseLeave={() => setDrag(null)}
          style={{ cursor: onSelectWindow ? "crosshair" : undefined }}
        >
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={[from, to]}
            tickFormatter={tickFmt}
            stroke={AXIS}
            tick={{ fontSize: 10, fill: AXIS }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            minTickGap={36}
            allowDataOverflow
            hide={hideXAxis}
            padding={{ left: 0, right: 0 }}
          />
          <YAxis stroke={AXIS} tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} tickFormatter={yFmt} width={yAxisWidth ?? 44} tickCount={yAxisWidth ? 3 : undefined} />
          {win && <ReferenceArea x1={Math.max(from, win.from)} x2={Math.min(to, win.to)} fill="#1AA3B8" fillOpacity={0.1} stroke="#1AA3B8" strokeOpacity={0.5} strokeDasharray="3 3" ifOverflow="hidden" />}
          {highlight && <ReferenceArea x1={Math.max(from, highlight.from)} x2={Math.min(to, highlight.to)} fill="#5FD4E4" fillOpacity={0.12} ifOverflow="hidden" />}
          {drag && drag.a !== drag.b && <ReferenceArea x1={Math.min(drag.a, drag.b)} x2={Math.max(drag.a, drag.b)} fill="#5B7BF0" fillOpacity={0.15} />}
          {showBand &&
            keys.map((k) => (
              <Area key={`${k}-band`} dataKey={`${k}__band`} stroke="none" fill={BAND} fillOpacity={0.12} isAnimationActive={false} activeDot={false} legendType="none" />
            ))}
          {keys.map((k) => (
            <Line key={`${k}-base`} dataKey={`${k}__base`} stroke={BAND} strokeOpacity={0.6} strokeDasharray="4 4" strokeWidth={1} dot={false} activeDot={false} isAnimationActive={false} />
          ))}
          {markers.map((m) => (
            <ReferenceLine
              key={`${m.t}-${m.label}`}
              x={m.t}
              stroke={m.tone === "incident" ? "#EF4444" : m.tone === "selected" ? "#5FD4E4" : "#3B4D75"}
              strokeDasharray={m.tone === "selected" ? undefined : "3 3"}
              strokeWidth={m.tone === "selected" ? 1.5 : 1}
              ifOverflow="hidden"
              label={m.tone === "incident" && !compact ? { value: m.label, position: "insideTopLeft", fill: "#FCA5A5", fontSize: 10 } : undefined}
            />
          ))}
          {keys.map((k, i) => (
            <Line key={k} dataKey={k} stroke={SERIES_COLORS[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#0E1729" }} isAnimationActive={false} />
          ))}
          <RTooltip content={<ChartTooltip keys={keys} />} cursor={{ stroke: "#3B4D75", strokeWidth: 1 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tiny trend line for table rows. Pure SVG; the table carries the numbers. */
export function Sparkline({ values, baseline, abnormalFrom, width = 88, height = 24, color = "#5B7BF0", label }: { values: number[]; baseline?: number; abnormalFrom?: number; width?: number; height?: number; color?: string; label: string }) {
  if (values.length < 2) return null;
  // Scale from zero against at least 2× baseline so normal noise reads as flat
  // and only real departures from baseline show as movement.
  const min = baseline !== undefined ? 0 : Math.min(...values);
  const max = baseline !== undefined ? Math.max(...values, baseline * 2) : Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 2) + 1, height - 2 - ((v - min) / span) * (height - 4)] as const);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} role="img" aria-label={label} className="overflow-visible">
      {abnormalFrom !== undefined && abnormalFrom < values.length && (
        <rect x={pts[abnormalFrom][0]} y={0} width={width - pts[abnormalFrom][0]} height={height} fill="#F5A524" opacity={0.08} />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2} fill={color} />
    </svg>
  );
}
