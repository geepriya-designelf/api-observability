import type { IncidentShape, MetricDef, SimMinute } from "./types";

/* ------------------------------------------------------------------ */
/* Simulated clock                                                      */
/* ------------------------------------------------------------------ */

export const DEMO_DATE = "2026-10-14";
/** The demo opens at 14:24 UTC, seventeen minutes into the incident. */
export const DEFAULT_CLOCK: SimMinute = 14 * 60 + 24;
/** Live simulation advances one simulated minute per tick until 14:45. */
export const MAX_CLOCK: SimMinute = 14 * 60 + 45;
export const LIVE_TICK_MS = 4000;

export function hhmm(minute: number): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function hhmmss(minute: number, second = 0): string {
  return `${hhmm(minute)}:${String(Math.floor(second)).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Deterministic noise                                                  */
/* ------------------------------------------------------------------ */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic value in [-1, 1] for a metric at a minute. */
function noiseAt(key: string, minute: number): number {
  let x = (hashString(key) ^ Math.imul(Math.round(minute * 4) + 7919, 2654435761)) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (((x >>> 0) % 20001) / 10000) - 1;
}

/* ------------------------------------------------------------------ */
/* Metric registry                                                      */
/* ------------------------------------------------------------------ */

type Def = Omit<MetricDef, "incident"> & { incident?: IncidentShape | IncidentShape[] };

const latency = (key: string, label: string, baseline: number, definition: string, incident?: IncidentShape | IncidentShape[]): Def => ({
  key,
  label,
  unit: "ms",
  baseline,
  diurnal: 0.03,
  noise: 0.04,
  band: 0.18,
  incident,
  decimals: 0,
  min: 1,
  definition,
});

const rpm = (key: string, label: string, baseline: number, incident?: IncidentShape | IncidentShape[]): Def => ({
  key,
  label,
  unit: "rpm",
  baseline,
  diurnal: 0.04,
  noise: 0.015,
  band: 0.06,
  incident,
  decimals: 0,
  min: 0,
  definition: "Requests received per minute.",
});

const errRate = (key: string, label: string, baseline: number, incident?: IncidentShape | IncidentShape[]): Def => ({
  key,
  label,
  unit: "%",
  baseline,
  diurnal: 0,
  noise: 0.08,
  band: 0.5,
  incident,
  decimals: 2,
  min: 0,
  definition: "Share of requests that ended in a 5xx response or a timeout.",
});

const P95_DEF = "95% of requests completed faster than this. Sensitive to a slow minority of requests.";
const P99_DEF = "99% of requests completed faster than this. Shows the slowest tail.";
const SELF_DEF =
  "P95 of time spent inside this service itself, excluding time waiting on downstream calls. Separates a slow service from a service that is waiting on a slow dependency.";

const DEFS: Def[] = [
  /* Ecosystem summary */
  {
    ...rpm("total.rpm", "API requests / min", 4810, { onset: 846, ramp: 8, delta: 60 }),
    definition: "All API requests received at the gateway per minute, across every endpoint.",
  },
  {
    ...errRate("total.errorRate", "API error rate", 0.31, { onset: 848, ramp: 8, delta: 0.31, growth: 0.004 }),
    definition: "End-to-end share of API requests that returned a 5xx or timed out. Includes failures that happen downstream of the gateway.",
  },
  latency("total.p95", "P95 response latency", 290, "P95 across all API endpoints. " + P95_DEF, { onset: 845, ramp: 4, delta: 350, growth: 1 }),
  latency("total.p99", "P99 response latency", 610, "P99 across all API endpoints. " + P99_DEF, { onset: 845, ramp: 4, delta: 2370, growth: 4 }),
  {
    key: "gateway.availability",
    label: "API availability",
    unit: "%",
    baseline: 99.98,
    diurnal: 0,
    noise: 0.00005,
    band: 0.0002,
    max: 100,
    decimals: 2,
    definition:
      "Share of requests the API Gateway accepted and routed without a gateway-originated failure. It can stay high while downstream services are slow, which is why it is shown next to error rate and latency.",
  },
  {
    key: "payouts.pendingBeyondWindow",
    label: "Payouts delayed beyond window",
    unit: "count",
    baseline: 1,
    diurnal: 0,
    noise: 0,
    band: 1,
    incident: { onset: 852, ramp: 12, delta: 40, growth: 1.2 },
    min: 0,
    decimals: 0,
    definition:
      "Payouts still pending 5 minutes after creation. 5 minutes is the expected processing window for real-time rails in this simulation.",
  },
  {
    key: "payouts.failed",
    label: "Payouts failed / min",
    unit: "per-min",
    baseline: 0.6,
    diurnal: 0,
    noise: 0.6,
    band: 1,
    incident: { onset: 853, ramp: 6, delta: 3.4 },
    min: 0,
    decimals: 0,
    definition: "Payouts that reached a terminal failed state, per minute.",
  },

  /* API Gateway */
  rpm("api-gateway.rpm", "Requests / min", 4810, { onset: 846, ramp: 8, delta: 60 }),
  errRate("api-gateway.errorRate", "Error rate", 0.02),
  latency("api-gateway.p95", "P95 latency", 36, "Gateway processing time only. " + P95_DEF),
  latency("api-gateway.p99", "P99 latency", 61, "Gateway processing time only. " + P99_DEF),
  latency("api-gateway.self", "Self time P95", 36, SELF_DEF),

  /* Payout Service */
  rpm("payout-service.rpm", "Requests / min", 1165, { onset: 846, ramp: 8, delta: 15 }),
  errRate("payout-service.errorRate", "Error rate", 0.35, { onset: 852, ramp: 6, delta: 0.6 }),
  latency("payout-service.p95", "P95 latency", 380, P95_DEF, { onset: 845, ramp: 4, delta: 1410, growth: 3 }),
  latency("payout-service.p99", "P99 latency", 640, P99_DEF, { onset: 845, ramp: 4, delta: 2700, growth: 6 }),
  latency("payout-service.self", "Self time P95", 42, SELF_DEF),

  /* Compliance */
  rpm("compliance-service.rpm", "Requests / min", 1160, { onset: 846, ramp: 8, delta: 15 }),
  errRate("compliance-service.errorRate", "Error rate", 0.05),
  latency("compliance-service.p95", "P95 latency", 88, P95_DEF),
  latency("compliance-service.p99", "P99 latency", 140, P99_DEF),
  latency("compliance-service.self", "Self time P95", 84, SELF_DEF),

  /* FX */
  rpm("fx-service.rpm", "Requests / min", 1805),
  errRate("fx-service.errorRate", "Error rate", 0.02),
  latency("fx-service.p95", "P95 latency", 46, P95_DEF),
  latency("fx-service.p99", "P99 latency", 75, P99_DEF),
  latency("fx-service.self", "Self time P95", 44, SELF_DEF),

  /* Wallet */
  rpm("wallet-service.rpm", "Requests / min", 2690),
  errRate("wallet-service.errorRate", "Error rate", 0.03),
  latency("wallet-service.p95", "P95 latency", 33, P95_DEF),
  latency("wallet-service.p99", "P99 latency", 52, P99_DEF),
  latency("wallet-service.self", "Self time P95", 31, SELF_DEF),

  /* Payment Orchestration */
  rpm("payment-orchestration.rpm", "Requests / min", 1150, { onset: 846, ramp: 8, delta: 15 }),
  errRate("payment-orchestration.errorRate", "Error rate", 0.2, { onset: 850, ramp: 6, delta: 1.2 }),
  latency("payment-orchestration.p95", "P95 latency", 210, P95_DEF, { onset: 843, ramp: 6, delta: 1300, growth: 3 }),
  latency("payment-orchestration.p99", "P99 latency", 380, P99_DEF, { onset: 843, ramp: 6, delta: 2700, growth: 6 }),
  latency("payment-orchestration.self", "Self time P95", 30, SELF_DEF, { onset: 843, ramp: 6, delta: 1350, growth: 3 }),
  {
    key: "payment-orchestration.retries",
    label: "Retries to Rail A / min",
    unit: "per-min",
    baseline: 18,
    diurnal: 0,
    noise: 0.12,
    band: 0.5,
    incident: { onset: 845, ramp: 14, delta: 122 },
    min: 0,
    decimals: 0,
    definition: "Outbound requests from Payment Orchestration to Partner Rail A that were retries of an earlier attempt.",
  },

  /* External Partner Rail A */
  rpm("partner-rail-a.rpm", "Requests / min", 720, [
    { onset: 840, ramp: 2, delta: 410 },
    { onset: 845, ramp: 14, delta: 122 },
  ]),
  errRate("partner-rail-a.errorRate", "Error rate", 0.5, { onset: 846, ramp: 6, delta: 0.12 }),
  latency("partner-rail-a.p95", "P95 latency", 365, "Measured from our side of the connection. " + P95_DEF, { onset: 844, ramp: 8, delta: 45 }),
  latency("partner-rail-a.p99", "P99 latency", 620, "Measured from our side of the connection. " + P99_DEF, { onset: 844, ramp: 8, delta: 80 }),
  latency("partner-rail-a.self", "Self time P95", 365, "External system: we can only observe round-trip time from our side."),

  /* External Partner Rail B (planned maintenance from 14:00) */
  rpm("partner-rail-b.rpm", "Requests / min", 410, { onset: 840, ramp: 1, delta: -410 }),
  errRate("partner-rail-b.errorRate", "Error rate", 0.4),
  latency("partner-rail-b.p95", "P95 latency", 340, P95_DEF),
  latency("partner-rail-b.p99", "P99 latency", 590, P99_DEF),
  latency("partner-rail-b.self", "Self time P95", 340, "External system."),

  /* API endpoints */
  rpm("create-payout.rpm", "Requests / min", 1165, { onset: 846, ramp: 8, delta: 15 }),
  errRate("create-payout.errorRate", "Error rate", 0.35, { onset: 852, ramp: 6, delta: 0.75 }),
  latency("create-payout.p95", "P95 latency", 420, P95_DEF, { onset: 845, ramp: 4, delta: 1440, growth: 3 }),
  latency("create-payout.p99", "P99 latency", 690, P99_DEF, { onset: 845, ramp: 4, delta: 2730, growth: 6 }),

  rpm("get-payout-status.rpm", "Requests / min", 1480, { onset: 846, ramp: 8, delta: 45 }),
  errRate("get-payout-status.errorRate", "Error rate", 0.1),
  latency("get-payout-status.p95", "P95 latency", 62, P95_DEF),
  latency("get-payout-status.p99", "P99 latency", 110, P99_DEF),

  rpm("create-fx-quote.rpm", "Requests / min", 640),
  errRate("create-fx-quote.errorRate", "Error rate", 0.05),
  latency("create-fx-quote.p95", "P95 latency", 58, P95_DEF),
  latency("create-fx-quote.p99", "P99 latency", 92, P99_DEF),

  rpm("get-wallet-balance.rpm", "Requests / min", 1525),
  errRate("get-wallet-balance.errorRate", "Error rate", 0.03),
  latency("get-wallet-balance.p95", "P95 latency", 41, P95_DEF),
  latency("get-wallet-balance.p99", "P99 latency", 66, P99_DEF),
];

export const METRICS: Record<string, Def> = Object.fromEntries(DEFS.map((d) => [d.key, d]));

export function metric(key: string): Def {
  const d = METRICS[key];
  if (!d) throw new Error(`Unknown metric: ${key}`);
  return d;
}

/* ------------------------------------------------------------------ */
/* Sampling                                                             */
/* ------------------------------------------------------------------ */

function shapeAt(s: IncidentShape, t: number): number {
  if (t < s.onset) return 0;
  if (s.until !== undefined && t >= s.until) return 0;
  const progress = Math.min(1, (t - s.onset) / Math.max(1, s.ramp));
  const extra = t > s.onset + s.ramp ? (s.growth ?? 0) * (t - s.onset - s.ramp) : 0;
  return progress * s.delta + extra;
}

function diurnalAt(t: number): number {
  // Zero at the default clock, gently varying across the day.
  return Math.sin((2 * Math.PI * (t - DEFAULT_CLOCK)) / 1440);
}

/** Expected value at minute t (no incident, no noise). */
export function baselineAt(key: string, t: number): number {
  const d = metric(key);
  return d.baseline * (1 + d.diurnal * diurnalAt(t));
}

export function bandAt(key: string, t: number): [number, number] {
  const d = metric(key);
  const b = baselineAt(key, t);
  const half = d.unit === "count" ? d.band : b * d.band;
  return [Math.max(d.min ?? -Infinity, b - half), Math.min(d.max ?? Infinity, b + half)];
}

export function valueAt(key: string, t: number): number {
  const d = metric(key);
  const base = baselineAt(key, t);
  const n = d.noise ? noiseAt(key, t) * d.noise : 0;
  let v = base * (1 + n);
  const shapes = d.incident ? (Array.isArray(d.incident) ? d.incident : [d.incident]) : [];
  for (const s of shapes) v += shapeAt(s, t);
  if (d.min !== undefined) v = Math.max(d.min, v);
  if (d.max !== undefined) v = Math.min(d.max, v);
  const p = Math.pow(10, d.decimals);
  return Math.round(v * p) / p;
}

/** Ratio of the current value to its expected baseline. */
export function ratioToBaseline(key: string, t: number): number {
  const b = baselineAt(key, t);
  if (b === 0) return 1;
  return valueAt(key, t) / b;
}

export function isOutsideBand(key: string, t: number): boolean {
  const [lo, hi] = bandAt(key, t);
  const v = valueAt(key, t);
  return v < lo || v > hi;
}

export interface SeriesRow {
  t: number;
  [key: string]: number | [number, number];
}

export type TimeRangeId = "15m" | "1h" | "24h";

export const TIME_RANGES: { id: TimeRangeId; label: string; minutes: number; step: number }[] = [
  { id: "15m", label: "Last 15 minutes", minutes: 15, step: 1 },
  { id: "1h", label: "Last hour", minutes: 60, step: 1 },
  { id: "24h", label: "Last 24 hours", minutes: 1440, step: 15 },
];

export function rangeFor(id: TimeRangeId, clock: number) {
  const r = TIME_RANGES.find((x) => x.id === id)!;
  return { from: clock - r.minutes, to: clock, step: r.step, label: r.label };
}

/**
 * Sample several metrics on a shared time axis. Each row carries the value,
 * the baseline (`<key>__base`) and the normal-variation band (`<key>__band`).
 */
export function series(keys: string[], from: number, to: number, step: number): SeriesRow[] {
  const rows: SeriesRow[] = [];
  const start = Math.ceil(from / step) * step;
  for (let t = start; t <= to; t += step) {
    const row: SeriesRow = { t };
    for (const k of keys) {
      row[k] = valueAt(k, t);
      row[`${k}__base`] = Math.round(baselineAt(k, t) * 100) / 100;
      row[`${k}__band`] = bandAt(k, t);
    }
    rows.push(row);
  }
  if (rows.length === 0 || rows[rows.length - 1].t !== to) {
    const row: SeriesRow = { t: to };
    for (const k of keys) {
      row[k] = valueAt(k, to);
      row[`${k}__base`] = Math.round(baselineAt(k, to) * 100) / 100;
      row[`${k}__band`] = bandAt(k, to);
    }
    rows.push(row);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                           */
/* ------------------------------------------------------------------ */

export function formatValue(key: string, v: number): string {
  const d = metric(key);
  switch (d.unit) {
    case "ms":
      return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`;
    case "%":
      return `${v.toFixed(d.decimals)}%`;
    case "rpm":
      return `${Math.round(v).toLocaleString("en-US")}`;
    case "per-min":
    case "count":
      return `${Math.round(v).toLocaleString("en-US")}`;
  }
}

export function formatMetric(key: string, t: number): string {
  return formatValue(key, valueAt(key, t));
}

export function formatBaseline(key: string, t: number): string {
  return formatValue(key, baselineAt(key, t));
}

export function formatDelta(key: string, t: number): { text: string; direction: "up" | "down" | "flat"; abnormal: boolean } {
  const d = metric(key);
  const v = valueAt(key, t);
  const b = baselineAt(key, t);
  const abnormal = isOutsideBand(key, t);
  if (d.unit === "%" && d.key.includes("availability")) {
    const diff = v - b;
    return { text: Math.abs(diff) < 0.005 ? "No change" : `${diff >= 0 ? "+" : ""}${diff.toFixed(2)} pts`, direction: diff > 0.005 ? "up" : diff < -0.005 ? "down" : "flat", abnormal };
  }
  if (d.unit === "count") {
    const diff = v - b;
    return { text: `${diff >= 0 ? "+" : ""}${Math.round(diff)}`, direction: diff > 0 ? "up" : diff < 0 ? "down" : "flat", abnormal };
  }
  const ratio = b === 0 ? 1 : v / b;
  if (ratio >= 2) return { text: `${ratio.toFixed(1)}×`, direction: "up", abnormal };
  const pct = (ratio - 1) * 100;
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, direction: pct > 1 ? "up" : pct < -1 ? "down" : "flat", abnormal };
}
