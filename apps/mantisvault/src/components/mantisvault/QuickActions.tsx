import { BarChart3, FileUp, FolderPlus, Link2 } from "lucide-react";

const actions = [
  { href: "/upload", title: "Enviar arquivos", detail: "Seleção local segura", icon: FileUp },
  { href: "/files", title: "Nova pasta", detail: "Organizar cofre", icon: FolderPlus },
  { href: "/connect", title: "Conectar dispositivo", detail: "Rede local", icon: Link2 },
  { href: "/analytics", title: "Ver relatórios", detail: "Economia e uso", icon: BarChart3 }
];

export function QuickActions() {
  return (
    <div className="quick-actions">
      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <a className="quick-action" href={action.href} key={action.href}>
            <Icon size={22} />
            <strong>{action.title}</strong>
            <span>{action.detail}</span>
          </a>
        );
      })}
    </div>
  );
}
