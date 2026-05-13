type ProgressVariant = "teal" | "coral" | "warning";

interface ProgressProps {
  value: number;
  label?: string;
  meta?: string;
  variant?: ProgressVariant;
}

export function Progress({ value, label, meta, variant = "teal" }: ProgressProps) {
  const safeValue = Math.min(100, Math.max(0, value));

  return (
    <div className={`progress progress-${variant}`}>
      {(label || meta) && (
        <div className="progress-head">
          <strong>{label}</strong>
          <span>{meta ?? `${safeValue}%`}</span>
        </div>
      )}
      <div className="progress-track" aria-label={label ?? "Progresso"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeValue} role="progressbar">
        <span className="progress-fill" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}
