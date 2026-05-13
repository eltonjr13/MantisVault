import { CheckCircle2, Clock3, Gauge, RadioTower } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Header } from "@/components/layout/Header";
import { TransferProgress } from "@/components/mantisvault/TransferProgress";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatCard } from "@/components/ui/StatCard";

export default function TransferPage() {
  return (
    <AppShell>
      <Header
        eyebrow="05 Transferência"
        title="Transferência em andamento"
        description="Progresso real por etapa, com otimização, deduplicação, criptografia e envio local."
      />

      <div className="page-grid">
        <TransferProgress />

        <aside className="stack-md">
          <div className="grid-2">
            <StatCard icon={<RadioTower size={19} />} label="Velocidade" value="42,8 MB/s" />
            <StatCard icon={<Clock3 size={19} />} label="Tempo restante" value="01:24" />
            <StatCard icon={<Gauge size={19} />} label="Chunks enviados" value="1.248" detail="de 2.896" />
            <StatCard icon={<CheckCircle2 size={19} />} label="Etapas concluídas" value="2/4" />
          </div>

          <Card padding="md">
            <SectionTitle title="Status visual" description="Estados claros para cada etapa do pipeline." />
            <div className="detail-list">
              <div className="detail-item">
                <span>Concluído</span>
                <strong>Otimização e deduplicação</strong>
              </div>
              <div className="detail-item">
                <span>Em andamento</span>
                <strong>Criptografia aplicada</strong>
              </div>
              <div className="detail-item">
                <span>Aguardando</span>
                <strong>Envio final para o cofre local</strong>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
