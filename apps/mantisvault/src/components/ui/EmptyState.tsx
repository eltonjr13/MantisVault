import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div>
        <Inbox size={34} />
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}
