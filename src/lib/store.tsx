"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { DEFAULT_CLOCK, LIVE_TICK_MS, MAX_CLOCK, hhmm, type TimeRangeId } from "@/data/metrics";
import { INCIDENT_BY_ID, INCIDENT_ID } from "@/data/mock";
import type { EndpointId, IncidentStatus, ServiceId } from "@/data/types";

export type ViewId = "health" | "topology" | "traces" | "incident";

export const VIEW_PATHS: Record<ViewId, string> = {
  health: "/health",
  topology: "/topology",
  traces: "/traces",
  incident: "/incident",
};

export type JourneyStep = "detect" | "dependencies" | "trace" | "correlate" | "hypothesis";

export const JOURNEY: { id: JourneyStep; title: string; hint: string; view: ViewId }[] = [
  { id: "detect", title: "Detect", hint: "Spot Create Payout P95 rising while traffic and availability hold steady.", view: "health" },
  { id: "dependencies", title: "Investigate dependencies", hint: "Open Create Payout in the topology and select Payment Orchestration.", view: "topology" },
  { id: "trace", title: "Inspect a trace", hint: "Open a slow payout trace and inspect the orchestration span and its logs.", view: "traces" },
  { id: "correlate", title: "Correlate the incident", hint: "Select events on the shared timeline and compare the sequence.", view: "incident" },
  { id: "hypothesis", title: "Form a hypothesis", hint: "Review the investigation summary, evidence and next steps.", view: "incident" },
];

export interface Note {
  id: string;
  minute: number;
  author: string;
  text: string;
}

export interface ActivityItem {
  id: string;
  minute: number;
  text: string;
}

export interface PinnedEvidence {
  id: string;
  label: string;
  detail: string;
  view: ViewId;
  ref: { serviceId?: ServiceId; traceId?: string; spanId?: string; eventId?: string };
}

export interface Toast {
  id: number;
  tone: "success" | "info" | "warning";
  text: string;
}

export interface InvestigationState {
  clock: number;
  live: boolean;
  paused: boolean;
  timeRange: TimeRangeId;
  loading: boolean;
  incidentId: string;
  incidentStatus: IncidentStatus;
  acknowledgedAt: number | null;
  notes: Note[];
  activity: ActivityItem[];
  serviceId: ServiceId | null;
  endpointId: EndpointId | null;
  traceId: string | null;
  spanId: string | null;
  eventId: string | null;
  window: { from: number; to: number } | null;
  pinned: PinnedEvidence[];
  journey: Record<JourneyStep, boolean>;
  checkedSteps: number[];
  toasts: Toast[];
}

const initialJourney: Record<JourneyStep, boolean> = { detect: false, dependencies: false, trace: false, correlate: false, hypothesis: false };

function initialState(): InvestigationState {
  const inc = INCIDENT_BY_ID[INCIDENT_ID];
  return {
    clock: DEFAULT_CLOCK,
    live: false,
    paused: false,
    timeRange: "1h",
    loading: false,
    incidentId: INCIDENT_ID,
    incidentStatus: inc.initialStatus,
    acknowledgedAt: null,
    notes: [],
    activity: [
      { id: "act-open", minute: inc.detectedMinute, text: `Incident opened by alerting: ${inc.detector}` },
      { id: "act-page", minute: inc.detectedMinute, text: "On-call engineer paged (Payments primary)" },
    ],
    serviceId: null,
    endpointId: "create-payout",
    traceId: null,
    spanId: null,
    eventId: null,
    window: null,
    pinned: [],
    journey: initialJourney,
    checkedSteps: [],
    toasts: [],
  };
}

type Action =
  | { type: "tick" }
  | { type: "setLive"; live: boolean }
  | { type: "setPaused"; paused: boolean }
  | { type: "setRange"; range: TimeRangeId }
  | { type: "setLoading"; loading: boolean }
  | { type: "reset" }
  | { type: "patch"; patch: Partial<Pick<InvestigationState, "serviceId" | "endpointId" | "traceId" | "spanId" | "eventId" | "window">> }
  | { type: "setStatus"; status: IncidentStatus; by: string }
  | { type: "addNote"; text: string }
  | { type: "pin"; item: PinnedEvidence }
  | { type: "unpin"; id: string }
  | { type: "journey"; step: JourneyStep }
  | { type: "toggleStep"; index: number }
  | { type: "toast"; toast: Toast }
  | { type: "dismissToast"; id: number };

const STATUS_LABEL: Record<IncidentStatus, string> = {
  triggered: "Triggered",
  acknowledged: "Acknowledged",
  investigating: "Investigating",
  mitigated: "Mitigated",
  resolved: "Resolved",
};

export function statusLabel(s: IncidentStatus) {
  return STATUS_LABEL[s];
}

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

function reducer(state: InvestigationState, action: Action): InvestigationState {
  switch (action.type) {
    case "tick":
      if (state.clock >= MAX_CLOCK) return { ...state, paused: true };
      return { ...state, clock: state.clock + 1 };
    case "setLive":
      return { ...state, live: action.live, paused: false };
    case "setPaused":
      return { ...state, paused: action.paused };
    case "setRange":
      return { ...state, timeRange: action.range, loading: true };
    case "setLoading":
      return { ...state, loading: action.loading };
    case "reset":
      return { ...initialState(), toasts: state.toasts };
    case "patch":
      return { ...state, ...action.patch };
    case "setStatus": {
      if (state.incidentStatus === action.status) return state;
      return {
        ...state,
        incidentStatus: action.status,
        acknowledgedAt: action.status === "acknowledged" && state.acknowledgedAt === null ? state.clock : state.acknowledgedAt,
        activity: [
          ...state.activity,
          { id: uid("act"), minute: state.clock, text: `Status changed to ${STATUS_LABEL[action.status]} by ${action.by}` },
        ],
      };
    }
    case "addNote":
      return {
        ...state,
        notes: [...state.notes, { id: uid("note"), minute: state.clock, author: "You", text: action.text }],
        activity: [...state.activity, { id: uid("act"), minute: state.clock, text: "Investigation note added by You" }],
      };
    case "pin":
      if (state.pinned.some((p) => p.id === action.item.id)) return state;
      return { ...state, pinned: [...state.pinned, action.item] };
    case "unpin":
      return { ...state, pinned: state.pinned.filter((p) => p.id !== action.id) };
    case "journey":
      if (state.journey[action.step]) return state;
      return { ...state, journey: { ...state.journey, [action.step]: true } };
    case "toggleStep":
      return {
        ...state,
        checkedSteps: state.checkedSteps.includes(action.index)
          ? state.checkedSteps.filter((i) => i !== action.index)
          : [...state.checkedSteps, action.index],
      };
    case "toast":
      return { ...state, toasts: [...state.toasts.slice(-2), action.toast] };
    case "dismissToast":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
  }
}

interface NavigateOptions {
  serviceId?: ServiceId | null;
  endpointId?: EndpointId | null;
  traceId?: string | null;
  spanId?: string | null;
  eventId?: string | null;
  window?: { from: number; to: number } | null;
}

interface Ctx {
  state: InvestigationState;
  view: ViewId;
  go: (view: ViewId, opts?: NavigateOptions) => void;
  patch: (opts: NavigateOptions) => void;
  setLive: (live: boolean) => void;
  setPaused: (paused: boolean) => void;
  setRange: (r: TimeRangeId) => void;
  reset: () => void;
  setStatus: (s: IncidentStatus) => void;
  addNote: (text: string) => void;
  pin: (item: PinnedEvidence) => void;
  unpin: (id: string) => void;
  markJourney: (step: JourneyStep) => void;
  toggleStep: (i: number) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
}

const InvestigationContext = createContext<Ctx | null>(null);

export function InvestigationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const router = useRouter();
  const pathname = usePathname();
  const view: ViewId = (Object.entries(VIEW_PATHS).find(([, p]) => pathname?.startsWith(p))?.[0] as ViewId) ?? "health";
  const toastSeq = useRef(0);

  // Live simulation: advance one simulated minute per tick.
  useEffect(() => {
    if (!state.live || state.paused) return;
    const id = window.setInterval(() => dispatch({ type: "tick" }), LIVE_TICK_MS);
    return () => window.clearInterval(id);
  }, [state.live, state.paused]);

  // Brief, honest loading state when the time range changes.
  useEffect(() => {
    if (!state.loading) return;
    const id = window.setTimeout(() => dispatch({ type: "setLoading", loading: false }), 420);
    return () => window.clearTimeout(id);
  }, [state.loading, state.timeRange]);

  const toast = useCallback((text: string, tone: Toast["tone"] = "success") => {
    const id = ++toastSeq.current;
    dispatch({ type: "toast", toast: { id, text, tone } });
    window.setTimeout(() => dispatch({ type: "dismissToast", id }), 4200);
  }, []);

  const patch = useCallback((opts: NavigateOptions) => {
    const p: NavigateOptions = {};
    for (const k of Object.keys(opts) as (keyof NavigateOptions)[]) if (opts[k] !== undefined) (p as Record<string, unknown>)[k] = opts[k];
    dispatch({ type: "patch", patch: p });
  }, []);

  const go = useCallback(
    (v: ViewId, opts?: NavigateOptions) => {
      if (opts) patch(opts);
      router.push(VIEW_PATHS[v]);
    },
    [patch, router],
  );

  const value = useMemo<Ctx>(
    () => ({
      state,
      view,
      go,
      patch,
      setLive: (live) => {
        dispatch({ type: "setLive", live });
        toast(live ? "Live simulation on. One simulated minute every 4 seconds." : `Live simulation off. Holding at ${hhmm(state.clock)} UTC.`, "info");
      },
      setPaused: (paused) => dispatch({ type: "setPaused", paused }),
      setRange: (range) => dispatch({ type: "setRange", range }),
      reset: () => {
        dispatch({ type: "reset" });
        router.push(VIEW_PATHS.health);
        toast("Demo reset to 14:24 UTC. Investigation context cleared.", "info");
      },
      setStatus: (s) => {
        dispatch({ type: "setStatus", status: s, by: "You" });
        toast(`Incident status set to ${STATUS_LABEL[s]}.`);
      },
      addNote: (text) => {
        dispatch({ type: "addNote", text });
        toast("Note added to the incident.");
      },
      pin: (item) => {
        dispatch({ type: "pin", item });
        toast(`Pinned to investigation: ${item.label}`);
      },
      unpin: (id) => dispatch({ type: "unpin", id }),
      markJourney: (step) => dispatch({ type: "journey", step }),
      toggleStep: (index) => dispatch({ type: "toggleStep", index }),
      toast,
      dismissToast: (id) => dispatch({ type: "dismissToast", id }),
    }),
    [state, view, go, patch, toast, router],
  );

  return <InvestigationContext.Provider value={value}>{children}</InvestigationContext.Provider>;
}

export function useInvestigation() {
  const ctx = useContext(InvestigationContext);
  if (!ctx) throw new Error("useInvestigation must be used inside InvestigationProvider");
  return ctx;
}
