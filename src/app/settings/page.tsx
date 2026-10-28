"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { AppearanceSection } from "@/features/settings/AppearanceSection";
import { DerivConnectionSection } from "@/features/settings/DerivConnectionSection";
import { ResetSection } from "@/features/settings/ResetSection";
import { SyncSection } from "@/features/settings/SyncSection";
import { TradingBehaviorSection } from "@/features/settings/TradingBehaviorSection";

export default function SettingsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Connect Deriv, control execution risk, back up the local workspace and customize the terminal."
      />

      <div className="settings-grid equal-grid">
        <DerivConnectionSection />
        <TradingBehaviorSection />
        <SyncSection />
        <AppearanceSection />
        <ResetSection />
      </div>
    </div>
  );
}
