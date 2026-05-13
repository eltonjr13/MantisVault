import { ArrowRight, FilePlus2, UploadCloud, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FileIcon } from "@/components/ui/FileIcon";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { selectedUploadFiles } from "@/data/mockFiles";

export default function UploadPage() {
  return (
    <AppShell>
      <Header
        eyebrow="04 Enviar arquivos"
        title="Enviar arquivos"
        description="Selecione arquivos para otimização local, criptografia e envio seguro."
      />

      <div className="page-grid">
        <Card padding="lg">
          <div className="dropzone">
            <div>
              <span className="dropzone-icon">
                <UploadCloud size={34} />
              </span>
              <h2>Arraste e solte seus arquivos aqui</h2>
              <p>ou clique para selecionar. Suporte a qualquer tipo de arquivo.</p>
              <Button variant="secondary">
                <FilePlus2 size={18} />
                Selecionar arquivos
              </Button>
            </div>
          </div>

          <div className="stack-md">
            <SectionTitle title="Arquivos selecionados" description="3 arquivos prontos para continuar." action={<a className="small-text" href="/upload">Limpar tudo</a>} />
            <div className="file-list">
              {selectedUploadFiles.map((file) => (
                <article className="selected-file" key={file.id}>
                  <div className="selected-file-main">
                    <FileIcon kind={file.kind} />
                    <span>
                      <strong>{file.name}</strong>
                      <span>
                        {file.type} • {file.size}
                      </span>
                    </span>
                  </div>
                  <button className="icon-button" type="button" aria-label={`Remover ${file.name}`}>
                    <X size={17} />
                  </button>
                </article>
              ))}
            </div>
          </div>
        </Card>

        <aside className="stack-md">
          <Card padding="md">
            <SectionTitle title="Resumo" description="Dados analisados localmente antes de qualquer envio." />
            <div className="detail-list">
              <div className="detail-item">
                <span>Tamanho total</span>
                <strong>2,65 GB</strong>
              </div>
              <div className="detail-item">
                <span>Tipos</span>
                <strong>PDF, CSV, MP4</strong>
              </div>
              <div className="detail-item">
                <span>Modo</span>
                <strong>Sem perda + criptografia</strong>
              </div>
            </div>
            <Button href="/transfer" size="lg" className="full-button">
              Continuar
              <ArrowRight size={18} />
            </Button>
          </Card>

          <Card padding="md">
            <SectionTitle title="Privacidade por design" description="O arquivo original não sai do dispositivo sem criptografia aplicada." />
            <p className="muted">Qualidade preservada, chunks repetidos detectados e manifest técnico protegido.</p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
