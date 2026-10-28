import type { ReactNode } from "react";

export type StatCardProps = {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
};

export function StatCard({ label, value, meta, icon }: StatCardProps) {
  return (
    <div className="card stat-card">
      <div className="stat-top">
        <span>{label}</span>
        {icon && <b>{icon}</b>}
      </div>
      <strong className="stat-value">{value}</strong>
      {meta && <small>{meta}</small>}
    </div>
  );
}
