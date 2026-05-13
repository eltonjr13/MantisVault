import { Activity, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";

export function VaultHealth() {
  return (
    <Card padding="md" hoverable>
      <div className="vault-health">
        <ShieldCheck size={44} />
        <div>
          <span className="section-kicker">Saúde do cofre</span>
          <h2>Ótima</h2>
          <p className="muted">Tudo funcionando perfeitamente.</p>
        </div>
        <StatusPill label="Integridade verificada" variant="verified" />
        <div className="mini-chart">
          <span style={{ height: "32%" }} />
          <span style={{ height: "52%" }} />
          <span style={{ height: "41%" }} />
          <span style={{ height: "72%" }} />
          <span style={{ height: "64%" }} />
          <span style={{ height: "88%" }} />
        </div>
        <div className="small-text">
          <Activity size={14} /> Última verificação: hoje, 10:31
        </div>
      </div>
    </Card>
  );
}
