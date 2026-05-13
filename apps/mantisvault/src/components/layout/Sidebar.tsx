"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileUp, FolderOpen, LayoutDashboard, Link2, LockKeyhole, RadioTower } from "lucide-react";
import { MantisMark } from "@/components/mantisvault/MantisMark";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/connect", label: "Conectar", icon: Link2 },
  { href: "/upload", label: "Enviar arquivos", icon: FileUp },
  { href: "/transfer", label: "Transferência", icon: RadioTower },
  { href: "/files", label: "Meus arquivos", icon: FolderOpen },
  { href: "/security", label: "Segurança", icon: LockKeyhole },
  { href: "/analytics", label: "Analytics", icon: BarChart3 }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar" aria-label="Navegação principal">
      <Link className="brand" href="/">
        <span className="brand-mark">
          <MantisMark />
        </span>
        <span>
          <span className="brand-word">
            Mantis<span>Vault</span>
          </span>
          <span className="brand-sub">Local-first secure vault</span>
        </span>
      </Link>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link className={active ? "nav-item active" : "nav-item"} href={item.href} key={item.href}>
              <Icon size={19} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <strong>Somente local</strong>
        <span>Dados analisados e protegidos neste dispositivo.</span>
      </div>
    </aside>
  );
}
