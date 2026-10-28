import { PUBLIC_REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from "../app-config";
import { isRecord } from "../validation";

export type WebSocketConnectionState =
  "idle" | "connecting" | "connected" | "reconnecting" | "offline" | "closed";

export type WebSocketUrlProvider = string | (() => Promise<string>);

type MessageHandler = (payload: Record<string, unknown>) => void;
type StateHandler = (state: WebSocketConnectionState) => void;
type ConnectionErrorHandler = (message: string | null) => void;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type ManagedSubscription = {
  id: number;
  request: Record<string, unknown>;
  messageType: string;
  removeHandler: () => void;
  serverSubscriptionId?: string;
  retryAttempt: number;
  activationPromise?: Promise<void>;
  retryTimer?: ReturnType<typeof setTimeout>;
};

const KEEPALIVE_INTERVAL_MS = 30_000;
const KEEPALIVE_TIMEOUT_MS = 10_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

/** Preserve the broker's own limits/reasons for actionable order rejection. */
export class DerivRequestError extends Error {
  readonly code?: string;
  readonly details?: unknown;
  readonly data?: unknown;

  constructor(message: string, error: Record<string, unknown>) {
    super(message);
    this.name = "DerivRequestError";
    this.code = typeof error.code === "string" ? error.code : undefined;
    this.details = error.details;
    this.data = error.data;
  }
}

function requestError(payload: Record<string, unknown>): Error | null {
  if (!isRecord(payload.error)) {
    return null;
  }

  const message =
    typeof payload.error.message === "string"
      ? payload.error.message
      : "Deriv request failed.";

  return new DerivRequestError(message, payload.error);
}

function browserIsOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function subscriptionId(payload: unknown): string | undefined {
  if (!isRecord(payload) || !isRecord(payload.subscription)) {
    return undefined;
  }

  const id = payload.subscription.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : undefined;
}

/**
 * Persistent request/response and subscription layer for Deriv WebSockets.
 *
 * The client keeps one socket alive, sends periodic pings, reconnects with
 * capped exponential backoff, and restores managed subscriptions after a
 * network interruption. One-shot requests are never replayed automatically,
 * which prevents accidental duplicate purchases after an ambiguous failure.
 */
export class DerivWebSocketClient {
  private socket: WebSocket | null = null;
  private openingSocket: WebSocket | null = null;
  private openingAbort: AbortController | null = null;
  private connectPromise: Promise<void> | null = null;
  private urlProvider: (() => Promise<string>) | null = null;
  private nextRequestId = 1;
  private nextSubscriptionId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly handlers = new Map<string, Set<MessageHandler>>();
  private readonly stateHandlers = new Set<StateHandler>();
  private readonly errorHandlers = new Set<ConnectionErrorHandler>();
  private lastConnectionError: string | null = null;
  private readonly subscriptions = new Map<number, ManagedSubscription>();
  private state: WebSocketConnectionState = "idle";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private pingInFlight = false;
  private manuallyClosed = false;
  private networkListenersInstalled = false;
  private socketGeneration = 0;
  private everConnected = false;

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  get connectionState(): WebSocketConnectionState {
    return this.state;
  }

  async connect(provider?: WebSocketUrlProvider): Promise<void> {
    if (this.manuallyClosed && !provider) {
      throw new Error("Deriv connection was explicitly closed.");
    }
    if (provider) {
      this.urlProvider = typeof provider === "string" ? async () => provider : provider;
    }

    if (!this.urlProvider) {
      throw new Error("A Deriv WebSocket URL provider is required.");
    }

    this.manuallyClosed = false;
    this.installNetworkListeners();

    if (this.connected) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    const attempt = this.openConnection().finally(() => {
      if (this.connectPromise === attempt) this.connectPromise = null;
    });
    this.connectPromise = attempt;
    return attempt;
  }

  async request<TResponse>(
    body: Record<string, unknown>,
    timeoutMs = PUBLIC_REQUEST_TIMEOUT_MS,
    beforeSend?: () => void,
  ): Promise<TResponse> {
    const guardedSocket = beforeSend ? this.socket : null;
    await this.connect();

    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Deriv connection is not open.");
    }
    if (beforeSend && socket !== guardedSocket) {
      throw new Error(
        "Deriv reconnected before this action was sent. Check the current contract and try again.",
      );
    }
    // Financial callers may invalidate their account/trade while connect awaits.
    // Run the guard immediately before sending, without another asynchronous gap.
    beforeSend?.();

    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    return new Promise<TResponse>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(requestId);
        const error = new Error("Deriv request timed out. Reconnecting automatically.");
        reject(error);
        this.restartConnection(socket, error);
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve: (value) => resolve(value as TResponse),
        reject,
        timeoutId,
      });

      try {
        socket.send(JSON.stringify({ ...body, req_id: requestId }));
      } catch (error) {
        clearTimeout(timeoutId);
        this.pending.delete(requestId);
        const failure =
          error instanceof Error
            ? error
            : new Error("Could not send the Deriv request.");
        reject(failure);
        this.restartConnection(socket, failure);
      }
    });
  }

  on(messageType: string, handler: MessageHandler): () => void {
    const current = this.handlers.get(messageType) ?? new Set<MessageHandler>();
    current.add(handler);
    this.handlers.set(messageType, current);

    return () => {
      current.delete(handler);
      if (current.size === 0) {
        this.handlers.delete(messageType);
      }
    };
  }

  onConnectionState(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    handler(this.state);

    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  onConnectionError(handler: ConnectionErrorHandler): () => void {
    this.errorHandlers.add(handler);
    handler(this.lastConnectionError);
    return () => this.errorHandlers.delete(handler);
  }

  async subscribe<TResponse>(
    body: Record<string, unknown>,
    messageType: string,
    handler: MessageHandler,
  ): Promise<() => void> {
    if (this.manuallyClosed) throw new Error("Deriv connection was explicitly closed.");
    const id = this.nextSubscriptionId;
    this.nextSubscriptionId += 1;

    const managed: ManagedSubscription = {
      id,
      request: { ...body, subscribe: 1 },
      messageType,
      removeHandler: this.on(messageType, handler),
      retryAttempt: 0,
    };
    this.subscriptions.set(id, managed);

    try {
      await this.activateSubscription<TResponse>(managed);
    } catch (error) {
      if (this.manuallyClosed || !this.subscriptions.has(id)) {
        this.subscriptions.delete(id);
        managed.removeHandler();
        throw error;
      }
      // Subscriptions are safe to restore. Financial requests are never retained.
      this.scheduleSubscriptionRetry(managed, error);
    }

    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;

      this.subscriptions.delete(id);
      if (managed.retryTimer) clearTimeout(managed.retryTimer);
      managed.removeHandler();

      if (this.connected && managed.serverSubscriptionId) {
        void this.request({ forget: managed.serverSubscriptionId }).catch(
          () => undefined,
        );
      }
    };
  }

  close(): void {
    this.manuallyClosed = true;
    this.socketGeneration += 1;
    this.openingAbort?.abort();
    this.openingAbort = null;
    this.clearReconnectTimer();
    this.stopKeepalive();
    this.removeNetworkListeners();

    const socket = this.socket;
    this.socket = null;
    const openingSocket = this.openingSocket;
    this.openingSocket = null;
    if (
      openingSocket &&
      openingSocket !== socket &&
      openingSocket.readyState < WebSocket.CLOSING
    ) {
      openingSocket.close();
    }
    this.connectPromise = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(1000, "MbioTrade closed the connection.");
    }

    for (const subscription of this.subscriptions.values()) {
      if (subscription.retryTimer) clearTimeout(subscription.retryTimer);
      subscription.removeHandler();
    }
    this.subscriptions.clear();
    this.handlers.clear();
    this.rejectPending(new Error("Deriv connection closed."));
    this.emitConnectionError(null);
    this.emitState("closed");
  }

  private async openConnection(): Promise<void> {
    const generation = this.socketGeneration + 1;
    this.socketGeneration = generation;
    if (browserIsOffline()) {
      this.emitState("offline");
      this.scheduleReconnect();
      throw new Error("The browser is offline. Reconnection is scheduled.");
    }

    const reconnecting =
      this.everConnected || this.reconnectAttempt > 0 || this.state === "reconnecting";
    this.emitState(reconnecting ? "reconnecting" : "connecting");

    try {
      const url = await this.resolveConnectionUrl();
      if (!url) {
        throw new Error("Deriv did not provide a WebSocket URL.");
      }

      if (generation !== this.socketGeneration || this.manuallyClosed) {
        throw new Error("Deriv connection attempt was cancelled.");
      }
      const socket = await this.createSocket(url, generation);

      if (generation !== this.socketGeneration || this.manuallyClosed) {
        socket.close();
        throw new Error("Deriv connection attempt was cancelled.");
      }

      const subscriptionsToRestore = [...this.subscriptions.values()];
      this.socket = socket;
      this.everConnected = true;
      this.reconnectAttempt = 0;
      this.clearReconnectTimer();
      this.emitConnectionError(null);
      this.emitState("connected");
      this.startKeepalive();
      await this.restoreSubscriptions(subscriptionsToRestore);
    } catch (error) {
      if (!this.manuallyClosed && generation === this.socketGeneration) {
        this.emitConnectionError(
          error instanceof Error ? error.message : "Deriv connection failed.",
        );
        this.scheduleReconnect();
      }
      throw error;
    }
  }

  private async resolveConnectionUrl(): Promise<string | undefined> {
    const abort = new AbortController();
    this.openingAbort = abort;
    try {
      return await new Promise<string | undefined>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error("Deriv authentication URL request timed out."));
        }, REQUEST_TIMEOUT_MS);
        const cancelled = () => {
          cleanup();
          reject(new Error("Deriv connection attempt was cancelled."));
        };
        const cleanup = () => {
          clearTimeout(timeout);
          abort.signal.removeEventListener("abort", cancelled);
        };
        abort.signal.addEventListener("abort", cancelled, { once: true });
        Promise.resolve()
          .then(() => {
            if (abort.signal.aborted)
              throw new Error("Deriv connection attempt was cancelled.");
            return this.urlProvider?.();
          })
          .then(
            (url) => {
              cleanup();
              resolve(url);
            },
            (error: unknown) => {
              cleanup();
              reject(error);
            },
          );
      });
    } finally {
      if (this.openingAbort === abort) this.openingAbort = null;
    }
  }

  private createSocket(url: string, generation: number): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.openingSocket = socket;
      let opened = false;
      let settled = false;

      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        socket.close();
        reject(new Error("Deriv WebSocket connection timed out."));
      }, REQUEST_TIMEOUT_MS);

      socket.onopen = () => {
        if (settled) {
          return;
        }
        opened = true;
        settled = true;
        clearTimeout(timeoutId);
        if (this.openingSocket === socket) this.openingSocket = null;
        resolve(socket);
      };

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          socket.close();
          reject(new Error("Could not connect to Deriv."));
        }
      };

      socket.onclose = () => {
        clearTimeout(timeoutId);

        if (!opened && !settled) {
          settled = true;
          reject(new Error("Deriv closed the connection before it opened."));
          return;
        }

        if (opened) {
          this.handleUnexpectedClose(socket, generation);
        }
      };

      socket.onmessage = (event) => {
        if (
          !this.manuallyClosed &&
          generation === this.socketGeneration &&
          socket === this.socket &&
          socket.readyState === WebSocket.OPEN
        ) {
          this.handleMessage(event.data);
        }
      };
    });
  }

  private handleUnexpectedClose(socket: WebSocket, generation: number): void {
    if (
      this.manuallyClosed ||
      generation !== this.socketGeneration ||
      (this.socket && this.socket !== socket)
    ) {
      return;
    }

    this.socket = null;
    this.stopKeepalive();
    this.rejectPending(
      new Error("Deriv connection was interrupted. MbioTrade is reconnecting."),
    );
    this.scheduleReconnect();
  }

  private restartConnection(socket: WebSocket, error: Error): void {
    if (this.manuallyClosed || socket !== this.socket) return;
    this.emitConnectionError(error.message);
    this.handleUnexpectedClose(socket, this.socketGeneration);
    if (socket.readyState < WebSocket.CLOSING) socket.close();
  }

  private scheduleReconnect(): void {
    if (this.manuallyClosed || this.reconnectTimer) {
      return;
    }

    if (browserIsOffline()) {
      this.emitState("offline");
      return;
    }

    this.emitState("reconnecting");
    const baseDelay = Math.min(
      RECONNECT_MAX_DELAY_MS,
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt,
    );
    const jitter = Math.round(baseDelay * Math.random() * 0.25);
    const delay = Math.min(RECONNECT_MAX_DELAY_MS, baseDelay + jitter);
    this.reconnectAttempt = Math.min(this.reconnectAttempt + 1, 30);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => undefined);
    }, delay);
  }

  private async restoreSubscriptions(
    subscriptions: ManagedSubscription[],
  ): Promise<void> {
    for (const subscription of subscriptions) {
      if (!this.connected || !this.subscriptions.has(subscription.id)) return;
      // A newly registered subscription can itself be waiting for this connect.
      if (subscription.activationPromise) continue;
      if (subscription.retryTimer) clearTimeout(subscription.retryTimer);
      subscription.retryTimer = undefined;
      try {
        await this.activateSubscription(subscription);
      } catch (error) {
        this.scheduleSubscriptionRetry(subscription, error);
      }
    }
  }

  private scheduleSubscriptionRetry(
    subscription: ManagedSubscription,
    error: unknown,
  ): void {
    if (this.manuallyClosed || !this.subscriptions.has(subscription.id)) return;
    this.emitConnectionError(
      error instanceof Error ? error.message : "Deriv subscription failed.",
    );
    if (!this.connected || subscription.retryTimer) return;
    const delay = Math.min(
      RECONNECT_MAX_DELAY_MS,
      1000 * 2 ** subscription.retryAttempt,
    );
    subscription.retryAttempt = Math.min(subscription.retryAttempt + 1, 30);
    subscription.retryTimer = setTimeout(() => {
      subscription.retryTimer = undefined;
      if (!this.connected || !this.subscriptions.has(subscription.id)) return;
      void this.activateSubscription(subscription).catch((failure: unknown) => {
        this.scheduleSubscriptionRetry(subscription, failure);
      });
    }, delay);
  }

  private activateSubscription<TResponse>(
    subscription: ManagedSubscription,
  ): Promise<void> {
    if (subscription.activationPromise) return subscription.activationPromise;
    const attempt = (async () => {
      const response = await this.request<TResponse>(subscription.request);
      if (!this.subscriptions.has(subscription.id)) {
        const serverId = subscriptionId(response);
        if (serverId && this.connected)
          void this.request({ forget: serverId }).catch(() => undefined);
        return;
      }
      subscription.serverSubscriptionId = subscriptionId(response);
      subscription.retryAttempt = 0;
      if ([...this.subscriptions.values()].every((item) => item.retryAttempt === 0))
        this.emitConnectionError(null);
    })().finally(() => {
      if (subscription.activationPromise === attempt)
        subscription.activationPromise = undefined;
    });
    subscription.activationPromise = attempt;
    return attempt;
  }

  private startKeepalive(): void {
    this.stopKeepalive();

    this.keepaliveTimer = setInterval(() => {
      if (!this.connected || this.pingInFlight) {
        return;
      }

      this.pingInFlight = true;
      void this.request({ ping: 1 }, KEEPALIVE_TIMEOUT_MS)
        .catch(() => {
          const socket = this.socket;
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.close();
          }
        })
        .finally(() => {
          this.pingInFlight = false;
        });
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    this.pingInFlight = false;
  }

  private installNetworkListeners(): void {
    if (this.networkListenersInstalled || typeof window === "undefined") {
      return;
    }

    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    this.networkListenersInstalled = true;
  }

  private removeNetworkListeners(): void {
    if (!this.networkListenersInstalled || typeof window === "undefined") {
      return;
    }

    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    this.networkListenersInstalled = false;
  }

  private readonly handleOnline = () => {
    if (this.manuallyClosed || this.connected) {
      return;
    }

    this.clearReconnectTimer();
    this.reconnectAttempt = 0;
    void this.connect().catch(() => undefined);
  };

  private readonly handleOffline = () => {
    if (this.manuallyClosed) {
      return;
    }

    this.clearReconnectTimer();
    this.emitState("offline");

    const socket = this.socket;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close();
    }
  };

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private emitState(state: WebSocketConnectionState): void {
    if (this.state === state) {
      return;
    }

    this.state = state;
    for (const handler of this.stateHandlers) {
      handler(state);
    }
  }

  private emitConnectionError(message: string | null): void {
    if (message === this.lastConnectionError) return;
    this.lastConnectionError = message;
    for (const handler of this.errorHandlers) handler(message);
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    if (!isRecord(payload)) {
      return;
    }

    const requestId = Number(payload.req_id);
    if (Number.isFinite(requestId)) {
      const pending = this.pending.get(requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pending.delete(requestId);

        const error = requestError(payload);
        if (error) {
          pending.reject(error);
        } else {
          pending.resolve(payload);
        }
      }
    }

    const messageType = String(payload.msg_type ?? "");
    const handlers = this.handlers.get(messageType);
    handlers?.forEach((handler) => handler(payload));
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
