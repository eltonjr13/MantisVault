import { BarChart3, Database, FileStack, FolderOpen, HardDrive, UploadCloud } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Header } from "@/components/layout/Header";
import { QuickActions } from "@/components/mantisvault/QuickActions";
import { RecentActivity } from "@/components/mantisvault/RecentActivity";
import { StorageOverview } from "@/components/mantisvault/StorageOverview";
import { VaultHealth } from "@/components/mantisvault/VaultHealth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatCard } from "@/components/ui/StatCard";
import { vaultStats } from "@/data/mockStats";

export default function DashboardPage() {
  return (
    <AppShell>
      <Header
        eyebrow="03 Dashboard"
        title="Cofre local"
        description="Estado geral do cofre, armazenamento, atividade e ações rápidas."
        actions={
          <Button href="/upload" size="md">
            <UploadCloud size={17} />
            Enviar arquivos
          </Button>
        }
      />

      <div className="page-grid">
        <div className="stack-md">
          <StorageOverview />

          <Card padding="md">
            <SectionTitle title="Ações rápidas" description="Atalhos para os fluxos principais." />
            <QuickActions />
          </Card>

          <Card padding="md">
            <SectionTitle title="Atividade recente" description="Eventos locais do cofre." action={<a className="small-text" href="/files">Ver todas</a>} />
            <RecentActivity />
          </Card>
        </div>

        <aside className="stack-md">
          <div className="grid-2">
            <StatCard icon={<FileStack size={19} />} label="Arquivos" value={vaultStats.files} />
            <StatCard icon={<FolderOpen size={19} />} label="Pastas" value={vaultStats.folders} />
            <StatCard icon={<HardDrive size={19} />} label="Espaço livre" value={vaultStats.freeSpace} />
            <StatCard icon={<Database size={19} />} label="Economia total" value={vaultStats.savedSpace} />
          </div>

          <VaultHealth />

          <Card padding="md">
            <SectionTitle title="Motor lossless" description="Dados analisados localmente antes da criptografia." />
            <div className="detail-list">
              <div className="detail-item">
                <span>Modo</span>
                <strong>Otimização sem perda</strong>
              </div>
              <div className="detail-item">
                <span>Deduplicação média</span>
                <strong>{vaultStats.dedupeRate}</strong>
              </div>
              <div className="detail-item">
                <span>Relatórios</span>
                <strong><BarChart3 size={15} /> Disponíveis em analytics</strong>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
