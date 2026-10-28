"use client";

import { Layers3 } from "lucide-react";
import { SearchSelect } from "@/components/ui/controls";
import { useApp } from "@/context/app-context";

export function StrategyComboPicker() {
  const { combos, activeComboId, setActiveComboId } = useApp();

  return (
    <div className="combo-picker v2">
      <Layers3 size={16} />
      <SearchSelect
        value={activeComboId}
        options={combos.map((combo) => ({
          value: combo.id,
          label: combo.name,
          meta: `${combo.strategies.filter((strategy) => strategy.enabled).length} enabled`,
        }))}
        onChange={setActiveComboId}
        searchPlaceholder="Filter combinations…"
      />
    </div>
  );
}
