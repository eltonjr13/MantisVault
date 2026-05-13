import { Gauge, KeyRound, RadioTower, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { StatusPill } from "@/components/ui/StatusPill";
import { transferSteps } from "@/data/mockStats";

export function TransferProgress() {
  return (
    <Card padding="lg">
      <div className="split-row">
        <div>
          <span className="section-kicker">Transferência</span>
          <h2>Enviando 3 arquivos</h2>
          <p className="muted">Para: Cofre Local</p>
        </div>
        <StatusPill label="42,8 MB/s" variant="connected" />
      </div>

      <div className="transfer-metrics">
        <div>
          <Gauge size={18} />
          <strong>57%</strong>
          <span>Progresso geral</span>
        </div>
        <div>
          <RadioTower size={18} />
          <strong>1,47 GB / 2,65 GB</strong>
          <span>Dados enviados</span>
        </div>
        <div>
          <KeyRound size={18} />
          <strong>00:01:24</strong>
          <span>Tempo restante</span>
        </div>
      </div>

      <div className="transfer-list">
        {transferSteps.map((step, index) => (
          <article className="transfer-step" key={step.title}>
            <div className="step-head">
              <div className="step-title">
                <span className="step-index">{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p className="small-text">{step.detail}</p>
                </div>
              </div>
              <StatusPill label={step.status} variant={step.status === "Concluído" ? "verified" : "encrypted"} />
            </div>
            <Progress value={step.progress} variant={step.variant} meta={`${step.progress}%`} />
          </article>
        ))}
      </div>

      <Button href="/upload" variant="danger" size="lg" className="full-button">
        <XCircle size={18} />
        Cancelar transferência
      </Button>
    </Card>
  );
}
