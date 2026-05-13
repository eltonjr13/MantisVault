export interface TrustedDevice {
  id: string;
  name: string;
  type: "desktop" | "mobile";
  ip: string;
  status: "Conectado" | "Autorizado";
  lastSeen: string;
}

export const trustedDevices: TrustedDevice[] = [
  {
    id: "desktop-1",
    name: "MantisVault Desktop",
    type: "desktop",
    ip: "192.168.1.42",
    status: "Conectado",
    lastSeen: "Agora"
  },
  {
    id: "mobile-1",
    name: "Pixel 8 Pro",
    type: "mobile",
    ip: "192.168.1.64",
    status: "Autorizado",
    lastSeen: "Hoje, 09:18"
  }
];
