import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { InvestigationProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "Nium API Observability",
  description: "Payment Infrastructure Intelligence. Portfolio concept with simulated telemetry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 text-text-primary">
        <InvestigationProvider>
          <AppShell>{children}</AppShell>
        </InvestigationProvider>
      </body>
    </html>
  );
}
