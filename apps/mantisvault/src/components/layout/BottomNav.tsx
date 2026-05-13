"use client";

import Link from "next/link";
import { FileUp, FolderOpen, LayoutDashboard, Link2, LockKeyhole } from "lucide-react";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/connect", label: "Conectar", icon: Link2 },
  { href: "/upload", label: "Enviar", icon: FileUp },
  { href: "/files", label: "Arquivos", icon: FolderOpen },
  { href: "/security", label: "Seguro", icon: LockKeyhole }
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Navegação mobile">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link className={active ? "active" : ""} href={item.href} key={item.href}>
            <Icon size={18} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
