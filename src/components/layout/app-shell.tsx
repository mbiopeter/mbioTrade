"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  BookOpen,
  BookOpenCheck,
  CandlestickChart,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Menu,
  ScanSearch,
  Settings,
  ShieldCheck,
  UserRound,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { APP_VERSION_LABEL, AUTO_SYNC_INTERVAL_MS } from "@/lib/app-config";
import { useAccount } from "@/context/account-context";
import { useApp } from "@/context/app-context";
import { googleConnected, uploadWorkspace } from "@/lib/google-sync";

export type NavigationIcon = ComponentType<{ size?: number }>;

export type NavigationItem = {
  href: string;
  label: string;
  icon: NavigationIcon;
};

export type NavigationGroup = {
  id: string;
  label: string;
  items: NavigationItem[];
};

const PRIMARY_NAVIGATION: NavigationItem[] = [
  { href: "/terminal", label: "Terminal", icon: CandlestickChart },
  { href: "/scanner", label: "Scanner", icon: ScanSearch },
  { href: "/backtest", label: "Backtest", icon: FlaskConical },
  { href: "/strategies", label: "Strategies", icon: BookOpenCheck },
  { href: "/analysis", label: "Trade analysis", icon: BarChart3 },
];

const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    id: "account",
    label: "Account",
    items: [
      { href: "/portfolio", label: "Portfolio", icon: WalletCards },
      { href: "/alerts", label: "Signals & alerts", icon: Bell },
    ],
  },
  {
    id: "learn",
    label: "Learn",
    items: [
      { href: "/tutorials", label: "Tutorials", icon: BookOpenCheck },
      { href: "/docs", label: "Documentation", icon: BookOpen },
    ],
  },
];

function groupForPath(pathname: string): string | null {
  return (
    NAVIGATION_GROUPS.find((group) =>
      group.items.some(
        (item) =>
          pathname === item.href || pathname.startsWith(`${item.href}/`),
      ),
    )?.id ?? null
  );
}

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLink({
  item,
  pathname,
}: {
  item: NavigationItem;
  pathname: string;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={`nav-item ${isActivePath(pathname, item.href) ? "active" : ""}`}
    >
      <Icon size={18} />
      <span>{item.label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { preferences, updatePreferences, exportWorkspace } = useApp();
  const {
    connected,
    connectionStatus,
    credentials,
    balance,
    currency,
  } = useAccount();

  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(
    () => groupForPath(pathname) ?? "account",
  );
  const autoSyncBusyRef = useRef(false);

  useEffect(() => {
    setMobileNavigationOpen(false);
    const currentGroup = groupForPath(pathname);
    if (currentGroup) {
      setOpenGroup(currentGroup);
    }
  }, [pathname]);

  useEffect(() => {
    const syncSettings = preferences.googleSync;
    if (!syncSettings.enabled || !syncSettings.autoSync) {
      return;
    }

    const runAutoSync = async () => {
      if (autoSyncBusyRef.current || !googleConnected()) {
        return;
      }

      autoSyncBusyRef.current = true;
      try {
        const file = await uploadWorkspace(exportWorkspace());
        updatePreferences({
          googleSync: {
            ...syncSettings,
            lastSyncAt: Date.now(),
            lastFileId: file.id,
          },
        });
      } catch {
        // Manual sync exposes errors in Settings. Background sync stays quiet.
      } finally {
        autoSyncBusyRef.current = false;
      }
    };

    const interval = setInterval(runAutoSync, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [
    exportWorkspace,
    preferences.googleSync,
    updatePreferences,
  ]);

  const navigationGroups = useMemo(() => {
    if (!connected) {
      return NAVIGATION_GROUPS;
    }

    return NAVIGATION_GROUPS.map((group) =>
      group.id === "account"
        ? {
            ...group,
            items: [
              ...group.items,
              { href: "/profile", label: "Profile", icon: UserRound },
            ],
          }
        : group,
    );
  }, [connected]);

  return (
    <div className="app-shell v8-shell">
      <aside
        className={`sidebar v8-sidebar ${mobileNavigationOpen ? "mobile-open" : ""}`}
      >
        <div className="brand-row v8-brand-row">
          <Link href="/terminal" className="brand v8-brand">
            <span className="brand-mark v8-brand-mark">
              <Zap size={22} />
            </span>
            <span>
              <strong>
                MbioTrade <em>{APP_VERSION_LABEL}</em>
              </strong>
              <small>Forex · Crypto · Gold</small>
            </span>
          </Link>
          <button
            type="button"
            className="icon-btn mobile-close"
            onClick={() => setMobileNavigationOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="nav-list grouped-nav v8-nav">
          <div className="nav-pinned">
            {PRIMARY_NAVIGATION.map((item) => (
              <NavigationLink
                key={item.href}
                item={item}
                pathname={pathname}
              />
            ))}
          </div>

          {navigationGroups.map((group) => {
            const isOpen = openGroup === group.id;

            return (
              <div className="nav-group" key={group.id}>
                <button
                  type="button"
                  className={`nav-group-trigger ${isOpen ? "open" : ""}`}
                  onClick={() => setOpenGroup(isOpen ? null : group.id)}
                  aria-expanded={isOpen}
                >
                  <span>{group.label}</span>
                  {isOpen ? (
                    <ChevronDown size={15} />
                  ) : (
                    <ChevronRight size={15} />
                  )}
                </button>

                {isOpen && (
                  <div className="nav-group-items">
                    {group.items.map((item) => (
                      <NavigationLink
                        key={item.href}
                        item={item}
                        pathname={pathname}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <Link
            href="/settings"
            className={`nav-item nav-settings ${isActivePath(pathname, "/settings") ? "active" : ""}`}
          >
            <Settings size={18} />
            <span>Settings</span>
          </Link>
        </nav>

        <div className="sidebar-bottom v8-sidebar-bottom">
          <div className="free-workspace">
            <ShieldCheck size={17} />
            <div>
              <strong>Free local workspace</strong>
              <small>No MbioTrade login required</small>
            </div>
          </div>

          <div
            className={`account-mini ${connectionStatus === "connected" ? "online" : ""} ${
              connectionStatus === "reconnecting" ||
              connectionStatus === "offline"
                ? "reconnecting"
                : ""
            }`}
          >
            <span className="status-dot" />
            <div>
              <strong>
                {connected
                  ? credentials?.accountMode === "demo"
                    ? "Demo account"
                    : "Real account"
                  : "Public market mode"}
              </strong>
              <small>
                {connectionStatus === "reconnecting"
                  ? "Reconnecting to Deriv…"
                  : connectionStatus === "offline"
                    ? "Waiting for network…"
                    : connected && balance !== null
                      ? `${balance.toFixed(2)} ${currency}`
                      : "Connect Deriv only to trade"}
              </small>
            </div>
          </div>
        </div>
      </aside>

      <div className="app-main v8-main">
        <header className="topbar v8-topbar">
          <button
            type="button"
            className="icon-btn mobile-menu"
            onClick={() => setMobileNavigationOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          <div className="topbar-context">
            <strong>Trading workspace</strong>
            <small>Live analysis · local-first</small>
          </div>

          <div className="top-actions v8-top-actions">
            {connected && balance !== null ? (
              <Link href="/profile" className="balance-chip v8-balance">
                <span>Balance</span>
                <strong>
                  {balance.toFixed(2)} {currency}
                </strong>
              </Link>
            ) : (
              <Link href="/settings" className="connection-chip">
                <span className="status-dot" />
                Public
              </Link>
            )}

            <Link
              href="/alerts"
              className="icon-btn top-bell"
              aria-label="Signals and alerts"
            >
              <Bell size={18} />
            </Link>

            <Link
              href={connected ? "/profile" : "/settings"}
              className="profile-chip"
            >
              <span>MP</span>
              <div>
                <b>mbiopeter</b>
                <small>
                  {connectionStatus === "reconnecting"
                    ? "reconnecting"
                    : connectionStatus === "offline"
                      ? "offline"
                      : connected
                        ? credentials?.accountMode
                        : "local"}
                </small>
              </div>
            </Link>
          </div>
        </header>

        <main
          className={`main-content ${pathname === "/terminal" ? "terminal-main" : ""}`}
        >
          {children}
        </main>
      </div>

      {mobileNavigationOpen && (
        <button
          type="button"
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavigationOpen(false)}
        />
      )}
    </div>
  );
}
