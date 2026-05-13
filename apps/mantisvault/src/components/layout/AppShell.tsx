import type { ReactNode } from "react";
import { MobileShell } from "@/components/layout/MobileShell";
import { Sidebar } from "@/components/layout/Sidebar";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-layout">
      <Sidebar />
      <MobileShell>
        <main className="app-main">
          <div className="content-shell">{children}</div>
        </main>
      </MobileShell>
    </div>
  );
}
