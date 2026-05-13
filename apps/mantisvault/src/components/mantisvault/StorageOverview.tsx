import { Database, FolderOpen, HardDrive, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { vaultStats } from "@/data/mockStats";

export function StorageOverview() {
  return (
    <Card padding="lg">
      <div className="storage-meter">
        <div className="storage-hero">
          <div className="stack-md">
            <span className="section-kicker">
              <ShieldCheck size={15} />
              Cofre local
            </span>
            <div>
              <span className="small-text">Armazenamento utilizado</span>
              <p className="storage-value">
                {vaultStats.storageUsed} <span>/ {vaultStats.storageTotal}</span>
              </p>
            </div>
            <Progress value={vaultStats.storagePercent} meta={`${vaultStats.storagePercent}%`} />
          </div>

          <div className="health-ring">
            <div className="health-ring-inner">
              <ShieldCheck size={26} />
              <strong>{vaultStats.health}</strong>
              <span>Tudo protegido</span>
            </div>
          </div>
        </div>

        <div className="grid-3">
          <div className="network-item">
            <span>
              <HardDrive size={14} /> Livres
            </span>
            <strong>{vaultStats.freeSpace}</strong>
          </div>
          <div className="network-item">
            <span>
              <Database size={14} /> Arquivos
            </span>
            <strong>{vaultStats.files}</strong>
          </div>
          <div className="network-item">
            <span>
              <FolderOpen size={14} /> Pastas
            </span>
            <strong>{vaultStats.folders}</strong>
          </div>
        </div>
      </div>
    </Card>
  );
}
