import type { WorkspaceSnapshot } from "./types";
import { isRecord } from "./validation";

// Keep the established Drive backup filename so v9 backups remain discoverable.
const FILE_NAME = "mbiotrade-v9-workspace.json";
const DRIVE_APP_DATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

let accessToken = "";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options: { prompt?: string }) => void;
};

type GoogleOAuth2 = {
  initTokenClient: (options: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: () => void;
  }) => GoogleTokenClient;
};

type DriveFile = {
  id: string;
  name?: string;
  modifiedTime?: string;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleOAuth2;
      };
    };
  }
}

function loadGoogleIdentityServices(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existing = document.getElementById(
      "google-identity-services",
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Google Identity Services failed to load.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "google-identity-services";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Google Identity Services failed to load."));
    document.head.appendChild(script);
  });
}

export async function authorizeGoogleDrive(clientId: string): Promise<string> {
  const normalizedClientId = clientId.trim();
  if (!/^[0-9A-Za-z._-]{8,200}$/.test(normalizedClientId)) {
    throw new Error("Enter a valid Google OAuth Web Client ID.");
  }

  await loadGoogleIdentityServices();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error("Google Identity Services is unavailable.");
  }

  accessToken = await new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: normalizedClientId,
      scope: DRIVE_APP_DATA_SCOPE,
      callback: (response) => {
        if (response.access_token) {
          resolve(response.access_token);
          return;
        }

        reject(
          new Error(
            response.error_description ??
              response.error ??
              "Google authorization failed.",
          ),
        );
      },
      error_callback: () =>
        reject(new Error("Google authorization was cancelled or blocked.")),
    });

    client.requestAccessToken({ prompt: "consent" });
  });

  return accessToken;
}

function authorizedHeaders(extra: Record<string, string> = {}): HeadersInit {
  if (!accessToken) {
    throw new Error("Connect Google Drive first.");
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    ...extra,
  };
}

async function googleError(response: Response, fallback: string): Promise<Error> {
  const payload: unknown = await response.json().catch(() => null);
  if (isRecord(payload) && isRecord(payload.error)) {
    const message = payload.error.message;
    if (typeof message === "string") {
      return new Error(message);
    }
  }
  return new Error(fallback);
}

async function findFile(): Promise<DriveFile | null> {
  const query = encodeURIComponent(
    `name='${FILE_NAME.replaceAll("'", "\\'")}' and trashed=false`,
  );
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)&pageSize=10`,
    { headers: authorizedHeaders() },
  );

  if (!response.ok) {
    throw await googleError(response, "Could not read the MbioTrade backup folder.");
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.files)) {
    return null;
  }

  const first = payload.files.find((file): file is Record<string, unknown> =>
    isRecord(file),
  );
  if (!first || typeof first.id !== "string") {
    return null;
  }

  return {
    id: first.id,
    name: typeof first.name === "string" ? first.name : undefined,
    modifiedTime:
      typeof first.modifiedTime === "string" ? first.modifiedTime : undefined,
  };
}

async function ensureFile(): Promise<DriveFile> {
  const existing = await findFile();
  if (existing) {
    return existing;
  }

  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,modifiedTime",
    {
      method: "POST",
      headers: authorizedHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: FILE_NAME,
        parents: ["appDataFolder"],
      }),
    },
  );

  if (!response.ok) {
    throw await googleError(response, "Could not create the Google Drive backup file.");
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || typeof payload.id !== "string") {
    throw new Error("Google Drive did not return a backup file id.");
  }

  return {
    id: payload.id,
    name: typeof payload.name === "string" ? payload.name : undefined,
    modifiedTime:
      typeof payload.modifiedTime === "string" ? payload.modifiedTime : undefined,
  };
}

export async function uploadWorkspace(snapshot: WorkspaceSnapshot): Promise<DriveFile> {
  const file = await ensureFile();
  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?uploadType=media&fields=id,name,modifiedTime`,
    {
      method: "PATCH",
      headers: authorizedHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(snapshot),
    },
  );

  if (!response.ok) {
    throw await googleError(response, "Google Drive backup failed.");
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || typeof payload.id !== "string") {
    throw new Error("Google Drive did not return the updated backup file.");
  }

  return {
    id: payload.id,
    name: typeof payload.name === "string" ? payload.name : undefined,
    modifiedTime:
      typeof payload.modifiedTime === "string" ? payload.modifiedTime : undefined,
  };
}

export async function downloadWorkspace(): Promise<{
  file: DriveFile;
  snapshot: unknown;
} | null> {
  const file = await findFile();
  if (!file) {
    return null;
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    { headers: authorizedHeaders() },
  );

  if (!response.ok) {
    throw await googleError(response, "Could not download the Google Drive backup.");
  }

  return { file, snapshot: await response.json() };
}

export function googleConnected(): boolean {
  return Boolean(accessToken);
}

export function disconnectGoogle(): void {
  accessToken = "";
}
