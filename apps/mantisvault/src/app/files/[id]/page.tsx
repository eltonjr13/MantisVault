import { Download, Share2, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Header } from "@/components/layout/Header";
import { MantisMascot } from "@/components/mantisvault/MantisMark";
import { OptimizationBadge } from "@/components/mantisvault/OptimizationBadge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FileIcon } from "@/components/ui/FileIcon";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatusPill } from "@/components/ui/StatusPill";
import { mockFiles } from "@/data/mockFiles";

interface FileDetailsPageProps {
  params: {
    id: string;
  };
}

export function generateStaticParams() {
  return mockFiles.map((file) => ({ id: file.id }));
}

export default function FileDetailsPage({ params }: FileDetailsPageProps) {
  const file = mockFiles.find((item) => item.id === params.id) ?? mockFiles[0];

  return (
    <AppShell>
      <Header
        eyebrow="07 Detalhes do arquivo"
        title="Detalhes do arquivo"
        description="Transparência técnica em linguagem objetiva."
      />

      <div className="page-grid">
        <Card padding="lg">
          <div className="detail-hero">
            <div className="activity-main">
              <FileIcon kind={file.kind} />
              <span>
                <strong>{file.name}</strong>
                <span>{file.path}</span>
              </span>
            </div>
            <div className="badge-row">
              {file.status.map((status) => (
                <OptimizationBadge key={status} status={status} />
              ))}
            </div>
          </div>

          <SectionTitle title="Resumo de armazenamento" description="Resultado final após otimização, chunks e criptografia." />
          <div className="grid-3">
            <div className="detail-item">
              <span>Tamanho original</span>
              <strong>{file.originalSize}</strong>
            </div>
            <div className="detail-item">
              <span>Tamanho final</span>
              <strong>{file.finalSize}</strong>
            </div>
            <div className="detail-item">
              <span>Economia</span>
              <strong className="coral-text">{file.savings}</strong>
            </div>
          </div>

          <div className="detail-list">
            <div className="detail-item">
              <span>Estratégia usada</span>
              <strong>{file.strategy}</strong>
            </div>
            <div className="detail-item">
              <span>Chunks</span>
              <strong>{file.chunks}</strong>
            </div>
            <div className="detail-item">
              <span>Hash</span>
              <strong>{file.hash}</strong>
            </div>
            <div className="detail-item">
              <span>Criptografia</span>
              <strong>{file.encryption}</strong>
            </div>
            <div className="detail-item">
              <span>Integridade</span>
              <strong>{file.integrity}</strong>
            </div>
          </div>

          <div className="hero-actions">
            <Button href="/files" variant="secondary">
              <Download size={17} />
              Baixar original
            </Button>
            <Button href="/files" variant="primary">
              <Share2 size={17} />
              Compartilhar
            </Button>
            <Button href="/files" variant="danger">
              <Trash2 size={17} />
              Excluir
            </Button>
          </div>
        </Card>

        <aside className="stack-md">
          <Card padding="md">
            <SectionTitle title="Segurança" description="Manifest e chunks protegidos no cofre local." />
            <div className="detail-list">
              <div className="detail-item">
                <span>Criptografia</span>
                <strong>{file.encryption}</strong>
              </div>
              <div className="detail-item">
                <span>Chave</span>
                <strong>Local neste dispositivo</strong>
              </div>
            </div>
            <StatusPill label="Integridade verificada" variant="verified" />
          </Card>

          <Card padding="md">
            <div className="detail-mascot">
              <MantisMascot />
            </div>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
