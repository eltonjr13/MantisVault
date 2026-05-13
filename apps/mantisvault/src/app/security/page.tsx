import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Header } from "@/components/layout/Header";
import { SecurityPanel } from "@/components/mantisvault/SecurityPanel";
import { VaultHealth } from "@/components/mantisvault/VaultHealth";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatCard } from "@/components/ui/StatCard";

export default function SecurityPage() {
  return (
    <AppShell>
      <Header
        eyebrow="08 Segurança"
        title="Segurança do cofre"
        description="Configurações locais para chaves, biometria, senha e dispositivos confiáveis."
      />

      <div className="page-grid">
        <SecurityPanel />

        <aside className="stack-md">
          <div className="grid-2">
            <StatCard icon={<ShieldCheck size={19} />} label="Status" value="Somente local" />
            <StatCard icon={<LockKeyhole size={19} />} label="Criptografia" value="AES-256" />
          </div>

          <VaultHealth />

          <Card padding="md">
            <SectionTitle title="Chaves locais" description="Nada é enviado para nuvem." />
            <div className="detail-list">
              <div className="detail-item">
                <span>Origem</span>
                <strong><KeyRound size={15} /> Geradas neste dispositivo</strong>
              </div>
              <div className="detail-item">
                <span>Controle</span>
                <strong>Você mantém o controle total</strong>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
