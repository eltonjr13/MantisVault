import { ArrowRight, Laptop, Smartphone, Wifi } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Header } from "@/components/layout/Header";
import { PairingQRCode } from "@/components/mantisvault/PairingQRCode";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";

export default function ConnectPage() {
  return (
    <AppShell>
      <Header
        eyebrow="02 Conectar dispositivos"
        title="Conecte ao seu dispositivo local"
        description="Emparelhe seu celular com o MantisVault Desktop pela rede local."
      />

      <div className="page-grid equal">
        <PairingQRCode />

        <Card padding="lg">
          <SectionTitle title="Celular para PC" description="O envio acontece dentro da sua rede local, com canal seguro e confirmação visual." />

          <div className="device-illustration">
            <div className="phone-mock" aria-label="Celular conectado" />
            <div className="connection-line" />
            <div className="desktop-mock" aria-label="PC local" />
          </div>

          <div className="network-grid">
            <div className="network-item">
              <span><Wifi size={14} /> Rede</span>
              <strong>Local detectada</strong>
            </div>
            <div className="network-item">
              <span><Smartphone size={14} /> Celular</span>
              <strong>Aguardando leitura</strong>
            </div>
            <div className="network-item">
              <span><Laptop size={14} /> Desktop</span>
              <strong>192.168.1.42</strong>
            </div>
          </div>

          <div className="notice">
            <Wifi size={20} />
            <span>Os dispositivos precisam estar na mesma rede local.</span>
          </div>

          <Button href="/dashboard" size="lg">
            Ir para dashboard
            <ArrowRight size={18} />
          </Button>
        </Card>
      </div>
    </AppShell>
  );
}
