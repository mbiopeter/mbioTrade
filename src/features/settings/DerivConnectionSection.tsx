"use client";

import {
  KeyRound,
  RefreshCcw,
  ShieldAlert,
  Trash2,
  Unplug,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Field, Input, SearchSelect, Switch } from "@/components/ui/controls";
import { useAccount } from "@/context/account-context";
import { useApp } from "@/context/app-context";
import { useToast } from "@/context/toast-context";
import { DERIV_APP_ID_EXAMPLE, isValidDerivAppId } from "@/lib/deriv-app-id";
import { validateCredentials } from "@/lib/validation";
import { loadSavedCredentials } from "@/lib/storage";
import type { DerivAccountSummary } from "@/lib/types";

export function DerivConnectionSection() {
  const { preferences, updatePreferences } = useApp();
  const account = useAccount();
  const { toast } = useToast();

  const [appIdInput, setAppIdInput] = useState(preferences.derivAppId);
  const [token, setToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accountMode, setAccountMode] = useState<"demo" | "real">("demo");
  const [rememberSession, setRememberSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState<DerivAccountSummary[]>([]);

  useEffect(() => {
    const saved = loadSavedCredentials();
    if (saved) {
      setToken(saved.token);
      setAppIdInput(saved.appId);
      setAccountId(saved.accountId);
      setAccountMode(saved.accountMode);
      setRememberSession(saved.rememberSession);
    }
  }, []);

  useEffect(() => {
    setAppIdInput(preferences.derivAppId);
  }, [preferences.derivAppId]);

  useEffect(() => {
    if (!account.credentials) {
      return;
    }

    setAccountId(account.credentials.accountId);
    setAccountMode(account.credentials.accountMode);
    setRememberSession(account.credentials.rememberSession);

    if (account.credentials.appId && !preferences.derivAppId) {
      updatePreferences({ derivAppId: account.credentials.appId });
    }
    if (account.credentials.rememberSession) {
      setToken(account.credentials.token);
    }
  }, [account.credentials, preferences.derivAppId, updatePreferences]);

  const discoverAccounts = async () => {
    setLoading(true);
    try {
      const appId = appIdInput.trim();
      if (!isValidDerivAppId(appId)) {
        throw new Error(
          `Enter your alphanumeric App ID, for example ${DERIV_APP_ID_EXAMPLE}.`,
        );
      }
      if (token.trim().length < 12) {
        throw new Error("Enter your Deriv API key first.");
      }

      updatePreferences({ derivAppId: appId });
      const accounts = await account.loadAccounts(token.trim(), appId);
      setAvailableAccounts(accounts);

      if (accounts.length > 0) {
        const preferred = accounts.find((candidate) => candidate.isDemo) ?? accounts[0];
        setAccountId(preferred.accountId);
        setAccountMode(preferred.isDemo ? "demo" : "real");
      }

      toast({
        title: `Found ${accounts.length} Deriv account${accounts.length === 1 ? "" : "s"}`,
        message:
          accounts.length > 0
            ? "Choose the account you want to connect."
            : "No Options accounts were returned for this API key.",
        tone: accounts.length > 0 ? "success" : "info",
      });
    } catch (error) {
      toast({
        title: "Deriv account discovery failed",
        message: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const connectAccount = async () => {
    const validation = validateCredentials({
      appId: appIdInput,
      token,
      accountId,
      accountMode,
      rememberSession,
    });

    if (!validation.ok) {
      toast({
        title: "Check connection settings",
        message: validation.error,
        tone: "error",
      });
      return;
    }

    setLoading(true);
    try {
      await account.connect(validation.value);
      updatePreferences({ derivAppId: validation.value.appId });
      if (!rememberSession) {
        setToken("");
      }
    } catch (error) {
      toast({
        title: "Deriv connection failed",
        message: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const changeSelectedAccount = (nextAccountId: string) => {
    setAccountId(nextAccountId);
    const selected = availableAccounts.find(
      (candidate) => candidate.accountId === nextAccountId,
    );
    if (selected) {
      setAccountMode(selected.isDemo ? "demo" : "real");
    }
  };

  return (
    <section className="card settings-section deriv-settings">
      <div className="settings-title">
        <div className="settings-icon">
          <KeyRound />
        </div>
        <div>
          <h2>Deriv connection</h2>
          <p>
            Connect your Deriv account to restore its open trades on this device. Your
            API key is treated like a password.
          </p>
        </div>
      </div>

      {account.credentials && (
        <div
          className={`inline-alert ${
            account.connectionStatus === "connected" ? "success" : "info"
          }`}
        >
          <span className="status-dot" />
          {account.connectionStatus === "connected"
            ? account.synced
              ? "Deriv connected. Account positions are synchronized."
              : "Deriv connected. Synchronizing account positions…"
            : account.connectionStatus === "offline"
              ? "Network offline. MbioTrade will reconnect when the network returns."
              : account.connectionStatus === "connecting"
                ? "Connecting to Deriv. Failed attempts retry automatically."
                : "Deriv connection interrupted. Automatic reconnection is running."}
        </div>
      )}

      {account.connectionError && (
        <div className="inline-alert info">
          {account.connectionError} Connection attempts continue automatically. You can
          disconnect to stop them or update your credentials and reconnect.
        </div>
      )}

      {account.syncError && (
        <div className="inline-alert info">
          {account.syncError} Trading resumes after account sync succeeds.
        </div>
      )}

      <div className="connection-steps">
        <span>
          <b>1</b> App ID
        </span>
        <i>→</i>
        <span>
          <b>2</b> API key
        </span>
        <i>→</i>
        <span>
          <b>3</b> Discover account
        </span>
        <i>→</i>
        <span>
          <b>4</b> Connect
        </span>
      </div>

      <div className="form-grid two">
        <Field
          label="Deriv App ID"
          hint="Mixed letters and numbers. Enter the exact ID supplied by Deriv."
        >
          <Input
            inputMode="text"
            autoCapitalize="none"
            spellCheck={false}
            value={appIdInput}
            placeholder={DERIV_APP_ID_EXAMPLE}
            onChange={(event) => {
              const next = event.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 64);
              setAppIdInput(next);
              if (!next || isValidDerivAppId(next)) {
                updatePreferences({ derivAppId: next });
              }
            }}
          />
        </Field>

        <Field
          label="Deriv API key / token"
          hint="Remembered on this browser when enabled below. Excluded from backups."
        >
          <Input
            value={token ?? ""}
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Paste API key"
            onChange={(event) =>
              setToken(event.target.value.replace(/\s/g, "").slice(0, 4096))
            }
          />
        </Field>
      </div>

      <div className="inline-alert info">
        <ShieldAlert size={16} />
        The App ID is read only from this Settings field and sent with the connection
        request. MbioTrade does not read it from <code>.env</code>.
      </div>

      <div className="button-row">
        <button
          type="button"
          className="btn secondary"
          onClick={() => void discoverAccounts()}
          disabled={loading || token?.length < 12 || !isValidDerivAppId(appIdInput)}
        >
          <RefreshCcw size={16} />
          Discover accounts
        </button>

        {availableAccounts.length > 0 && (
          <div className="account-picker-wrap">
            <SearchSelect
              value={accountId}
              placeholder="Choose account"
              options={availableAccounts.map((candidate) => ({
                value: candidate.accountId,
                label: `${candidate.isDemo ? "Demo" : "Real"} · ${candidate.accountId}`,
                meta: candidate.currency,
              }))}
              onChange={changeSelectedAccount}
            />
          </div>
        )}
      </div>

      {accountId && (
        <div className="selected-account">
          <span>Selected account</span>
          <strong>
            {accountMode.toUpperCase()} · {accountId}
          </strong>
        </div>
      )}

      <div className="setting-line">
        <div>
          <strong>Remember API key on this device</strong>
          <span>
            Saves the key in this browser so it survives closing and reopening. Use a
            trusted device. Disconnect before changing this setting.
          </span>
        </div>
        <Switch
          checked={rememberSession}
          onChange={setRememberSession}
          disabled={Boolean(account.credentials)}
        />
      </div>

      <div className="button-row">
        {account.credentials ? (
          <button type="button" className="btn secondary" onClick={account.disconnect}>
            <Unplug size={16} />
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className="btn primary"
            onClick={() => void connectAccount()}
            disabled={loading || !accountId}
          >
            <WalletCards size={16} />
            Connect selected account
          </button>
        )}

        <button
          type="button"
          className="btn secondary"
          onClick={() =>
            void account.refresh().catch((error: unknown) =>
              toast({
                title: "Account refresh needs attention",
                message:
                  error instanceof Error
                    ? error.message
                    : "Deriv could not be reached.",
                tone: "error",
              }),
            )
          }
          disabled={!account.connected}
        >
          <RefreshCcw size={16} />
          Test / refresh
        </button>

        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            account.forgetCredentials();
            setToken("");
            setAccountId("");
            setAvailableAccounts([]);
            toast({ title: "Saved API key forgotten", tone: "info" });
          }}
        >
          <Trash2 size={16} />
          Forget saved key
        </button>
      </div>
      <p className="muted">
        Disconnect keeps a remembered key. Forget saved key removes it from this device.
        A new device needs its own sign-in to the same Deriv account.
      </p>
    </section>
  );
}
