export type FileKind = "pdf" | "sheet" | "video" | "image" | "archive" | "folder" | "doc" | "code";

export type VaultFileStatus =
  | "Arquivo já otimizado"
  | "Original preservado"
  | "Otimizado sem perda"
  | "Compactado com sucesso"
  | "Criptografado"
  | "Deduplicado";

export interface VaultFile {
  id: string;
  name: string;
  path: string;
  kind: FileKind;
  type: string;
  category: "Documentos" | "Imagens" | "Vídeos" | "Pastas" | "Arquivos grandes";
  size: string;
  originalSize: string;
  finalSize: string;
  savings: string;
  date: string;
  modifiedAt: string;
  strategy: string;
  status: VaultFileStatus[];
  chunks: number;
  hash: string;
  encryption: string;
  integrity: "Verificada" | "Pendente";
}

export const mockFiles: VaultFile[] = [
  {
    id: "relatorio-mercado-v3",
    name: "relatorio_mercado_v3.pdf",
    path: "/Relatórios/2024/",
    kind: "pdf",
    type: "PDF",
    category: "Documentos",
    size: "68,7 MB",
    originalSize: "120,4 MB",
    finalSize: "68,7 MB",
    savings: "42,9%",
    date: "Hoje, 10:32",
    modifiedAt: "07/05/2024, 14:22",
    strategy: "Compressão + Deduplicação",
    status: ["Otimizado sem perda", "Criptografado", "Deduplicado"],
    chunks: 248,
    hash: "9F3A...7B2C",
    encryption: "AES-256-GCM",
    integrity: "Verificada"
  },
  {
    id: "dados-clientes-2024",
    name: "dados_clientes_2024.csv",
    path: "/Bases/Clientes/",
    kind: "sheet",
    type: "CSV",
    category: "Documentos",
    size: "85,7 MB",
    originalSize: "85,7 MB",
    finalSize: "85,7 MB",
    savings: "0%",
    date: "Hoje, 09:18",
    modifiedAt: "07/05/2024, 09:18",
    strategy: "Original preservado",
    status: ["Original preservado", "Criptografado"],
    chunks: 112,
    hash: "A21C...D98F",
    encryption: "AES-256-GCM",
    integrity: "Verificada"
  },
  {
    id: "video-apresentacao",
    name: "video_apresentacao.mp4",
    path: "/Mídia/Apresentações/",
    kind: "video",
    type: "MP4",
    category: "Vídeos",
    size: "2,45 GB",
    originalSize: "2,45 GB",
    finalSize: "2,45 GB",
    savings: "0%",
    date: "Ontem, 18:44",
    modifiedAt: "06/05/2024, 18:44",
    strategy: "Arquivo já otimizado",
    status: ["Arquivo já otimizado", "Criptografado"],
    chunks: 896,
    hash: "BC41...913D",
    encryption: "AES-256-GCM",
    integrity: "Verificada"
  },
  {
    id: "fotos-evento",
    name: "fotos_evento/",
    path: "/Imagens/",
    kind: "folder",
    type: "Pasta",
    category: "Pastas",
    size: "1,12 GB",
    originalSize: "1,38 GB",
    finalSize: "1,12 GB",
    savings: "18,8%",
    date: "Ontem, 16:02",
    modifiedAt: "06/05/2024, 16:02",
    strategy: "Otimização sem perda",
    status: ["Otimizado sem perda", "Criptografado"],
    chunks: 372,
    hash: "64DD...A0EF",
    encryption: "AES-256-GCM",
    integrity: "Verificada"
  },
  {
    id: "backup-projeto",
    name: "backup_projeto.zip",
    path: "/Backups/Projetos/",
    kind: "archive",
    type: "ZIP",
    category: "Arquivos grandes",
    size: "612,3 MB",
    originalSize: "711,1 MB",
    finalSize: "612,3 MB",
    savings: "13,9%",
    date: "08/05/2024",
    modifiedAt: "08/05/2024, 22:11",
    strategy: "Deduplicação por chunks",
    status: ["Compactado com sucesso", "Criptografado", "Deduplicado"],
    chunks: 304,
    hash: "E90B...42AD",
    encryption: "AES-256-GCM",
    integrity: "Verificada"
  }
];

export const selectedUploadFiles = [
  { id: "upload-1", name: "relatorio_mercado_v3.pdf", kind: "pdf" as FileKind, type: "PDF", size: "120,4 MB" },
  { id: "upload-2", name: "dados_clientes_2024.csv", kind: "sheet" as FileKind, type: "CSV", size: "85,7 MB" },
  { id: "upload-3", name: "video_apresentacao.mp4", kind: "video" as FileKind, type: "MP4", size: "2,45 GB" }
];
