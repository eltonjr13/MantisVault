import { Copy, Network, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";

const filledCells = new Set([0, 1, 2, 6, 7, 8, 9, 11, 15, 17, 18, 19, 20, 22, 24, 25, 26, 30, 31, 34, 36, 38, 40, 42, 43, 45, 47, 49, 50, 53, 54, 55, 56, 58, 60, 61, 62, 63, 65, 69, 71, 72, 73, 74, 78, 79, 80]);

export function PairingQRCode() {
  return (
    <Card padding="lg">
      <div className="qr-card">
        <span className="section-kicker">
          <Smartphone size={15} />
          Pareamento local
        </span>
        <div className="qr-mock" aria-label="QR Code visual para pareamento">
          {Array.from({ length: 81 }, (_, index) => (
            <span className={filledCells.has(index) ? "qr-cell" : "qr-cell empty"} key={index} />
          ))}
        </div>
        <div>
          <h2>Escaneie este QR Code</h2>
          <p className="muted">Conexão direta com o MantisVault Desktop.</p>
        </div>
        <div className="pair-code">
          7F6B-2D9M-4X1Q
          <Copy size={18} />
        </div>
        <StatusPill label="Conexão segura" variant="encrypted" />
        <Button href="/dashboard" size="lg">
          <ShieldCheck size={18} />
          Simular conexão
        </Button>
      </div>

      <div className="network-grid">
        <div className="network-item">
          <span>Rede local</span>
          <strong>Detectada</strong>
        </div>
        <div className="network-item">
          <span>IP local</span>
          <strong>192.168.1.42</strong>
        </div>
        <div className="network-item">
          <span>
            <Network size={14} /> Canal
          </span>
          <strong>Seguro</strong>
        </div>
      </div>
    </Card>
  );
}
