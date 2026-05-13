import type { ReactNode } from "react";
import { Bell, ShieldCheck } from "lucide-react";
import { StatusPill } from "@/components/ui/StatusPill";

interface HeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}

export function Header({ eyebrow, title, description, actions }: HeaderProps) {
  return (
    <header className="header">
      <div>
        <span className="header-kicker">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="header-actions">
        {actions}
        <StatusPill label="Privacidade garantida" variant="verified" />
        <button className="icon-button" type="button" aria-label="Notificações">
          <Bell size={18} />
        </button>
        <button className="icon-button" type="button" aria-label="Status de segurança">
          <ShieldCheck size={18} />
        </button>
      </div>
    </header>
  );
}
