import { Filter, Grid3X3, ListFilter, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Header } from "@/components/layout/Header";
import { FileList } from "@/components/mantisvault/FileList";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { mockFiles } from "@/data/mockFiles";

const filters = ["Todos", "Documentos", "Imagens", "Vídeos", "Pastas", "Arquivos grandes"];

export default function FilesPage() {
  return (
    <AppShell>
      <Header
        eyebrow="06 Meus arquivos"
        title="Meus arquivos"
        description="Arquivos armazenados no cofre local com status de otimização e segurança."
      />

      <Card padding="md">
        <div className="toolbar">
          <label className="search-bar">
            <Search size={18} />
            <input aria-label="Buscar arquivos" placeholder="Buscar arquivos..." />
          </label>
          <div className="header-actions">
            <button className="icon-button" type="button" aria-label="Ordenar arquivos">
              <ListFilter size={18} />
            </button>
            <button className="icon-button" type="button" aria-label="Visualização em grid">
              <Grid3X3 size={18} />
            </button>
            <button className="icon-button" type="button" aria-label="Filtrar arquivos">
              <Filter size={18} />
            </button>
          </div>
        </div>

        <div className="filters" aria-label="Filtros de arquivo">
          {filters.map((filter) => (
            <button className={filter === "Todos" ? "filter-pill active" : "filter-pill"} type="button" key={filter}>
              {filter}
            </button>
          ))}
        </div>

        <SectionTitle title="Arquivos no cofre" description="12.548 itens • 1,42 TB utilizado" />
        <FileList files={mockFiles} />
      </Card>
    </AppShell>
  );
}
