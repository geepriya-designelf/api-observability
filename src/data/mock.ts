import { formatBaseline, formatMetric, hhmm, valueAt } from "./metrics";
import type {
  DependencyEdge,
  EndpointDef,
  EndpointId,
  Incident,
  LogEntry,
  PayoutLifecycleRecord,
  ServiceDef,
  ServiceId,
  Span,
  SpanStatus,
  TimelineEvent,
  Trace,
} from "./types";

export const INCIDENT_ID = "inc-payout-latency-001";
export const PRIMARY_TRACE_ID = "trace-payout-1042";
export const PRIMARY_SPAN_ID = "span-orchestration-03";

/* ------------------------------------------------------------------ */
/* Services                                                             */
/* ------------------------------------------------------------------ */

const keys = (id: string) => ({ rpm: `${id}.rpm`, errorRate: `${id}.errorRate`, p95: `${id}.p95`, p99: `${id}.p99` });

const STANDARD_RULES = [
  "Degraded: self time P95 above 3× baseline, or error rate above 3× baseline that originates in this service, for 5+ minutes.",
  "Elevated: end-to-end P95 above 1.5× baseline, or error rate above 2× baseline, for 5+ minutes.",
  "Unavailable: no successful requests, or in a declared maintenance window.",
];

export const SERVICES: ServiceDef[] = [
  {
    id: "api-gateway",
    name: "API Gateway",
    kind: "edge",
    owner: "Platform Edge",
    description: "Public entry point. Terminates TLS, authenticates API keys and routes requests to internal services.",
    metrics: keys("api-gateway"),
    healthRules: STANDARD_RULES,
  },
  {
    id: "payout-service",
    name: "Payout Service",
    kind: "internal",
    owner: "Payouts",
    description: "Owns the Create Payout API. Validates the request and coordinates compliance, FX, wallet and orchestration steps.",
    metrics: keys("payout-service"),
    healthRules: STANDARD_RULES,
  },
  {
    id: "compliance-service",
    name: "Compliance Service",
    kind: "internal",
    owner: "Risk & Compliance",
    description: "Sanctions and AML screening for the payout beneficiary.",
    metrics: keys("compliance-service"),
    healthRules: STANDARD_RULES,
  },
  {
    id: "fx-service",
    name: "FX Service",
    kind: "internal",
    owner: "Treasury",
    description: "Locks the FX rate for cross-currency payouts and serves FX quotes.",
    metrics: keys("fx-service"),
    healthRules: STANDARD_RULES,
  },
  {
    id: "wallet-service",
    name: "Wallet Service",
    kind: "internal",
    owner: "Ledger",
    description: "Checks and reserves funds in the customer wallet.",
    metrics: keys("wallet-service"),
    healthRules: STANDARD_RULES,
  },
  {
    id: "payment-orchestration",
    name: "Payment Orchestration",
    kind: "internal",
    owner: "Payment Rails",
    description: "Selects a payment rail, manages connection pools and retries, and submits payouts to external partners.",
    metrics: keys("payment-orchestration"),
    healthRules: STANDARD_RULES,
  },
  {
    id: "partner-rail-a",
    name: "External Payment Partner",
    kind: "external",
    owner: "Partner: Rail A",
    description: "Primary real-time payout rail. External system: we observe it only from our side of the connection.",
    metrics: keys("partner-rail-a"),
    healthRules: STANDARD_RULES,
  },
  {
    id: "partner-rail-b",
    name: "Partner Rail B",
    kind: "external",
    owner: "Partner: Rail B",
    description: "Secondary payout rail. Takes part of the traffic outside maintenance windows.",
    metrics: keys("partner-rail-b"),
    maintenance: { start: 840, end: 900, note: "Scheduled partner maintenance 14:00 to 15:00 UTC. Traffic is routed to Rail A." },
    healthRules: STANDARD_RULES,
  },
];

export const SERVICE_BY_ID = Object.fromEntries(SERVICES.map((s) => [s.id, s])) as Record<ServiceId, ServiceDef>;

export const EDGES: DependencyEdge[] = [
  { id: "e-gw-payout", from: "api-gateway", to: "payout-service", protocol: "HTTPS" },
  { id: "e-payout-compliance", from: "payout-service", to: "compliance-service", protocol: "gRPC" },
  { id: "e-payout-fx", from: "payout-service", to: "fx-service", protocol: "gRPC" },
  { id: "e-payout-wallet", from: "payout-service", to: "wallet-service", protocol: "gRPC" },
  { id: "e-payout-orch", from: "payout-service", to: "payment-orchestration", protocol: "gRPC" },
  {
    id: "e-orch-rail-a",
    from: "payment-orchestration",
    to: "partner-rail-a",
    protocol: "HTTPS",
    retryMetric: "payment-orchestration.retries",
  },
  {
    id: "e-orch-rail-b",
    from: "payment-orchestration",
    to: "partner-rail-b",
    protocol: "HTTPS",
    note: "Paused during maintenance",
  },
];

export function upstreamOf(id: ServiceId): ServiceId[] {
  const out = new Set<ServiceId>();
  const walk = (n: ServiceId) => {
    for (const e of EDGES) if (e.to === n && !out.has(e.from)) {
      out.add(e.from);
      walk(e.from);
    }
  };
  walk(id);
  return [...out];
}

export function downstreamOf(id: ServiceId): ServiceId[] {
  const out = new Set<ServiceId>();
  const walk = (n: ServiceId) => {
    for (const e of EDGES) if (e.from === n && !out.has(e.to)) {
      out.add(e.to);
      walk(e.to);
    }
  };
  walk(id);
  return [...out];
}

/* ------------------------------------------------------------------ */
/* API endpoints                                                        */
/* ------------------------------------------------------------------ */

export const ENDPOINTS: EndpointDef[] = [
  {
    id: "create-payout",
    method: "POST",
    path: "/v1/payouts",
    name: "Create Payout",
    path_services: ["api-gateway", "payout-service", "compliance-service", "fx-service", "wallet-service", "payment-orchestration", "partner-rail-a", "partner-rail-b"],
    metrics: keys("create-payout"),
  },
  {
    id: "get-payout-status",
    method: "GET",
    path: "/v1/payouts/{id}",
    name: "Get Payout Status",
    path_services: ["api-gateway", "payout-service"],
    metrics: keys("get-payout-status"),
  },
  {
    id: "create-fx-quote",
    method: "POST",
    path: "/v1/fx/quotes",
    name: "Create FX Quote",
    path_services: ["api-gateway", "fx-service"],
    metrics: keys("create-fx-quote"),
  },
  {
    id: "get-wallet-balance",
    method: "GET",
    path: "/v1/wallets/{id}/balance",
    name: "Get Wallet Balance",
    path_services: ["api-gateway", "wallet-service"],
    metrics: keys("get-wallet-balance"),
  },
];

export const ENDPOINT_BY_ID = Object.fromEntries(ENDPOINTS.map((e) => [e.id, e])) as Record<EndpointId, EndpointDef>;

/* ------------------------------------------------------------------ */
/* Traces                                                               */
/* ------------------------------------------------------------------ */

interface Attempt {
  durationMs: number;
  status: SpanStatus;
  note?: string;
}

interface PayoutTraceSpec {
  id: string;
  n: number;
  minute: number;
  second: number;
  version: string;
  host: string;
  rail: "Rail A" | "Rail B";
  poolWaitMs: number;
  attempts: Attempt[];
  failed?: boolean;
  payoutId: string;
  corridor: string;
  complianceMs?: number;
  incident?: boolean;
  summary: string;
}

let logSeq = 0;
const log = (offsetMs: number, level: LogEntry["level"], message: string, attributes?: LogEntry["attributes"]): LogEntry => ({
  id: `log-${++logSeq}`,
  offsetMs,
  level,
  message,
  attributes,
});

function buildPayoutTrace(s: PayoutTraceSpec): Trace {
  const t = s.id;
  const spans: Span[] = [];
  const authStart = 3;
  const authDur = 18;
  const payoutStart = 24;
  const compStart = 30;
  const compDur = s.complianceMs ?? 88;
  const fxStart = compStart + compDur + 2;
  const fxDur = 44;
  const walletStart = fxStart + fxDur + 2;
  const walletDur = 32;
  const orchStart = walletStart + walletDur + 6;

  // Orchestration internals: pool wait, then partner attempts with backoff.
  const partnerSpans: Span[] = [];
  let cursor = orchStart + 6 + s.poolWaitMs;
  const orchLogs: LogEntry[] = [
    log(orchStart + 1, "INFO", `Routing payout to ${s.rail}`, {
      rail: s.rail,
      reason: s.rail === "Rail A" && s.minute >= 840 ? "Rail B in scheduled maintenance" : "Corridor default",
    }),
  ];
  if (s.poolWaitMs > 200) {
    orchLogs.push(
      log(orchStart + 6 + s.poolWaitMs, "WARN", `Waited ${s.poolWaitMs.toLocaleString("en-US")} ms to acquire connection from pool`, {
        pool: s.rail === "Rail A" ? "partner-rail-a-http" : "partner-rail-b-http",
        "pool.active": "120/120",
        "pool.pending": Math.round(s.poolWaitMs / 9),
        "wait.threshold_ms": 200,
      }),
    );
  } else {
    orchLogs.push(log(orchStart + 6 + s.poolWaitMs, "DEBUG", "Connection acquired from pool", { "pool.active": s.minute >= 840 ? "96/120" : "64/120", wait_ms: s.poolWaitMs }));
  }

  const partnerId: ServiceId = s.rail === "Rail A" ? "partner-rail-a" : "partner-rail-b";
  s.attempts.forEach((a, i) => {
    const id = `span-partner-${String(9 + i).padStart(2, "0")}`;
    partnerSpans.push({
      id,
      traceId: t,
      parentId: PRIMARY_SPAN_ID_FOR(t),
      service: partnerId,
      operation: `POST /payouts (attempt ${i + 1})`,
      startMs: cursor,
      durationMs: a.durationMs,
      status: a.status,
      attributes: {
        "net.peer.name": s.rail === "Rail A" ? "api.rail-a.partner.example" : "api.rail-b.partner.example",
        "retry.attempt": i + 1,
        "http.status_code": a.status === "ok" ? 202 : a.status === "warning" ? 503 : 0,
        "client.timeout_ms": 600,
      },
      logs: [],
      logsUnavailableReason: "External partner system. Partner-side logs are not shared with us; only our client-side timing and response are available.",
      error: a.status === "error" ? { type: "ClientTimeout", message: a.note ?? "No response within 600 ms client timeout" } : undefined,
    });
    if (a.status === "warning") {
      orchLogs.push(
        log(cursor + a.durationMs + 1, "WARN", `Partner responded 503 (retryable). Scheduling retry ${i + 2}`, {
          attempt: i + 1,
          backoff_ms: 60,
        }),
      );
    } else if (a.status === "error") {
      orchLogs.push(log(cursor + a.durationMs + 1, "WARN", `Partner call timed out after ${a.durationMs} ms`, { attempt: i + 1 }));
    } else {
      orchLogs.push(log(cursor + a.durationMs + 1, "INFO", "Partner accepted payout", { partner_ref: `RA-${s.n}88${i}`, attempt: i + 1 }));
    }
    cursor += a.durationMs + 60;
  });
  cursor -= 60;
  const orchEnd = cursor + 12;
  if (s.failed) {
    orchLogs.push(
      log(orchEnd - 2, "ERROR", `Deadline exceeded after ${s.attempts.length} attempts. Payout marked PENDING_UNKNOWN for reconciliation`, {
        "payout.id": s.payoutId,
        "reconciliation.queue": "rail-a-unknown",
      }),
    );
  }
  const orchDur = orchEnd - orchStart;
  const payoutEnd = orchEnd + 10;
  const gwEnd = payoutEnd + 8;

  const orchId = PRIMARY_SPAN_ID_FOR(t);
  const errStatus: SpanStatus = s.failed ? "error" : "ok";

  spans.push({
    id: "span-gateway-01",
    traceId: t,
    parentId: null,
    service: "api-gateway",
    operation: "POST /v1/payouts",
    startMs: 0,
    durationMs: gwEnd,
    status: s.failed ? "error" : "ok",
    attributes: {
      "http.method": "POST",
      "http.route": "/v1/payouts",
      "http.status_code": s.failed ? 504 : 201,
      "client.id": "cl_synthetic_0042",
      region: "ap-southeast-1",
    },
    logs: [
      log(0, "INFO", "Request received", { "http.route": "/v1/payouts", "request.bytes": 1184 }),
      log(gwEnd, s.failed ? "ERROR" : "INFO", s.failed ? "Upstream deadline exceeded. Returned 504 to client" : "Response sent", {
        "http.status_code": s.failed ? 504 : 201,
        duration_ms: gwEnd,
      }),
    ],
    error: s.failed ? { type: "GatewayTimeout", message: "Upstream payout-service did not respond within the request deadline" } : undefined,
  });
  spans.push({
    id: "span-auth-02",
    traceId: t,
    parentId: "span-gateway-01",
    service: "api-gateway",
    operation: "Authenticate API key",
    startMs: authStart,
    durationMs: authDur,
    status: "ok",
    attributes: { "auth.method": "api_key", "auth.cache": "hit" },
    logs: [log(authStart + authDur, "DEBUG", "API key validated", { scope: "payouts:write" })],
  });
  spans.push({
    id: "span-payout-04",
    traceId: t,
    parentId: "span-gateway-01",
    service: "payout-service",
    operation: "CreatePayout",
    startMs: payoutStart,
    durationMs: payoutEnd - payoutStart,
    status: errStatus,
    attributes: {
      "payout.id": s.payoutId,
      "payout.corridor": s.corridor,
      "payout.amount": "1,250.00",
      "service.version": "v5.4.0",
    },
    logs: [
      log(payoutStart + 2, "INFO", "Payout request validated", { "payout.id": s.payoutId }),
      log(payoutEnd - 1, s.failed ? "ERROR" : "INFO", s.failed ? "Orchestration returned DEADLINE_EXCEEDED" : "Payout submitted", {
        "payout.state": s.failed ? "PENDING_UNKNOWN" : "SUBMITTED_TO_PARTNER",
      }),
    ],
    error: s.failed ? { type: "DeadlineExceeded", message: "payment-orchestration: deadline exceeded" } : undefined,
  });
  spans.push({
    id: "span-compliance-05",
    traceId: t,
    parentId: "span-payout-04",
    service: "compliance-service",
    operation: "ScreenBeneficiary",
    startMs: compStart,
    durationMs: compDur,
    status: "ok",
    attributes: { "screening.lists": "OFAC, UN, EU", "screening.result": "clear" },
    logs: [log(compStart + compDur, "INFO", "Beneficiary screening clear", { "screening.ms": compDur })],
  });
  spans.push({
    id: "span-fx-06",
    traceId: t,
    parentId: "span-payout-04",
    service: "fx-service",
    operation: "LockRate",
    startMs: fxStart,
    durationMs: fxDur,
    status: "ok",
    attributes: { "fx.pair": s.corridor.replace("→", "/"), "fx.rate_source": "cache" },
    logs: [log(fxStart + fxDur, "DEBUG", "Rate locked for 60s", { "fx.pair": s.corridor.replace("→", "/") })],
  });
  spans.push({
    id: "span-wallet-07",
    traceId: t,
    parentId: "span-payout-04",
    service: "wallet-service",
    operation: "ReserveFunds",
    startMs: walletStart,
    durationMs: walletDur,
    status: "ok",
    attributes: { "wallet.currency": s.corridor.split("→")[0], "ledger.write": "reserve" },
    logs: [log(walletStart + walletDur, "DEBUG", "Funds reserved", { "ledger.entry": `le_${s.n}77` })],
  });
  spans.push({
    id: orchId,
    traceId: t,
    parentId: "span-payout-04",
    service: "payment-orchestration",
    operation: "SubmitToPartner",
    startMs: orchStart,
    durationMs: orchDur,
    status: s.failed ? "error" : s.poolWaitMs > 200 ? "warning" : "ok",
    attributes: {
      "service.version": s.version,
      "host.name": s.host,
      "rail.selected": s.rail,
      "pool.name": s.rail === "Rail A" ? "partner-rail-a-http" : "partner-rail-b-http",
      "pool.wait_ms": s.poolWaitMs,
      "retry.count": s.attempts.length - 1,
    },
    logs: orchLogs.sort((a, b) => a.offsetMs - b.offsetMs),
    error: s.failed ? { type: "DeadlineExceeded", message: `No successful partner response after ${s.attempts.length} attempts` } : undefined,
  });
  spans.push(...partnerSpans);

  const durationMs = gwEnd;
  return {
    id: t,
    endpoint: "create-payout",
    startMinute: s.minute,
    startSecond: s.second,
    durationMs,
    outcome: s.failed ? "failed" : durationMs > 1500 ? "slow" : "healthy",
    httpStatus: s.failed ? 504 : 201,
    payoutId: s.payoutId,
    incidentId: s.incident ? INCIDENT_ID : undefined,
    summary: s.summary,
    spans,
  };
}

/** The orchestration span id in the primary trace is the one referenced across the UI. */
function PRIMARY_SPAN_ID_FOR(traceId: string) {
  return traceId === PRIMARY_TRACE_ID ? PRIMARY_SPAN_ID : "span-orchestration-03";
}

function buildSimpleTrace(opts: {
  id: string;
  endpoint: EndpointId;
  minute: number;
  second: number;
  service: ServiceId;
  operation: string;
  serviceMs: number;
  route: string;
  method: "GET" | "POST";
  summary: string;
}): Trace {
  const gwEnd = 24 + opts.serviceMs + 6;
  const spans: Span[] = [
    {
      id: "span-gateway-01",
      traceId: opts.id,
      parentId: null,
      service: "api-gateway",
      operation: `${opts.method} ${opts.route}`,
      startMs: 0,
      durationMs: gwEnd,
      status: "ok",
      attributes: { "http.method": opts.method, "http.route": opts.route, "http.status_code": 200 },
      logs: [log(0, "INFO", "Request received"), log(gwEnd, "INFO", "Response sent", { duration_ms: gwEnd })],
    },
    {
      id: "span-auth-02",
      traceId: opts.id,
      parentId: "span-gateway-01",
      service: "api-gateway",
      operation: "Authenticate API key",
      startMs: 3,
      durationMs: 17,
      status: "ok",
      attributes: { "auth.method": "api_key", "auth.cache": "hit" },
      logs: [],
    },
    {
      id: "span-service-03",
      traceId: opts.id,
      parentId: "span-gateway-01",
      service: opts.service,
      operation: opts.operation,
      startMs: 24,
      durationMs: opts.serviceMs,
      status: "ok",
      attributes: { "service.version": "v2.9.1" },
      logs: [log(24 + opts.serviceMs, "DEBUG", `${opts.operation} complete`)],
    },
  ];
  return {
    id: opts.id,
    endpoint: opts.endpoint,
    startMinute: opts.minute,
    startSecond: opts.second,
    durationMs: gwEnd,
    outcome: "healthy",
    httpStatus: 200,
    summary: opts.summary,
    spans,
  };
}

export const TRACES: Trace[] = [
  buildPayoutTrace({
    id: "trace-payout-0942",
    n: 942,
    minute: 13 * 60 + 41,
    second: 2,
    version: "v3.18.1",
    host: "orch-7c9d-2",
    rail: "Rail B",
    poolWaitMs: 3,
    attempts: [{ durationMs: 252, status: "ok" }],
    payoutId: "po_5e21_0942",
    corridor: "SGD→PHP",
    summary: "Healthy payout on Rail B before the maintenance window.",
  }),
  buildPayoutTrace({
    id: "trace-payout-0987",
    n: 987,
    minute: 13 * 60 + 48,
    second: 10,
    version: "v3.18.1",
    host: "orch-7c9d-1",
    rail: "Rail A",
    poolWaitMs: 2,
    attempts: [{ durationMs: 274, status: "ok" }],
    payoutId: "po_6b10_0987",
    corridor: "SGD→INR",
    summary: "Healthy payout before the incident. Use as the comparison baseline.",
  }),
  buildSimpleTrace({
    id: "trace-fx-quote-2210",
    endpoint: "create-fx-quote",
    minute: 14 * 60 + 2,
    second: 33,
    service: "fx-service",
    operation: "CreateQuote",
    serviceMs: 41,
    route: "/v1/fx/quotes",
    method: "POST",
    summary: "FX quote request. Does not touch Payment Orchestration.",
  }),
  buildPayoutTrace({
    id: "trace-payout-1031",
    n: 1031,
    minute: 14 * 60 + 9,
    second: 47,
    version: "v3.18.2",
    host: "orch-8e1f-1",
    rail: "Rail A",
    poolWaitMs: 1420,
    attempts: [{ durationMs: 412, status: "ok" }],
    payoutId: "po_71c4_1031",
    corridor: "SGD→INR",
    incident: true,
    summary: "Slow payout on a canary instance (v3.18.2). Long connection pool wait.",
  }),
  buildPayoutTrace({
    id: "trace-payout-1042",
    n: 1042,
    minute: 14 * 60 + 13,
    second: 22,
    version: "v3.18.1",
    host: "orch-7c9d-3",
    rail: "Rail A",
    poolWaitMs: 1840,
    attempts: [
      { durationMs: 300, status: "warning" },
      { durationMs: 470, status: "ok" },
    ],
    payoutId: "po_7f3a_1042",
    corridor: "SGD→INR",
    incident: true,
    summary: "Slow payout on a stable instance (v3.18.1). Pool wait plus one partner retry.",
  }),
  buildSimpleTrace({
    id: "trace-wallet-0871",
    endpoint: "get-wallet-balance",
    minute: 14 * 60 + 14,
    second: 5,
    service: "wallet-service",
    operation: "GetBalance",
    serviceMs: 22,
    route: "/v1/wallets/{id}/balance",
    method: "GET",
    summary: "Wallet balance request during the incident. Unaffected.",
  }),
  buildPayoutTrace({
    id: "trace-payout-1057",
    n: 1057,
    minute: 14 * 60 + 16,
    second: 41,
    version: "v3.18.2",
    host: "orch-8e1f-2",
    rail: "Rail A",
    poolWaitMs: 2100,
    attempts: [
      { durationMs: 600, status: "error" },
      { durationMs: 600, status: "error" },
      { durationMs: 600, status: "error" },
    ],
    failed: true,
    payoutId: "po_80d2_1057",
    corridor: "SGD→IDR",
    incident: true,
    summary: "Failed payout. Three partner timeouts, then deadline exceeded (504).",
  }),
  buildSimpleTrace({
    id: "trace-payout-status-3302",
    endpoint: "get-payout-status",
    minute: 14 * 60 + 18,
    second: 55,
    service: "payout-service",
    operation: "GetPayout",
    serviceMs: 28,
    route: "/v1/payouts/{id}",
    method: "GET",
    summary: "Payout status lookup during the incident. Unaffected.",
  }),
  buildPayoutTrace({
    id: "trace-payout-1066",
    n: 1066,
    minute: 14 * 60 + 20,
    second: 18,
    version: "v3.18.1",
    host: "orch-7c9d-1",
    rail: "Rail A",
    poolWaitMs: 1690,
    attempts: [{ durationMs: 438, status: "ok" }],
    payoutId: "po_88e9_1066",
    corridor: "SGD→VND",
    incident: true,
    summary: "Slow payout on a stable instance. Pool wait, no retry.",
  }),
];

export const TRACE_BY_ID = Object.fromEntries(TRACES.map((t) => [t.id, t])) as Record<string, Trace>;

/* ------------------------------------------------------------------ */
/* Trace analysis helpers                                               */
/* ------------------------------------------------------------------ */

export function childrenOf(trace: Trace, spanId: string): Span[] {
  return trace.spans.filter((s) => s.parentId === spanId);
}

/** Time spent in a span that is not covered by any of its children. */
export function selfTimeMs(trace: Trace, span: Span): number {
  const kids = childrenOf(trace, span.id)
    .map((k) => [k.startMs, k.startMs + k.durationMs] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [s, e] of kids) {
    if (s > curEnd) {
      if (curEnd > curStart) covered += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else curEnd = Math.max(curEnd, e);
  }
  if (curEnd > curStart) covered += curEnd - curStart;
  return Math.max(0, span.durationMs - covered);
}

export function slowestSpan(trace: Trace): Span {
  return [...trace.spans].sort((a, b) => selfTimeMs(trace, b) - selfTimeMs(trace, a))[0];
}

export function spanDepth(trace: Trace, span: Span): number {
  let d = 0;
  let p = span.parentId;
  while (p) {
    d++;
    p = trace.spans.find((s) => s.id === p)?.parentId ?? null;
  }
  return d;
}

/** Spans in depth-first order for the waterfall. */
export function orderedSpans(trace: Trace): Span[] {
  const out: Span[] = [];
  const visit = (parent: string | null) => {
    trace.spans
      .filter((s) => s.parentId === parent)
      .sort((a, b) => a.startMs - b.startMs)
      .forEach((s) => {
        out.push(s);
        visit(s.id);
      });
  };
  visit(null);
  return out;
}

export function tracesForService(id: ServiceId): Trace[] {
  return TRACES.filter((t) => t.spans.some((s) => s.service === id));
}

/* ------------------------------------------------------------------ */
/* Timeline events                                                      */
/* ------------------------------------------------------------------ */

const primary = TRACE_BY_ID[PRIMARY_TRACE_ID];
const primaryOrch = primary.spans.find((s) => s.id === PRIMARY_SPAN_ID)!;
const primaryShare = Math.round((primaryOrch.durationMs / primary.durationMs) * 100);
const primarySelf = selfTimeMs(primary, primaryOrch);

export const TIMELINE_EVENTS: TimelineEvent[] = [
  {
    id: "evt-deploy-orch",
    minute: 13 * 60 + 58,
    type: "deployment",
    title: "Payment Orchestration v3.18.2 canary (25%)",
    description:
      "Canary deployment to 1 of 4 orchestration instances (orch-8e1f-*). Change log: retry policy refactor, dependency upgrades. Precedes the latency rise by 6 minutes.",
    services: ["payment-orchestration"],
    traceIds: ["trace-payout-1031", "trace-payout-1057"],
    metricKeys: ["payment-orchestration.p95"],
    source: "Deploy pipeline",
  },
  {
    id: "evt-rail-b-maintenance",
    minute: 14 * 60,
    type: "config-change",
    title: "Rail B maintenance: traffic routed to Rail A",
    description:
      "Scheduled partner maintenance began. Orchestration routing rule moved Rail B traffic to Rail A. Rail A request volume rose from about 720 to about 1,130 per minute.",
    services: ["partner-rail-b", "partner-rail-a", "payment-orchestration"],
    traceIds: [],
    metricKeys: ["partner-rail-a.rpm"],
    source: "Routing config · partner notice",
  },
  {
    id: "evt-rail-b-unavailable",
    minute: 14 * 60 + 1,
    type: "health-transition",
    title: "Partner Rail B: healthy → unavailable (planned)",
    description: "Expected state during the declared maintenance window. Not treated as a fault.",
    services: ["partner-rail-b"],
    traceIds: [],
    metricKeys: ["partner-rail-b.rpm"],
    source: "Health evaluator",
  },
  {
    id: "evt-orch-latency",
    minute: 14 * 60 + 4,
    type: "latency-anomaly",
    title: "Payment Orchestration P95 leaves baseline band",
    description: `Orchestration P95 rose above its normal band (baseline ${formatBaseline("payment-orchestration.p95", 844)}). First latency signal in the sequence, 3 minutes before Create Payout breached.`,
    services: ["payment-orchestration"],
    traceIds: [],
    metricKeys: ["payment-orchestration.p95", "payment-orchestration.self"],
    source: "Anomaly detector",
  },
  {
    id: "evt-retries-up",
    minute: 14 * 60 + 6,
    type: "retries",
    title: "Retries to Rail A increasing",
    description: `Orchestration retries to Rail A rose from about ${formatBaseline("payment-orchestration.retries", 846)} to ${formatMetric("payment-orchestration.retries", 846)} per minute and kept rising. Retries may be a consequence of slow calls, a contributor to pool pressure, or both. Direction is not established.`,
    services: ["payment-orchestration", "partner-rail-a"],
    traceIds: ["trace-payout-1042"],
    metricKeys: ["payment-orchestration.retries"],
    source: "Orchestration metrics",
  },
  {
    id: "evt-create-payout-latency",
    minute: 14 * 60 + 7,
    type: "latency-anomaly",
    title: "Create Payout P95 above 2× baseline",
    description: `POST /v1/payouts P95 reached ${formatMetric("create-payout.p95", 847)} against a baseline of ${formatBaseline("create-payout.p95", 847)}. Request volume stayed within its normal band. Incident start time.`,
    services: ["payout-service"],
    traceIds: ["trace-payout-1031"],
    metricKeys: ["create-payout.p95", "create-payout.rpm"],
    source: "Anomaly detector",
  },
  {
    id: "evt-orch-degraded",
    minute: 14 * 60 + 9,
    type: "health-transition",
    title: "Payment Orchestration: healthy → degraded",
    description: "Self time P95 exceeded 3× baseline for 5 minutes. Payout Service moved to elevated because its own self time stayed normal.",
    services: ["payment-orchestration", "payout-service"],
    traceIds: [],
    metricKeys: ["payment-orchestration.self", "payout-service.self"],
    source: "Health evaluator",
  },
  {
    id: "evt-incident-detected",
    minute: 14 * 60 + 10,
    type: "incident-detection",
    title: `Incident opened: ${INCIDENT_ID} (SEV-2)`,
    description: "Rule: Create Payout P95 above 2× baseline for 3 minutes with stable traffic. On-call paged.",
    services: ["payout-service", "payment-orchestration"],
    traceIds: [],
    metricKeys: ["create-payout.p95"],
    source: "Alerting",
  },
  {
    id: "evt-payouts-window",
    minute: 14 * 60 + 12,
    type: "payout-lifecycle",
    title: "First payouts exceed expected processing window",
    description: "Payouts created at 14:07 have not reached COMPLETED after 5 minutes. All are on Rail A.",
    services: ["payout-service", "payment-orchestration", "partner-rail-a"],
    traceIds: ["trace-payout-1042"],
    metricKeys: ["payouts.pendingBeyondWindow"],
    source: "Payout lifecycle tracker",
  },
  {
    id: "evt-error-rate",
    minute: 14 * 60 + 15,
    type: "error-rate-change",
    title: "Create Payout error rate rising (504 timeouts)",
    description: `Create Payout error rate ${formatMetric("create-payout.errorRate", 855)} against a baseline of ${formatBaseline("create-payout.errorRate", 855)}. Errors are gateway timeouts, not validation failures.`,
    services: ["payout-service", "api-gateway"],
    traceIds: ["trace-payout-1057"],
    metricKeys: ["create-payout.errorRate"],
    source: "Anomaly detector",
  },
  {
    id: "evt-payout-unknown",
    minute: 14 * 60 + 16,
    type: "payout-lifecycle",
    title: "Payout po_80d2_1057 → PENDING_UNKNOWN",
    description: "Client received a 504, but the partner may have received the request. Payout queued for reconciliation.",
    services: ["payment-orchestration", "partner-rail-a"],
    traceIds: ["trace-payout-1057"],
    metricKeys: ["payouts.failed"],
    source: "Payout lifecycle tracker",
  },
  {
    id: "evt-pending-31",
    minute: 14 * 60 + 21,
    type: "payout-lifecycle",
    title: `${formatMetric("payouts.pendingBeyondWindow", 861)} payouts pending beyond window`,
    description: "Pending count still growing. No payouts on non-Rail A corridors affected.",
    services: ["payout-service", "partner-rail-a"],
    traceIds: ["trace-payout-1066"],
    metricKeys: ["payouts.pendingBeyondWindow"],
    source: "Payout lifecycle tracker",
  },
];

export const EVENT_BY_ID = Object.fromEntries(TIMELINE_EVENTS.map((e) => [e.id, e])) as Record<string, TimelineEvent>;

/* ------------------------------------------------------------------ */
/* Incident                                                             */
/* ------------------------------------------------------------------ */

const t1031 = TRACE_BY_ID["trace-payout-1031"];
const t1066 = TRACE_BY_ID["trace-payout-1066"];

export const INCIDENTS: Incident[] = [
  {
    id: INCIDENT_ID,
    title: "Elevated Create Payout Latency",
    severity: "SEV-2",
    startMinute: 14 * 60 + 7,
    detectedMinute: 14 * 60 + 10,
    initialStatus: "triggered",
    detector: "Create Payout P95 > 2× baseline for 3 min, traffic stable",
    affectedEndpoints: ["create-payout"],
    affectedServices: ["payout-service", "payment-orchestration", "partner-rail-a"],
    primaryService: "payment-orchestration",
    supportingTraceIds: ["trace-payout-1042", "trace-payout-1066", "trace-payout-1031", "trace-payout-1057"],
    primaryTraceId: PRIMARY_TRACE_ID,
    primarySpanId: PRIMARY_SPAN_ID,
    timelineEventIds: TIMELINE_EVENTS.map((e) => e.id),
    summary:
      "Payment Orchestration is the leading candidate for the latency degradation because its observed latency increased during the incident window and the related trace contains a slow orchestration span. Further investigation is required to establish the underlying cause.",
    evidence: [
      {
        id: "ev-traffic-stable",
        kind: "observed",
        statement: `API traffic is stable: ${formatMetric("total.rpm", 864)} requests/min against a baseline of ${formatBaseline("total.rpm", 864)}, inside the normal band.`,
        sources: [{ label: "Service Health · request volume", ref: { view: "health" } }],
      },
      {
        id: "ev-gateway-up",
        kind: "observed",
        statement: `Gateway availability remains ${formatMetric("gateway.availability", 864)}. Requests are reaching services.`,
        sources: [{ label: "Service Health · availability", ref: { view: "health" } }],
      },
      {
        id: "ev-cp-latency",
        kind: "observed",
        statement: `Create Payout P95 rose from ${formatBaseline("create-payout.p95", 846)} to ${formatMetric("create-payout.p95", 864)} starting 14:07.`,
        sources: [{ label: "Service Health · Create Payout", ref: { view: "health", id: "create-payout" } }],
      },
      {
        id: "ev-orch-first",
        kind: "observed",
        statement: `Payment Orchestration P95 left its baseline band at 14:04, three minutes before Create Payout. Its self time P95 is now ${formatMetric("payment-orchestration.self", 864)} (baseline ${formatBaseline("payment-orchestration.self", 864)}).`,
        sources: [{ label: "Topology · Payment Orchestration", ref: { view: "topology", id: "payment-orchestration" } }],
      },
      {
        id: "ev-trace-span",
        kind: "observed",
        statement: `In ${PRIMARY_TRACE_ID}, the orchestration span takes ${primaryOrch.durationMs.toLocaleString("en-US")} of ${primary.durationMs.toLocaleString("en-US")} ms (${primaryShare}%). ${primarySelf.toLocaleString("en-US")} ms of that is self time, not partner calls.`,
        sources: [{ label: `${PRIMARY_TRACE_ID} · ${PRIMARY_SPAN_ID}`, ref: { view: "traces", id: PRIMARY_TRACE_ID, spanId: PRIMARY_SPAN_ID } }],
      },
      {
        id: "ev-pool-logs",
        kind: "observed",
        statement: `Orchestration logs report connection pool waits of ${Number(t1066.spans.find((s) => s.service === "payment-orchestration")!.attributes["pool.wait_ms"]).toLocaleString("en-US")} to ${Number(primaryOrch.attributes["pool.wait_ms"]).toLocaleString("en-US")} ms on pool partner-rail-a-http at 120/120 active connections.`,
        sources: [
          { label: `${PRIMARY_TRACE_ID} · logs`, ref: { view: "traces", id: PRIMARY_TRACE_ID, spanId: PRIMARY_SPAN_ID } },
          { label: "trace-payout-1066 · logs", ref: { view: "traces", id: "trace-payout-1066", spanId: "span-orchestration-03" } },
        ],
      },
      {
        id: "ev-partner-ok",
        kind: "observed",
        statement: `Partner Rail A round-trip P95 is ${formatMetric("partner-rail-a.p95", 864)} against a baseline of ${formatBaseline("partner-rail-a.p95", 864)}, inside its normal variation band.`,
        sources: [{ label: "Topology · External Payment Partner", ref: { view: "topology", id: "partner-rail-a" } }],
      },
      {
        id: "ev-inf-orch-accounts",
        kind: "inferred",
        statement: "Most of the added Create Payout latency is spent inside Payment Orchestration rather than in the partner call.",
        confidence: "moderate",
        supporting: ["Metric timing: orchestration rose first", `Trace self time: ${primarySelf.toLocaleString("en-US")} ms in orchestration`, "Partner P95 within band"],
        missing: ["Only 4 slow traces sampled. Needs a latency breakdown across all incident traces."],
        sources: [{ label: "Trace Explorer", ref: { view: "traces", id: PRIMARY_TRACE_ID, spanId: PRIMARY_SPAN_ID } }],
      },
      {
        id: "ev-inf-retries",
        kind: "inferred",
        statement: "Retry growth coincides with the latency rise. Whether retries are a cause or a consequence is not established.",
        confidence: "low",
        supporting: ["Retries rose from 14:05", "Retries hold pool connections while backing off (per retry design doc, unverified for v3.18.2)"],
        missing: ["Retry counts split by instance version", "Pool occupancy by request state"],
        sources: [{ label: "Incident timeline · retries", ref: { view: "incident", id: "evt-retries-up" } }],
      },
      {
        id: "hyp-pool-saturation",
        kind: "hypothesis",
        statement: "Rail B maintenance moved traffic to Rail A and saturated the orchestration Rail A connection pool.",
        supporting: [
          "Rail A volume rose from about 720 to 1,130 req/min at 14:00",
          "Pool at 120/120 with multi-second waits in logs",
          "Latency rise begins 4 minutes after the routing change",
        ],
        against: ["Pool was not saturated in maintenance windows last month (not verified in this dataset)"],
        missing: ["Pool occupancy metric before 14:00", "Configured pool size vs Rail A peak volume"],
        sources: [{ label: "Timeline · Rail B maintenance", ref: { view: "incident", id: "evt-rail-b-maintenance" } }],
      },
      {
        id: "hyp-canary",
        kind: "hypothesis",
        statement: "The v3.18.2 canary introduced a regression in retry or pool handling.",
        supporting: ["Deployed 6 minutes before the latency rise", "Change log mentions a retry policy refactor", `trace-payout-1031 and trace-payout-1057 ran on v3.18.2`],
        against: [`${PRIMARY_TRACE_ID} and trace-payout-1066 are slow on stable v3.18.1 instances`, "Canary serves only 25% of traffic"],
        missing: ["Orchestration latency split by version"],
        sources: [{ label: "Timeline · canary deploy", ref: { view: "incident", id: "evt-deploy-orch" } }],
      },
      {
        id: "hyp-partner",
        kind: "hypothesis",
        statement: "Partner Rail A is slow under the extra load, and our client-side metrics hide part of it.",
        supporting: ["503 retryable responses observed in traces", "Partner P95 rose about 12%"],
        against: ["Partner P95 remains inside normal variation", "Most added time is before the first partner call"],
        missing: ["Partner-side latency (requires partner status page or support ticket)"],
        sources: [{ label: "Topology · External Payment Partner", ref: { view: "topology", id: "partner-rail-a" } }],
      },
    ],
    nextSteps: [
      "Split Payment Orchestration latency by instance version (v3.18.1 vs v3.18.2) to rule the canary in or out.",
      "Chart partner-rail-a-http pool occupancy and acquisition wait from 13:45 onward.",
      "Compare current Rail A volume with the configured pool size and partner rate limits.",
      "Check whether retries hold pool connections during backoff.",
      "List the payouts pending beyond window and confirm reconciliation covers PENDING_UNKNOWN.",
    ],
  },
];

export const INCIDENT_BY_ID = Object.fromEntries(INCIDENTS.map((i) => [i.id, i])) as Record<string, Incident>;

/* ------------------------------------------------------------------ */
/* Payout lifecycle                                                     */
/* ------------------------------------------------------------------ */

export const PAYOUTS: PayoutLifecycleRecord[] = [
  {
    payoutId: "po_6b10_0987",
    corridor: "SGD→INR",
    rail: "Rail A",
    createdMinute: 13 * 60 + 48,
    traceId: "trace-payout-0987",
    currentState: "COMPLETED",
    events: [
      { minute: 13 * 60 + 48, second: 10, state: "CREATED" },
      { minute: 13 * 60 + 48, second: 10, state: "COMPLIANCE_CLEARED" },
      { minute: 13 * 60 + 48, second: 11, state: "SUBMITTED_TO_PARTNER" },
      { minute: 13 * 60 + 49, second: 40, state: "COMPLETED" },
    ],
  },
  {
    payoutId: "po_71c4_1031",
    corridor: "SGD→INR",
    rail: "Rail A",
    createdMinute: 14 * 60 + 9,
    traceId: "trace-payout-1031",
    currentState: "COMPLETED",
    events: [
      { minute: 14 * 60 + 9, second: 47, state: "CREATED" },
      { minute: 14 * 60 + 9, second: 47, state: "COMPLIANCE_CLEARED" },
      { minute: 14 * 60 + 9, second: 49, state: "SUBMITTED_TO_PARTNER" },
      { minute: 14 * 60 + 13, second: 20, state: "COMPLETED" },
    ],
  },
  {
    payoutId: "po_7f3a_1042",
    corridor: "SGD→INR",
    rail: "Rail A",
    createdMinute: 14 * 60 + 13,
    traceId: "trace-payout-1042",
    currentState: "PENDING_BEYOND_WINDOW",
    events: [
      { minute: 14 * 60 + 13, second: 22, state: "CREATED" },
      { minute: 14 * 60 + 13, second: 22, state: "COMPLIANCE_CLEARED" },
      { minute: 14 * 60 + 13, second: 25, state: "SUBMITTED_TO_PARTNER" },
      { minute: 14 * 60 + 18, second: 25, state: "PENDING_BEYOND_WINDOW" },
    ],
  },
  {
    payoutId: "po_80d2_1057",
    corridor: "SGD→IDR",
    rail: "Rail A",
    createdMinute: 14 * 60 + 16,
    traceId: "trace-payout-1057",
    currentState: "PENDING_UNKNOWN",
    events: [
      { minute: 14 * 60 + 16, second: 41, state: "CREATED" },
      { minute: 14 * 60 + 16, second: 41, state: "COMPLIANCE_CLEARED" },
      { minute: 14 * 60 + 16, second: 45, state: "PENDING_UNKNOWN" },
    ],
  },
  {
    payoutId: "po_88e9_1066",
    corridor: "SGD→VND",
    rail: "Rail A",
    createdMinute: 14 * 60 + 20,
    traceId: "trace-payout-1066",
    currentState: "SUBMITTED_TO_PARTNER",
    events: [
      { minute: 14 * 60 + 20, second: 18, state: "CREATED" },
      { minute: 14 * 60 + 20, second: 18, state: "COMPLIANCE_CLEARED" },
      { minute: 14 * 60 + 20, second: 20, state: "SUBMITTED_TO_PARTNER" },
    ],
  },
];

/* Lightweight sanity values used by docs and tests. */
export const STORY = {
  incidentStart: hhmm(INCIDENTS[0].startMinute),
  primaryShare,
  primarySelf,
  canaryTraceDuration: t1031.durationMs,
  currentPending: valueAt("payouts.pendingBeyondWindow", 864),
};
