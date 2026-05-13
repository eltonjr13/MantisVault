import type { ReactNode } from "react";
import { BottomNav } from "@/components/layout/BottomNav";

interface MobileShellProps {
  children: ReactNode;
}

export function MobileShell({ children }: MobileShellProps) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
