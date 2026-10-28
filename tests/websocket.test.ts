import assert from "node:assert/strict";
import {
  DerivWebSocketClient,
  type WebSocketConnectionState,
} from "../src/lib/deriv/websocket-client";

type MessageCallback = (event: { data: string }) => void;
type EventCallback = () => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static readonly instances: FakeWebSocket[] = [];

  readonly sent: Array<Record<string, unknown>> = [];
  readyState = FakeWebSocket.CONNECTING;
  onopen: EventCallback | null = null;
  onerror: EventCallback | null = null;
  onclose: EventCallback | null = null;
  onmessage: MessageCallback | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.readyState !== FakeWebSocket.CONNECTING) {
        return;
      }
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send(raw: string): void {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    this.sent.push(payload);

    if (payload.time === 1) {
      return;
    }

    const reqId = payload.req_id;
    const response: Record<string, unknown> = { req_id: reqId };

    if (payload.ticks) {
      response.msg_type = "tick";
      response.echo_req = { ticks: payload.ticks };
      response.tick = {
        epoch: 1_700_000_000 + FakeWebSocket.instances.length,
        quote: 1.08 + FakeWebSocket.instances.length / 100,
        symbol: payload.ticks,
      };
      response.subscription = {
        id: `tick-${FakeWebSocket.instances.length}`,
      };
    } else if (payload.proposal_open_contract) {
      response.msg_type = "proposal_open_contract";
      response.proposal_open_contract = {
        contract_id: payload.contract_id,
        current_spot: 1.085,
        profit: FakeWebSocket.instances.length * 1.25,
        is_sold: 0,
      };
      response.subscription = {
        id: `contract-${payload.contract_id}-${FakeWebSocket.instances.length}`,
      };
    } else if (payload.ping) {
      response.msg_type = "ping";
      response.ping = "pong";
    } else if (payload.forget) {
      response.msg_type = "forget";
      response.forget = payload.forget;
    }

    setTimeout(() => {
      if (this.readyState === FakeWebSocket.OPEN) {
        this.onmessage?.({ data: JSON.stringify(response) });
      }
    }, 0);
  }

  close(): void {
    if (this.readyState === FakeWebSocket.CLOSED) {
      return;
    }
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

Object.assign(globalThis, { WebSocket: FakeWebSocket });

async function run(): Promise<void> {
  const client = new DerivWebSocketClient();
  const states: WebSocketConnectionState[] = [];
  client.onConnectionState((state) => states.push(state));

  await client.connect("wss://example.test/public");
  let tickCount = 0;
  const unsubscribe = await client.subscribe({ ticks: "frxEURUSD" }, "tick", () => {
    tickCount += 1;
  });
  let contractUpdateCount = 0;
  let latestProfit = 0;
  const unsubscribeContract = await client.subscribe(
    { proposal_open_contract: 1, contract_id: 42 },
    "proposal_open_contract",
    (payload) => {
      const contract = payload.proposal_open_contract as
        Record<string, unknown> | undefined;
      if (Number(contract?.contract_id) === 42) {
        contractUpdateCount += 1;
        latestProfit = Number(contract?.profit ?? 0);
      }
    },
  );

  await wait(10);
  assert.equal(tickCount, 1);
  assert.equal(contractUpdateCount, 1);
  assert.ok(latestProfit > 0);

  const ambiguousRequest = client.request({ time: 1 });
  await wait(0);
  FakeWebSocket.instances[0].close();
  await assert.rejects(ambiguousRequest, /interrupted|closed/i);

  await wait(1_500);
  assert.ok(FakeWebSocket.instances.length >= 2);
  assert.ok(tickCount >= 2, "The tick subscription should be restored.");
  assert.ok(
    contractUpdateCount >= 2,
    "The open-contract P/L subscription should be restored.",
  );
  assert.ok(states.includes("reconnecting"));
  assert.equal(states.at(-1), "connected");

  const secondSocket = FakeWebSocket.instances.at(-1);
  assert.ok(secondSocket);
  assert.equal(
    secondSocket.sent.filter((request) => request.time === 1).length,
    0,
    "One-shot requests must not be replayed after reconnect.",
  );
  assert.ok(
    secondSocket.sent.some((request) => request.ticks === "frxEURUSD"),
    "Managed subscriptions must be replayed after reconnect.",
  );
  assert.ok(
    secondSocket.sent.some(
      (request) => request.proposal_open_contract === 1 && request.contract_id === 42,
    ),
    "Open-contract subscriptions must be replayed after reconnect.",
  );

  const countBeforeStaleMessage = tickCount;
  FakeWebSocket.instances[0].onmessage?.({
    data: JSON.stringify({
      msg_type: "tick",
      tick: { symbol: "frxEURUSD", quote: 99 },
    }),
  });
  assert.equal(
    tickCount,
    countBeforeStaleMessage,
    "A replaced socket cannot publish stale updates.",
  );

  unsubscribeContract();
  unsubscribe();
  client.close();

  const countBeforeClosedRequest = FakeWebSocket.instances.length;
  await assert.rejects(client.request({ ping: 1 }), /explicitly closed/i);
  assert.equal(
    FakeWebSocket.instances.length,
    countBeforeClosedRequest,
    "A request must not reopen an explicitly closed account session.",
  );

  const pendingClient = new DerivWebSocketClient();
  let releaseUrl!: (url: string) => void;
  const delayedUrl = new Promise<string>((resolve) => {
    releaseUrl = resolve;
  });
  const pendingConnect = pendingClient.connect(() => delayedUrl);
  pendingClient.close();
  releaseUrl("wss://example.test/cancelled");
  await assert.rejects(pendingConnect, /cancelled/i);
  assert.equal(
    FakeWebSocket.instances.length,
    countBeforeClosedRequest,
    "Disconnect during OTP retrieval must not open a late socket.",
  );

  const openingClient = new DerivWebSocketClient();
  const opening = openingClient.connect("wss://example.test/opening");
  await Promise.resolve();
  openingClient.close();
  await assert.rejects(opening, /closed|cancelled/i);
  assert.equal(FakeWebSocket.instances.at(-1)?.readyState, FakeWebSocket.CLOSED);
  console.log("MbioTrade v10 WebSocket lifecycle tests passed.");
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
