import type { ReactNode } from "react";

interface SectionTitleProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function SectionTitle({ eyebrow, title, description, action }: SectionTitleProps) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <span className="section-kicker">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
