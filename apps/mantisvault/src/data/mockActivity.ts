export interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  status: "Criptografado" | "Conectado" | "Relatório" | "Otimizado";
}

export const recentActivity: ActivityItem[] = [
  {
    id: "act-1",
    title: "relatorio_final.pdf",
    detail: "1,2 GB • 2 min atrás",
    time: "Hoje, 10:32",
    status: "Criptografado"
  },
  {
    id: "act-2",
    title: "3 arquivos enviados",
    detail: "Qualidade preservada",
    time: "Hoje, 10:32",
    status: "Otimizado"
  },
  {
    id: "act-3",
    title: "1 dispositivo conectado",
    detail: "MantisVault Mobile",
    time: "Hoje, 09:18",
    status: "Conectado"
  },
  {
    id: "act-4",
    title: "Relatório gerado",
    detail: "Economia e integridade verificadas",
    time: "Ontem, 22:14",
    status: "Relatório"
  }
];
