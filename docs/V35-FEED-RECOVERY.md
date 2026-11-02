# Market data resilience — background and troubleshooting

Gold and the five forex pairs use public Deriv WebSocket candles. BTCUSD uses public Kraken spot candles. The two feeds are separate. HTTP 503 from a market endpoint means the required real market data could not be verified.

## Request pacing and caching

- Deriv history requests use pacing instead of sending six timeframe subscriptions in one burst.
- Repeated requests for the same market share an outstanding fetch and a short-lived verified result.
- An incomplete or failed response is never promoted to valid cached market data.
- A brief failure cooldown reduces upstream request bursts.
- Provider failures include a nonsensitive description of the rejected instrument or timeframe.

## Check locally

```bash
npm ci
npm run dev
curl -sS 'http://localhost:3000/api/market?symbol=XAUUSD' | python3 -m json.tool
curl -sS 'http://localhost:3000/api/market?symbol=BTCUSD' | python3 -m json.tool
```

Gold and forex markets have trading sessions. Bitcoin typically trades continuously, so one feed can be available while another is not. A successful HTTP response means verified data was delivered, not that a BUY or SELL setup is present. Strong strategy conditions must still pass.

Short caches are per running server instance. Serverless deployments may have many instances, and public providers can enforce their own connection or traffic allowances. Always test real provider data separately from compilation and automated unit tests.
