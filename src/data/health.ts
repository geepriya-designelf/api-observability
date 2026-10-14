import { baselineAt, formatBaseline, formatMetric, metric, valueAt } from "./metrics";
import { SERVICE_BY_ID } from "./mock";
import type { HealthStatus, ServiceId, ServiceMetricKeys } from "./types";

export interface HealthAssessment {
  status: HealthStatus;
  /** Short label, eg. "Degraded" or "Elevated (downstream)". */
  label: string;
  /** Plain-language reasons the status was assigned. */
  reasons: string[];
  planned?: boolean;
}

const SUSTAIN = [0, 2, 5];

/** Minimum ratio-to-baseline across the last 5 minutes (sustained deviation). */
function sustainedRatio(key: string, t: number): number {
  return Math.min(...SUSTAIN.map((d) => valueAt(key, t - d) / Math.max(0.0001, baselineAt(key, t - d))));
}

export function assessMetrics(prefix: string, m: ServiceMetricKeys, t: number, opts?: { maintenance?: { start: number; end: number; note: string } }): HealthAssessment {
  if (opts?.maintenance && t >= opts.maintenance.start && t < opts.maintenance.end) {
    return {
      status: "unavailable",
      label: "Unavailable (planned)",
      planned: true,
      reasons: [opts.maintenance.note, "Expected state. Not counted as a fault."],
    };
  }
  if (valueAt(m.rpm, t) === 0 && metric(m.rpm).baseline > 0) {
    return { status: "unavailable", label: "Unavailable", reasons: ["No requests served in the last minute."] };
  }

  const selfKey = `${prefix}.self`;
  const hasSelf = !!safeMetric(selfKey);
  const selfR = hasSelf ? sustainedRatio(selfKey, t) : sustainedRatio(m.p95, t);
  const p95R = sustainedRatio(m.p95, t);
  const errR = sustainedRatio(m.errorRate, t);
  const reasons: string[] = [];

  // A service whose own self time is normal is not blamed for errors or
  // latency it is passing through from a downstream dependency.
  const passThrough = hasSelf && selfR < 1.5;
  if (selfR >= 3 || (errR >= 3 && !passThrough)) {
    if (selfR >= 3)
      reasons.push(
        `Self time P95 is ${formatMetric(hasSelf ? selfKey : m.p95, t)} against a baseline of ${formatBaseline(hasSelf ? selfKey : m.p95, t)} (${selfR.toFixed(1)}×, sustained 5+ min).`,
      );
    if (errR >= 3) reasons.push(`Error rate is ${formatMetric(m.errorRate, t)} against a baseline of ${formatBaseline(m.errorRate, t)} (${errR.toFixed(1)}×).`);
    return { status: "degraded", label: "Degraded", reasons };
  }
  if (p95R >= 1.5 || errR >= 2 || (errR >= 3 && passThrough)) {
    if (p95R >= 1.5) reasons.push(`End-to-end P95 is ${formatMetric(m.p95, t)} against a baseline of ${formatBaseline(m.p95, t)} (${p95R.toFixed(1)}×).`);
    if (errR >= 2) reasons.push(`Error rate is ${formatMetric(m.errorRate, t)} against a baseline of ${formatBaseline(m.errorRate, t)}.`);
    const inherited = passThrough;
    if (inherited) reasons.push(`Self time P95 is normal (${formatMetric(selfKey, t)}). The added time and errors are passed through from downstream calls.`);
    return { status: "elevated", label: inherited ? "Elevated (downstream)" : "Elevated", reasons };
  }
  return { status: "healthy", label: "Healthy", reasons: ["Latency and error rate are inside their normal variation bands."] };
}

function safeMetric(key: string) {
  try {
    return metric(key);
  } catch {
    return null;
  }
}

export function serviceHealth(id: ServiceId, t: number): HealthAssessment {
  const s = SERVICE_BY_ID[id];
  return assessMetrics(id, s.metrics, t, { maintenance: s.maintenance });
}

export const STATUS_META: Record<HealthStatus, { label: string; text: string; bg: string; border: string; dot: string; hex: string }> = {
  healthy: { label: "Healthy", text: "text-status-healthy", bg: "bg-status-healthy/10", border: "border-status-healthy/40", dot: "bg-status-healthy", hex: "#22C55E" },
  elevated: { label: "Elevated", text: "text-status-elevated", bg: "bg-status-elevated/10", border: "border-status-elevated/40", dot: "bg-status-elevated", hex: "#F5A524" },
  degraded: { label: "Degraded", text: "text-status-degraded", bg: "bg-status-degraded/10", border: "border-status-degraded/50", dot: "bg-status-degraded", hex: "#F97316" },
  unavailable: { label: "Unavailable", text: "text-status-unavailable", bg: "bg-status-unavailable/10", border: "border-status-unavailable/50", dot: "bg-status-unavailable", hex: "#EF4444" },
};
