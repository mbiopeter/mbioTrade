import assert from "node:assert/strict";
import {
  DerivRequestError,
  DerivWebSocketClient,
} from "../src/lib/deriv/websocket-client";
import { DerivPublicClient, subscribeTicks } from "../src/lib/deriv-public";
import { WorkerAccount } from "../worker/account";

const realTimeout = globalThis.setTimeout;
const fastTimeout = ((
  callback: (...args: unknown[]) => void,
  milliseconds?: number,
  ...args: unknown[]
) =>
  realTimeout(callback, Math.min(milliseconds ?? 0, 20), ...args)) as typeof setTimeout;
Object.assign(globalThis, { setTimeout: fastTimeout });

type Behavior = "open" | "fail" | "stall";
class RetrySocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: RetrySocket[] = [];
  static behaviors: Behavior[] = [];
  readonly sent: Record<string, unknown>[] = [];
  readyState = RetrySocket.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(readonly url: string) {
    RetrySocket.instances.push(this);
    const behavior = RetrySocket.behaviors.shift() ?? "open";
    if (behavior === "stall") return;
    realTimeout(() => {
      if (this.readyState !== RetrySocket.CONNECTING) return;
      if (behavior === "fail") this.onerror?.();
      else {
        this.readyState = RetrySocket.OPEN;
        this.onopen?.();
      }
    }, 1);
  }

  send(raw: string): void {
    const request = JSON.parse(raw) as Record<string, unknown>;
    this.sent.push(request);
    if (request.buy || request.ignore) return;
    const response = request.reject
      ? {
          req_id: request.req_id,
          error: {
            code: "StakeTooSmall",
            message: "Minimum stake is 5.00 USD.",
            details: { min_stake: 5 },
          },
        }
      : request.ticks
        ? {
            req_id: request.req_id,
            msg_type: "tick",
            tick: {
              symbol: request.ticks,
              epoch: Math.floor(Date.now() / 1000),
              quote: 1.12,
            },
            subscription: { id: `ticks-${RetrySocket.instances.length}` },
          }
        : { req_id: request.req_id, msg_type: "ping", ping: "pong" };
    realTimeout(() => {
      if (this.readyState === RetrySocket.OPEN)
        this.onmessage?.({ data: JSON.stringify(response) });
    }, 1);
  }

  close(): void {
    if (this.readyState === RetrySocket.CLOSED) return;
    this.readyState = RetrySocket.CLOSED;
    this.onclose?.();
  }
}
Object.assign(globalThis, { WebSocket: RetrySocket });
const clients: Array<{ close: () => void }> = [];
async function until(check: () => boolean, message: string): Promise<void> {
  const start = Date.now();
  while (!check()) {
    assert.ok(Date.now() - start < 2000, message);
    await new Promise<void>((resolve) => realTimeout(resolve, 2));
  }
}
const pause = (ms: number) => new Promise<void>((resolve) => realTimeout(resolve, ms));

async function run(): Promise<void> {
  const initial = new DerivWebSocketClient();
  clients.push(initial);
  let providerCalls = 0;
  const failures: Array<string | null> = [];
  initial.onConnectionError((error) => failures.push(error));
  await assert.rejects(
    initial.connect(async () => {
      providerCalls += 1;
      if (providerCalls < 3) throw new Error("OTP service temporarily unavailable");
      return `wss://example.test/otp-${providerCalls}`;
    }),
    /temporarily unavailable/,
  );
  await until(
    () => initial.connected,
    "initial OTP failures retry without a new user action",
  );
  assert.equal(providerCalls, 3, "each attempt obtains a fresh authenticated URL");
  assert.ok(failures.includes("OTP service temporarily unavailable"));
  assert.equal(failures.at(-1), null, "successful connection clears the retry cause");
  initial.close();

  const hungUrl = new DerivWebSocketClient();
  clients.push(hungUrl);
  let urlAttempts = 0;
  await assert.rejects(
    hungUrl.connect(() => {
      urlAttempts += 1;
      return urlAttempts === 1
        ? new Promise<string>(() => undefined)
        : Promise.resolve("wss://example.test/url-recovered");
    }),
    /timed out/,
  );
  await until(
    () => hungUrl.connected,
    "a stalled URL provider does not block all future attempts",
  );
  assert.equal(urlAttempts, 2);
  hungUrl.close();

  const handshake = new DerivWebSocketClient();
  clients.push(handshake);
  RetrySocket.behaviors = ["stall", "fail", "open"];
  await assert.rejects(handshake.connect("wss://example.test/handshake"), /timed out/);
  await until(() => handshake.connected, "handshake timeouts and errors both retry");
  assert.equal(
    RetrySocket.instances.filter((socket) => socket.readyState === RetrySocket.OPEN)
      .length,
    1,
  );
  handshake.close();

  const stopped = new DerivWebSocketClient();
  clients.push(stopped);
  let stoppedCalls = 0;
  await assert.rejects(
    stopped.connect(async () => {
      stoppedCalls += 1;
      throw new Error("invalid key");
    }),
    /invalid key/,
  );
  stopped.close();
  await pause(60);
  assert.equal(
    stoppedCalls,
    1,
    "Disconnect cancels even an invalid-credential retry loop",
  );

  const cancelledProvider = new DerivWebSocketClient();
  clients.push(cancelledProvider);
  const pending = cancelledProvider.connect(() => new Promise<string>(() => undefined));
  cancelledProvider.close();
  await assert.rejects(pending, /cancelled/);

  const requestTimeout = new DerivWebSocketClient();
  clients.push(requestTimeout);
  await requestTimeout.connect("wss://example.test/request-timeout");
  let ticks = 0;
  const unsubscribe = await requestTimeout.subscribe(
    { ticks: "frxEURUSD" },
    "tick",
    () => {
      ticks += 1;
    },
  );
  const countBefore = RetrySocket.instances.length;
  const timedOutSocket = RetrySocket.instances.at(-1)!;
  await assert.rejects(
    requestTimeout.request({ buy: "proposal-1", price: 20 }, 5),
    /timed out/,
  );
  const ticksAfterTimeout = ticks;
  timedOutSocket.onmessage?.({
    data: JSON.stringify({
      msg_type: "tick",
      tick: { symbol: "frxEURUSD", quote: 99 },
    }),
  });
  assert.equal(
    ticks,
    ticksAfterTimeout,
    "queued messages from a timed-out socket are ignored during backoff",
  );
  await until(
    () =>
      RetrySocket.instances.length > countBefore &&
      requestTimeout.connected &&
      ticks >= 2,
    "a request timeout replaces the stalled socket and restores safe subscriptions",
  );
  const afterTimeout = RetrySocket.instances.slice(countBefore);
  assert.equal(
    afterTimeout.reduce(
      (sum, socket) => sum + socket.sent.filter((request) => request.buy).length,
      0,
    ),
    0,
    "a timed-out buy must NEVER be replayed after reconnection",
  );
  await assert.rejects(requestTimeout.request({ reject: 1 }), (error: unknown) => {
    assert.ok(error instanceof DerivRequestError);
    assert.equal(error.code, "StakeTooSmall");
    assert.deepEqual(error.details, { min_stake: 5 });
    return true;
  });
  const interruptedSocket = RetrySocket.instances.at(-1)!;
  const ticksBeforeClose = ticks;
  interruptedSocket.close();
  interruptedSocket.onmessage?.({
    data: JSON.stringify({
      msg_type: "tick",
      tick: { symbol: "frxEURUSD", quote: 999 },
    }),
  });
  assert.equal(
    ticks,
    ticksBeforeClose,
    "a closed socket cannot repopulate offline data before the next attempt",
  );
  await until(
    () => requestTimeout.connected && ticks > ticksBeforeClose,
    "the fresh connection still delivers its restored stream",
  );
  unsubscribe();
  requestTimeout.close();

  const publicClient = new DerivPublicClient();
  clients.push(publicClient);
  RetrySocket.behaviors = ["fail", "fail", "open"];
  let recoveredTicks = 0;
  const stopTicks = await subscribeTicks(publicClient, "frxEURUSD", () => {
    recoveredTicks += 1;
  });
  await until(
    () => recoveredTicks > 0,
    "public tick subscriptions survive initial connection failures",
  );
  assert.equal(
    RetrySocket.instances.at(-1)?.sent.filter((request) => request.ticks).length,
    1,
    "recovering an initial subscription does not install duplicate streams",
  );
  stopTicks();
  publicClient.close();
  await assert.rejects(publicClient.request({ ping: 1 }), /explicitly closed/);

  const originalFetch = globalThis.fetch;
  let otpRequests = 0;
  Object.assign(globalThis, {
    fetch: async () => {
      otpRequests += 1;
      return new Response(
        JSON.stringify(
          otpRequests === 1
            ? { message: "temporary OTP failure" }
            : {
                data: {
                  url: "wss://api.derivws.com/trading/v1/options/ws/demo?otp=mock",
                },
              },
        ),
        { status: otpRequests === 1 ? 503 : 200 },
      );
    },
  });
  try {
    const workerAccount = new WorkerAccount({
      token: "MOCK_TOKEN_NOT_REAL",
      appId: "MockApp12",
      accountId: "VRTC12",
      accountMode: "demo",
      rememberSession: false,
    });
    clients.push(workerAccount);
    await assert.rejects(workerAccount.connect(), /authentication failed/);
    await until(
      () => workerAccount.connected,
      "worker account recovers after startup authentication transport failure",
    );
    assert.equal(otpRequests, 2);
    workerAccount.close();
  } finally {
    Object.assign(globalThis, { fetch: originalFetch });
  }
  console.log(
    "Initial connection, timeout recovery, cancellation and no-order-replay regressions passed.",
  );
}
void run()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    clients.forEach((client) => client.close());
    Object.assign(globalThis, { setTimeout: realTimeout });
  });
