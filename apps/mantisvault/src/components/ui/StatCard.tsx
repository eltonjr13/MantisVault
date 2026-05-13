import type { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
}

export function StatCard({ icon, label, value, detail }: StatCardProps) {
  return (
    <article className="stat-card">
      <span className="stat-icon">{icon}</span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
      {detail && <span>{detail}</span>}
    </article>
  );
}
