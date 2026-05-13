import { Fingerprint, KeyRound, LockKeyhole, Monitor, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { trustedDevices } from "@/data/mockDevices";

const securityRows = [
  { label: "Algoritmo de criptografia", value: "AES-256-GCM", icon: LockKeyhole },
  { label: "Chaves locais", value: "Geradas e armazenadas localmente", icon: KeyRound },
  { label: "Bloqueio por biometria", value: "Ativo", icon: Fingerprint },
  { label: "Senha de acesso", value: "Configurada", icon: ShieldCheck }
];

export function SecurityPanel() {
  return (
    <Card padding="lg">
      <div className="split-row">
        <div>
          <span className="section-kicker">Segurança do cofre</span>
          <h2>Controle total no dispositivo</h2>
        </div>
        <StatusPill label="Somente local" variant="local" />
      </div>

      <div className="security-panel">
        {securityRows.map((row) => {
          const Icon = row.icon;

          return (
            <div className="security-row" key={row.label}>
              <div className="activity-main">
                <span className="stat-icon">
                  <Icon size={18} />
                </span>
                <div>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              </div>
              <span className="toggle" aria-label={`${row.label} ativo`} />
            </div>
          );
        })}
      </div>

      <div className="stack-md">
        <h2>Dispositivos confiáveis</h2>
        <div className="device-list">
          {trustedDevices.map((device) => {
            const Icon = device.type === "desktop" ? Monitor : Smartphone;

            return (
              <article className="device-item" key={device.id}>
                <div className="device-main">
                  <span className="stat-icon">
                    <Icon size={18} />
                  </span>
                  <span>
                    <strong>{device.name}</strong>
                    <span>
                      {device.ip} • {device.lastSeen}
                    </span>
                  </span>
                </div>
                <StatusPill label={device.status} variant="connected" />
              </article>
            );
          })}
        </div>
      </div>

      <div className="notice">
        <ShieldCheck size={20} />
        <span>Seus dados não são enviados para a nuvem. Você mantém o controle total.</span>
      </div>

      <Button href="/connect" variant="secondary">
        Gerenciar dispositivos
      </Button>
    </Card>
  );
}
