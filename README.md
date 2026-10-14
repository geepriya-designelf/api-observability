# Nium API Observability

**Payment Infrastructure Intelligence** · Portfolio concept · Simulated telemetry

An interactive UX prototype that explores how an engineer moves from "something looks off" to an evidence backed hypothesis across a distributed payment API ecosystem. It is a design concept built on local, deterministic, synthetic data. It is not a Nium production system, and nothing here represents real Nium metrics, customers or research.

---

## The problem

Payment engineering teams usually have plenty of telemetry: API metrics, service dashboards, logs, distributed traces, and payout records. The hard part is that each lives in its own tool. During a degradation, an engineer stitches the story together by hand, copying a timestamp from one tab into another and losing context every time they switch.

The degradations that hurt most are also the quiet ones. An API can look healthy at the gateway while a downstream dependency adds seconds of latency and payouts sit pending past their processing window.

**Design challenge:** help engineers understand end to end payment health, investigate dependencies, correlate telemetry, and reach an evidence backed hypothesis without losing context along the way.

**Product principle:** move the engineer from an anomaly to an understanding of system behavior through one connected investigation workflow.

This is deliberately not a Grafana or Datadog replacement. It shows how existing telemetry could be organized into a domain specific investigation experience for payments.

## Intended user

A backend or platform engineer on call for payment APIs (payouts, FX, wallets) who:

- is paged for a latency or error alert and needs to orient within minutes,
- knows the system broadly but not every service in depth,
- needs to explain their reasoning to teammates and incident commanders, not just find a number.

Secondary audience: incident commanders who need the current state, the leading hypothesis and what is still unknown.

## The four views

| View | Question it answers | Key interactions |
| --- | --- | --- |
| **1. Service Health** | Which APIs and services need attention, and is this abnormal or normal variation? | KPI tiles with 7 day baselines, four charts with normal variation bands, drag to set an investigation window, selectable API and service table |
| **2. Dependency Topology** | How do services depend on each other, and which dependency might be involved? | Select a node to highlight upstream and downstream, "why it is flagged" panel, recent events, related traces, incident emphasis toggle |
| **3. Trace Explorer** | Where did one request spend its time? | Search and filter traces, waterfall with self time, healthy baseline overlay, span detail with attributes, logs and errors |
| **4. Incident Correlation** | What happened, in what order, and what do we actually know? | Shared time axis across changes, signals, health and payout events, event detail, evidence classified as observed, inferred or unverified, status workflow, notes |

## The connected investigation workflow

The views share one investigation state (incident, time range, investigation window, endpoint, service, trace, span, timeline event, pinned evidence). It is held in a single React context and shown in the **Context bar** under the header, so the engineer always sees what they are looking at and can jump back to any part of it.

The default state opens straight into the primary incident: **"Elevated Create Payout Latency" (`inc-payout-latency-001`, SEV-2)**, at a simulated 14:24 UTC, 17 minutes in.

### Demo journey (about 4 minutes)

The sidebar's **Investigation walkthrough** tracks these five steps and can jump to any of them.

1. **Detect** (Service Health). The banner says it plainly: Create Payout P95 is about 4.5× baseline while request volume and gateway availability sit inside their normal bands. Point out that availability looks fine. That is the trap this design is built to avoid.
2. **Investigate dependencies** (Topology). Click *Trace Create Payout dependencies*. The request path is shown and unrelated services fade. Payout Service shows **Elevated (downstream)**: slow only because it waits on something. **Payment Orchestration** is **Degraded** by its own self time. Select it to see why it is flagged, its telemetry against baseline, and its recent events.
3. **Inspect a trace** (Trace Explorer). Click *Open related trace*. `trace-payout-1042` opens with `span-orchestration-03` selected. The orchestration span covers 92% of the request, 1,918 ms of it self time. Turn on the healthy baseline overlay to compare against `trace-payout-0987`. The logs show a 1,840 ms wait for a connection from a pool at 120/120. The callout says it out loud: this shows where time went, not why.
4. **Correlate** (Incident Correlation). Click *Open inc-payout-latency-001*. Select events on the shared timeline. The sequence reads: canary deploy (13:58), Rail B maintenance shifts traffic to Rail A (14:00), orchestration latency leaves its band (14:04), retries climb (14:06), Create Payout breaches (14:07), payouts pass their window (14:12). Partner Rail A latency stays within its band.
5. **Form a hypothesis**. The Hypothesis tab gives the summary, the evidence it rests on (each line links to its source view), three competing explanations with supporting, against and missing data, and next diagnostic steps. Acknowledge the incident, add a note, and show the status confirmations.

Along the way, show that context travels: a window dragged on a Health chart filters the trace list and shades the incident timeline; a service selected in Topology filters traces; Pin collects evidence from any view into the incident.

## Design decisions

- **Baselines everywhere, scores nowhere.** Every value is shown against a 7 day, same hour baseline and a normal variation band. There is no composite health score. Status is a visible rule, and every badge lists the exact reasons it was assigned.
- **Don't blame the messenger.** Services whose own self time is normal are marked *Elevated (downstream)* rather than *Degraded*, even when their end to end latency and errors are high. This steers attention toward the service where time is actually being spent.
- **Planned is not broken.** Partner Rail B is unavailable during a declared maintenance window. It is styled as *Unavailable (planned)*, sorted after real problems and excluded from the attention count, while still appearing on the timeline because the traffic shift it caused matters.
- **Facts, inferences and hypotheses look different.** The evidence panel separates *Observed* (measured, linked to source), *Inferred* (drawn from several observations, with confidence and missing data) and *Unverified* (candidate explanations with supporting and contradicting evidence). The summary is labelled *Not confirmed*.
- **Time order is not causation.** The timeline lines events up without arrows between them. Copy under the timeline and topology repeats that a connection or a coincidence is not a cause.
- **Self time over duration.** The trace explorer ranks spans by self time, so the root span never "wins" by default, and explains the term inline.
- **Progressive disclosure.** Overview first (banner, KPIs, table), then a selected service, then a trace, then a span's logs. Status rules, metric definitions and evidence details sit behind tooltips, expanders and tabs.
- **Context is a first class object.** The context bar, the walkthrough, and pinning all make the investigation state visible and portable between views.
- **Honest about blind spots.** External partner spans show a clear empty state: partner side logs are not available, only client side timing.

### Visual system

Dark navy surfaces with indigo and cyan accents; red, amber, orange and green reserved strictly for state and always paired with an icon and a label. Chart series colors (`#5B7BF0`, `#1AA3B8`) were validated for lightness, chroma, colorblind separation and contrast against the dark surface. Charts use a single y axis, thin lines, dashed baselines and shaded normal bands.

### Accessibility

Keyboard reachable controls throughout, including SVG topology nodes and timeline events (Tab, Enter, Escape). Visible focus rings, ARIA labels on charts and graph nodes, radiogroups and switches with correct roles, a tablist with arrow key support, a focus trapped confirmation dialog, polite live regions for toasts and the clock, an event log that mirrors the timeline as a list, a skip link, and reduced motion support.

## Mock data model

All data is generated locally and deterministically in `src/data/`:

- `types.ts` defines the shared model: services, dependency edges, endpoints, metric definitions, traces and spans, logs, timeline events, incidents with classified evidence, and payout lifecycle records.
- `metrics.ts` is a small metric engine. Each metric has a baseline, diurnal swing, seeded noise, a normal band and optional incident shapes (onset, ramp, delta, growth). Every chart, table cell, KPI, topology node and timeline description samples the same `valueAt(metric, minute)` function, so all views tell the same story at any simulated minute.
- `mock.ts` defines services, edges, endpoints, traces (built from parameters so durations, self time and percentages are computed rather than typed), the timeline, the incident and payouts. Evidence statements are generated from the same data, so the numbers in the summary always match the charts and traces.
- `health.ts` applies the status rules and produces human readable reasons.

Stable IDs connect everything, for example `payment-orchestration`, `inc-payout-latency-001`, `trace-payout-1042`, `span-orchestration-03`.

### Simulation controls

- **Live simulation** advances one simulated minute every 4 seconds from 14:24 to 14:45, then holds. Pause and resume are in the header.
- **Time range**: last 15 minutes, last hour (default), last 24 hours (15 minute buckets).
- **Reset demo** (with confirmation) returns to 14:24 and clears all selections, notes, pins and status changes, so the walkthrough is repeatable.

## Running it

Requires Node 18.18 or newer.

```bash
npm install
npm run dev          # http://localhost:3000 (opens Service Health)
```

Other scripts:

```bash
npm run build          # production build
npm run start          # serve the production build
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm run build:preview  # dist/nium-api-observability.html, the whole app in one file
```

`build:preview` bundles the same components with hash based routing into a single HTML file that opens without a server, which is handy for sharing a link or presenting offline.

Stack: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Recharts, Lucide icons. No backend, credentials or external services.

## Validation plan (proposed, not yet run)

No user research or usability testing has been done for this concept. These are hypotheses and proposed criteria for validating it.

**Research questions**

- Do on call engineers trust a status that explains itself more than a single health score?
- Does separating observed, inferred and unverified evidence change how confidently people state a cause during an incident?
- Does a shared context bar reduce the time spent re-finding the same service, trace and time window across views?

**Proposed success measures**

- Time from alert to naming the service where time is spent, compared with the team's current tool chain (task based study with seeded incidents).
- Rate of premature root cause claims (stating a cause before evidence supports it).
- Number of tool or tab switches during an investigation.
- Qualitative confidence and clarity ratings from incident retrospectives.

## Limitations

- All telemetry is synthetic and the scenario is scripted. One incident is modeled in depth.
- Topology is a simplified payout flow with eight services; real systems need grouping, search and layout at much larger scale.
- Baselines and anomaly rules are simple illustrations, not a detection model.
- Traces are a small hand-shaped sample, not a sampled population; latency breakdowns across many traces are not implemented.
- State lives in memory for one browser session. There is no collaboration, persistence, auth or real alerting.
- Layout is designed for laptop and desktop investigation; phone width works for review but is not optimized for it.
