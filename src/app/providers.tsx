"use client";

import type { ReactNode } from "react";
import { AppShell } from "../components/layout/app-shell";
import { AppAutomation } from "../components/trading/AppAutomation";
import { AccountProvider } from "../context/account-context";
import { AppProvider } from "../context/app-context";
import { ToastProvider } from "../context/toast-context";

type ProvidersProps = Readonly<{ children: ReactNode }>;

/**
 * Browser-only providers stay behind one Client Component boundary so the
 * App Router root layout remains a small, predictable Server Component.
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <ToastProvider>
      <AppProvider>
        <AccountProvider>
          <AppAutomation />
          <AppShell>{children}</AppShell>
        </AccountProvider>
      </AppProvider>
    </ToastProvider>
  );
}
