import { CheckCircle2, LockKeyhole, ShieldCheck, Sparkles, Workflow } from "lucide-react";

type StatusPillVariant = "connected" | "encrypted" | "deduped" | "preserved" | "optimized" | "verified" | "local";

interface StatusPillProps {
  label: string;
  variant?: StatusPillVariant;
}

export function StatusPill({ label, variant = "connected" }: StatusPillProps) {
  const Icon = {
    connected: CheckCircle2,
    encrypted: LockKeyhole,
    deduped: Workflow,
    preserved: ShieldCheck,
    optimized: Sparkles,
    verified: CheckCircle2,
    local: ShieldCheck
  }[variant];

  return (
    <span className={`status-pill status-${variant}`}>
      <Icon size={14} />
      {label}
    </span>
  );
}
