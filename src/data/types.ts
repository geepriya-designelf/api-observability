/**
 * Shared data model for the Nium API Observability portfolio concept.
 * Every record is synthetic. Stable string IDs connect services, endpoints,
 * traces, spans, logs, incidents and timeline events across all four views.
 *
 * Time is expressed as "simulated minutes since 00:00 UTC" on the demo day
 * (2026-10-14). Span offsets inside a trace are expressed in milliseconds.
 */

export type ServiceId =
  | "api-gateway"
  | "payout-service"
  | "compliance-service"
  | "fx-service"
  | "wallet-service"
  | "payment-orchestration"
  | "partner-rail-a"
  | "partner-rail-b";

export type EndpointId =
  | "create-payout"
  | "get-payout-status"
  | "create-fx-quote"
  | "get-wallet-balance";

export type HealthStatus = "healthy" | "elevated" | "degraded" | "unavailable";

export type SimMinute = number;

export interface IncidentShape {
  /** Minute at which the deviation starts. */
  onset: SimMinute;
  /** Minutes to reach full deviation. */
  ramp: number;
  /** Absolute amount added at full deviation. */
  delta: number;
  /** Additional absolute amount per minute once fully ramped. */
  growth?: number;
  /** Optional: the deviation ends (returns to baseline) at this minute. */
  until?: SimMinute;
}

/** A deterministic metric definition. Sampled at any minute via valueAt(). */
export interface MetricDef {
  key: string;
  label: string;
  unit: "rpm" | "ms" | "%" | "count" | "per-min";
  baseline: number;
  /** Fractional diurnal swing applied to baseline (0.05 = ±5%). */
  diurnal: number;
  /** Fractional per-minute noise. */
  noise: number;
  /** Half-width of the normal-variation band, as a fraction of baseline. */
  band: number;
  incident?: IncidentShape;
  /** Clamp the result to this minimum (eg. 0 for counts). */
  min?: number;
  /** Clamp the result to this maximum (eg. 100 for availability). */
  max?: number;
  decimals: number;
  /** Plain-language definition, shown in tooltips. */
  definition: string;
}

export interface ServiceMetricKeys {
  rpm: string;
  errorRate: string;
  p95: string;
  p99: string;
}

export interface ServiceDef {
  id: ServiceId;
  name: string;
  kind: "edge" | "internal" | "external";
  owner: string;
  description: string;
  metrics: ServiceMetricKeys;
  /** Optional planned maintenance window (minutes). */
  maintenance?: { start: SimMinute; end: SimMinute; note: string };
  /** Static health classification rules, explained in the UI. */
  healthRules: string[];
}

export interface DependencyEdge {
  id: string;
  from: ServiceId;
  to: ServiceId;
  protocol: "HTTPS" | "gRPC" | "Kafka";
  /** Optional metric key describing retries on this edge. */
  retryMetric?: string;
  note?: string;
}

export interface EndpointDef {
  id: EndpointId;
  method: "GET" | "POST";
  path: string;
  name: string;
  /** Services traversed by a request to this endpoint (in call order). */
  path_services: ServiceId[];
  metrics: ServiceMetricKeys;
}

export type SpanStatus = "ok" | "warning" | "error";

export interface LogEntry {
  id: string;
  /** Offset from trace start in ms. */
  offsetMs: number;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  message: string;
  attributes?: Record<string, string | number>;
}

export interface Span {
  id: string;
  traceId: string;
  parentId: string | null;
  service: ServiceId;
  operation: string;
  /** Offset from trace start in ms. */
  startMs: number;
  durationMs: number;
  status: SpanStatus;
  attributes: Record<string, string | number | boolean>;
  logs: LogEntry[];
  /** When logs exist outside our boundary (eg. external partner). */
  logsUnavailableReason?: string;
  error?: { type: string; message: string };
}

export type TraceOutcome = "healthy" | "slow" | "failed";

export interface Trace {
  id: string;
  endpoint: EndpointId;
  /** Absolute start: simulated minute + seconds offset for display. */
  startMinute: SimMinute;
  startSecond: number;
  durationMs: number;
  outcome: TraceOutcome;
  httpStatus: number;
  payoutId?: string;
  incidentId?: string;
  summary: string;
  spans: Span[];
}

export type TimelineEventType =
  | "latency-anomaly"
  | "error-rate-change"
  | "health-transition"
  | "retries"
  | "deployment"
  | "config-change"
  | "payout-lifecycle"
  | "incident-detection";

export interface TimelineEvent {
  id: string;
  minute: SimMinute;
  type: TimelineEventType;
  title: string;
  description: string;
  services: ServiceId[];
  traceIds: string[];
  /** Metric keys worth inspecting around this event. */
  metricKeys: string[];
  source: string;
}

export type IncidentStatus = "triggered" | "acknowledged" | "investigating" | "mitigated" | "resolved";

export type EvidenceKind = "observed" | "inferred" | "hypothesis";

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  statement: string;
  sources: { label: string; ref: { view: "health" | "topology" | "traces" | "incident"; id?: string; spanId?: string } }[];
  confidence?: "low" | "moderate" | "high";
  supporting?: string[];
  against?: string[];
  missing?: string[];
}

export interface Incident {
  id: string;
  title: string;
  severity: "SEV-1" | "SEV-2" | "SEV-3";
  startMinute: SimMinute;
  detectedMinute: SimMinute;
  initialStatus: IncidentStatus;
  detector: string;
  affectedEndpoints: EndpointId[];
  affectedServices: ServiceId[];
  primaryService: ServiceId;
  supportingTraceIds: string[];
  primaryTraceId: string;
  primarySpanId: string;
  timelineEventIds: string[];
  evidence: EvidenceItem[];
  summary: string;
  nextSteps: string[];
}

export type PayoutState =
  | "CREATED"
  | "COMPLIANCE_CLEARED"
  | "SUBMITTED_TO_PARTNER"
  | "COMPLETED"
  | "PENDING_BEYOND_WINDOW"
  | "PENDING_UNKNOWN";

export interface PayoutLifecycleRecord {
  payoutId: string;
  corridor: string;
  rail: "Rail A" | "Rail B";
  createdMinute: SimMinute;
  traceId?: string;
  events: { minute: SimMinute; second: number; state: PayoutState }[];
  currentState: PayoutState;
}
