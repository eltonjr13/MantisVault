import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  hoverable?: boolean;
}

export function Card({ children, className = "", padding = "md", hoverable = false }: CardProps) {
  const classes = `card card-pad-${padding} ${hoverable ? "hoverable" : ""} ${className}`.trim();

  return <section className={classes}>{children}</section>;
}
