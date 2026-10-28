"use client";

import { Cloud, Download, Unplug, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Field, Input, Switch } from "@/components/ui/controls";
import { useApp } from "@/context/app-context";
import { useToast } from "@/context/toast-context";
import {
  authorizeGoogleDrive,
  disconnectGoogle,
  downloadWorkspace,
  googleConnected,
  uploadWorkspace,
} from "@/lib/google-sync";

export function SyncSection() {
  const { preferences, updatePreferences, exportWorkspace, importWorkspace } = useApp();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(googleConnected());

  const connectGoogle = async () => {
    setBusy(true);
    try {
      await authorizeGoogleDrive(preferences.googleSync.clientId);
      setConnected(true);
      toast({
        title: "Google Drive connected",
        message: "MbioTrade can now use the private App Data folder.",
        tone: "success",
      });
    } catch (error) {
      toast({
        title: "Google connection failed",
        message: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const backUpToGoogle = async () => {
    setBusy(true);
    try {
      if (!googleConnected()) {
        await authorizeGoogleDrive(preferences.googleSync.clientId);
        setConnected(true);
      }
      const file = await uploadWorkspace(exportWorkspace());
      const syncedAt = Date.now();
      updatePreferences({
        googleSync: {
          ...preferences.googleSync,
          lastSyncAt: syncedAt,
        },
      });
      toast({
        title: "Workspace backed up",
        message: file.modifiedTime
          ? `Google updated the backup at ${new Date(file.modifiedTime).toLocaleString()}.`
          : "The private Google Drive backup is current.",
        tone: "success",
      });
    } catch (error) {
      toast({
        title: "Google backup failed",
        message: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const restoreFromGoogle = async () => {
    setBusy(true);
    try {
      if (!googleConnected()) {
        await authorizeGoogleDrive(preferences.googleSync.clientId);
        setConnected(true);
      }
      const backup = await downloadWorkspace();
      if (!backup) {
        throw new Error("No MbioTrade backup exists in Google Drive App Data.");
      }
      importWorkspace(backup.snapshot);
      toast({
        title: "Workspace restored",
        message: "The Google backup was validated before it replaced local data.",
        tone: "success",
      });
    } catch (error) {
      toast({
        title: "Google restore failed",
        message: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(exportWorkspace(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mbiotrade-v14-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      if (file.size > 5_000_000) {
        throw new Error("The backup file is larger than the 5 MB safety limit.");
      }
      const parsed: unknown = JSON.parse(await file.text());
      importWorkspace(parsed);
      toast({
        title: "Local backup imported",
        message: "All records were validated before being saved.",
        tone: "success",
      });
    } catch (error) {
      toast({
        title: "Import rejected",
        message: error instanceof Error ? error.message : "Invalid JSON file",
        tone: "error",
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const disconnect = () => {
    disconnectGoogle();
    setConnected(false);
    toast({ title: "Google session disconnected", tone: "info" });
  };

  return (
    <section className="card settings-section">
      <div className="settings-title">
        <div className="settings-icon">
          <Cloud />
        </div>
        <div>
          <h2>Local and Google sync</h2>
          <p>
            Deriv supplies account positions. Preferences, strategies and journal notes
            are kept on this device, with optional private Google backups.
          </p>
        </div>
      </div>

      <Field
        label="Google OAuth Web Client ID"
        hint="Create a browser OAuth client in Google Cloud. No client secret is used."
      >
        <Input
          value={preferences.googleSync.clientId}
          placeholder="123456789-…apps.googleusercontent.com"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) =>
            updatePreferences({
              googleSync: {
                ...preferences.googleSync,
                clientId: event.target.value.trim().slice(0, 200),
              },
            })
          }
        />
      </Field>

      <div className="button-row">
        <button
          type="button"
          className="btn secondary"
          onClick={() => void connectGoogle()}
          disabled={busy || !preferences.googleSync.clientId}
        >
          <Cloud size={16} />
          {connected ? "Reconnect Google" : "Connect Google"}
        </button>

        {connected && (
          <button type="button" className="btn secondary" onClick={disconnect}>
            <Unplug size={16} />
            Disconnect
          </button>
        )}

        <button
          type="button"
          className="btn primary"
          onClick={() => void backUpToGoogle()}
          disabled={busy || !preferences.googleSync.clientId}
        >
          <Upload size={16} />
          Sync now
        </button>

        <button
          type="button"
          className="btn secondary"
          onClick={() => void restoreFromGoogle()}
          disabled={busy || !preferences.googleSync.clientId}
        >
          <Download size={16} />
          Restore
        </button>
      </div>

      {preferences.googleSync.lastSyncAt && (
        <p className="muted">
          Last backup: {new Date(preferences.googleSync.lastSyncAt).toLocaleString()}
        </p>
      )}

      <div className="setting-line">
        <div>
          <strong>Auto-backup while connected</strong>
          <span>
            Periodically saves the validated workspace while this browser session
            remains authorized.
          </span>
        </div>
        <Switch
          checked={preferences.googleSync.autoSync}
          onChange={(autoSync) =>
            updatePreferences({
              googleSync: { ...preferences.googleSync, autoSync },
            })
          }
        />
      </div>

      <div className="button-row">
        <button type="button" className="btn secondary" onClick={exportJson}>
          <Download size={16} />
          Export JSON
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={16} />
          Import JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => void importJson(event.target.files?.item(0) ?? null)}
        />
      </div>
    </section>
  );
}
