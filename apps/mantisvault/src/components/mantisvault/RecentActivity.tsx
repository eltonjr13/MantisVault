import { CheckCircle2, FileText, Link2, LockKeyhole } from "lucide-react";
import { FileIcon } from "@/components/ui/FileIcon";
import { Badge } from "@/components/ui/Badge";
import { recentActivity } from "@/data/mockActivity";

const statusIcon = {
  Criptografado: LockKeyhole,
  Conectado: Link2,
  Relatório: FileText,
  Otimizado: CheckCircle2
};

export function RecentActivity() {
  return (
    <div className="activity-list">
      {recentActivity.map((item) => {
        const Icon = statusIcon[item.status];

        return (
          <article className="activity-item" key={item.id}>
            <div className="activity-main">
              {item.status === "Criptografado" ? <FileIcon kind="pdf" /> : <span className="stat-icon"><Icon size={18} /></span>}
              <span>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </span>
            </div>
            <div className="activity-side">
              <Badge variant={item.status === "Criptografado" ? "info" : "success"}>{item.status}</Badge>
              <span className="small-text">{item.time}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
