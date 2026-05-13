import { CheckCircle2, Copy, Laptop, Network, ShieldCheck, Smartphone, Wifi } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Header } from "@/components/layout/Header";
import { MantisMascot } from "@/components/mantisvault/MantisMark";

const qrMatrixSize = 17;

function isFinderCell(row: number, col: number, startRow: number, startCol: number) {
  const localRow = row - startRow;
  const localCol = col - startCol;

  if (localRow < 0 || localRow > 4 || localCol < 0 || localCol > 4) {
    return undefined;
  }

  return localRow === 0 || localRow === 4 || localCol === 0 || localCol === 4 || (localRow === 2 && localCol === 2);
}

function isQrCellFilled(index: number) {
  const row = Math.floor(index / qrMatrixSize);
  const col = index % qrMatrixSize;
  const finder =
    isFinderCell(row, col, 0, 0) ??
    isFinderCell(row, col, 0, qrMatrixSize - 5) ??
    isFinderCell(row, col, qrMatrixSize - 5, 0);

  if (finder !== undefined) {
    return finder;
  }

  return ((row * 7 + col * 13 + row * col) % 5 < 2) || ((row + col * 2) % 11 === 0);
}

function ConnectQrCode() {
  return (
    <div className="connect-qr-frame" aria-label="QR Code visual para pareamento local">
      <span className="connect-scan-line" />
      <div className="connect-qr-code">
        {Array.from({ length: qrMatrixSize * qrMatrixSize }, (_, index) => (
          <span className={isQrCellFilled(index) ? "connect-qr-cell filled" : "connect-qr-cell"} key={index} />
        ))}
      </div>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <AppShell>
      <Header
        eyebrow="02 Conectar dispositivos"
        title="Conecte ao seu dispositivo local"
        description="Emparelhe seu celular com o MantisVault Desktop pela rede local."
      />

      <section className="connect-panel" aria-labelledby="connect-title">
        <div className="connect-panel-heading">
          <h2 id="connect-title">Conecte ao seu dispositivo local</h2>
          <p>Emparelhe seu dispositivo com o MantisVault Desktop.</p>
        </div>

        <div className="connect-diagram">
          <div className="connect-local-device" aria-label="Dispositivo local aguardando conexão">
            <Smartphone size={22} />
            <span />
            <span />
            <span />
          </div>

          <span className="connect-dotted-line" aria-hidden="true" />

          <div className="connect-qr-stack">
            <ConnectQrCode />
            <p>Escaneie este QR Code com o app desktop</p>
            <div className="connect-or"><span />OU<span /></div>
            <div className="connect-code">
              <span>7F6B-2D9M-4X1Q</span>
              <Copy size={16} />
            </div>
          </div>

          <span className="connect-dotted-line" aria-hidden="true" />

          <div className="connect-laptop" aria-label="Desktop local">
            <Laptop size={34} />
            <span />
          </div>

          <div className="connect-phone-preview" aria-label="Prévia do celular conectado">
            <div className="connect-phone-notch" />
            <div className="connect-phone-screen">
              <MantisMascot />
              <div className="connect-phone-status">
                <CheckCircle2 size={15} />
                <span>Dispositivo pronto</span>
              </div>
            </div>
          </div>
        </div>

        <div className="connect-network-rail">
          <div className="connect-network-main">
            <Network size={16} />
            <span>Rede local detectada</span>
          </div>
          <div className="connect-network-meter" aria-hidden="true"><span /></div>
          <strong>192.168.1.42</strong>
          <span className="connect-secure"><ShieldCheck size={15} /> Segura</span>
        </div>

        <p className="connect-note"><Wifi size={16} /> Os dispositivos precisam estar na mesma rede local.</p>
      </section>
    </AppShell>
  );
}
