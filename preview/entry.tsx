import { createRoot } from "react-dom/client";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { HealthView } from "@/components/views/HealthView";
import { IncidentView } from "@/components/views/IncidentView";
import { TopologyView } from "@/components/views/TopologyView";
import { TraceView } from "@/components/views/TraceView";
import { InvestigationProvider } from "@/lib/store";

function Routes() {
  const path = usePathname();
  if (path.startsWith("/topology")) return <TopologyView />;
  if (path.startsWith("/traces")) return <TraceView />;
  if (path.startsWith("/incident")) return <IncidentView />;
  return <HealthView />;
}

createRoot(document.getElementById("root")!).render(
  <InvestigationProvider>
    <AppShell>
      <Routes />
    </AppShell>
  </InvestigationProvider>,
);
