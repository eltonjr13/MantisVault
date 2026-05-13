import { Activity, BarChart3, CheckCircle2, Database, FileStack, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Header } from "@/components/layout/Header";
import { RecentActivity } from "@/components/mantisvault/RecentActivity";
import { VaultHealth } from "@/components/mantisvault/VaultHealth";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatCard } from "@/components/ui/StatCard";
import { analyticsBars, vaultStats } from "@/data/mockStats";

export default function AnalyticsPage() {
  return (
    <AppShell>
      <Header
        eyebrow="09 Analytics / Insights"
        title="Insights do cofre"
        description="Economia, deduplicação, uso e atividade recente analisados localmente."
      />

      <div className="page-stack">
        <div className="grid-4">
          <StatCard icon={<Database size={19} />} label="Espaço economizado" value={vaultStats.savedSpace} detail="42% do total" />
          <StatCard icon={<BarChart3 size={19} />} label="Deduplicação" value={vaultStats.dedupeRate} detail="Taxa média" />
          <StatCard icon={<FileStack size={19} />} label="Arquivos otimizados" value={vaultStats.optimizedFiles} detail="98% do total" />
          <StatCard icon={<CheckCircle2 size={19} />} label="Transferências" value={vaultStats.completedTransfers} detail="Com sucesso" />
        </div>

        <div className="page-grid">
          <Card padding="md">
            <SectionTitle title="Uso de armazenamento" description="Distribuição por tipo de arquivo." />
            <div className="analytics-storage">
              <div className="donut">
                <div className="donut-inner">
                  <strong>{vaultStats.storageUsed}</strong>
                  <span className="small-text">utilizado</span>
                </div>
              </div>
              <div className="detail-list">
                <div className="detail-item">
                  <span>Documentos</span>
                  <strong>420 GB (29%)</strong>
                </div>
                <div className="detail-item">
                  <span>Mídia</span>
                  <strong>512 GB (36%)</strong>
                </div>
                <div className="detail-item">
                  <span>Arquivos</span>
                  <strong>310 GB (22%)</strong>
                </div>
                <div className="detail-item">
                  <span>Outros</span>
                  <strong>178 GB (13%)</strong>
                </div>
              </div>
            </div>
          </Card>

          <Card padding="md">
            <SectionTitle title="Economia de espaço" description="Últimos 30 dias." />
            <div className="chart-bars" aria-label="Gráfico de economia">
              {analyticsBars.map((height, index) => (
                <span className="chart-bar" style={{ height: `${height}%` }} key={`${height}-${index}`} />
              ))}
            </div>
          </Card>
        </div>

        <div className="page-grid equal">
          <VaultHealth />

          <Card padding="md">
            <SectionTitle title="Atividade recente" description="Dados analisados localmente. Privacidade garantida." action={<Activity size={18} />} />
            <RecentActivity />
          </Card>
        </div>

        <Card padding="sm">
          <div className="meta-row">
            <span><ShieldCheck size={14} /> Dados analisados localmente.</span>
            <span>Privacidade garantida.</span>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
