# MbioTrade v14 security and state boundaries

## Credentials

The browser App ID is a normal preference. A remembered API key is kept in a separate
localStorage credential record, enabled by default as requested for v10. It is validated
before use and excluded from preferences, JSON exports, Google backups and source
archives. A prior remembered v9 session can migrate into the current credential record.
Forget saved key removes current and legacy copies.

Persistent browser storage is not an encrypted vault: code on the same origin and
someone with access to the browser profile can read it. Use a trusted device. Storage
may be unavailable or cleared by browser policy; the interface reports when a key could
not be remembered. Disable remembrance for memory-only use. Disconnect does not remove a
remembered key.

The server worker reads credentials from server-only environment variables. Never use
`NEXT_PUBLIC_` for secrets, commit `.env.worker`, paste real credentials in workspace
JSON or include a live configuration in a shared ZIP. Google access tokens remain in
memory. The OTP endpoints do not cache session URLs.

## Position authority

Broker-confirmed positions, IDs, values and closures drive the account UI. Local
journals provide metadata only after matching a broker contract. Account ID and
demo/real mode scope active data and cached metadata. Disposed connection generations
cannot overwrite a newly selected account. Portfolio omissions are investigated through
contract queries before treating a position as closed.

## Execution

Both account types use the same execution path and risk gates. Accepted ticket
multipliers and minimum trade amounts are revalidated at the API boundary. Automatic
orders wait for verified account history and exposure. New orders send broker monetary
limit orders, and an uncertain buy response is never replayed. A sell racing with an
external close is reconciled against the broker outcome.

Automatic browser submissions use same-origin Web Locks and a per-account attempt
journal. These do not coordinate separate devices or server processes. Configure one
automatic owner per account, and stop the old worker before starting an updated worker
in automatic mode. No database or distributed locking service is included.

## Imports and backups

All imports are schema-sanitized. Unknown preference fields, including historical
credential fields, are stripped. Imported open records do not authorize orders and never
become active without Deriv verification. Strategy labels and chart plan levels are
workspace metadata, not claims returned by the broker.

## Runtime

The website is hostable on Vercel. Continuous no-browser analysis needs the optional
long-running worker (Vercel Daemons beta or another always-on server). Ordinary request
functions do not provide a permanent process. Process-local worker signal memory is lost
on restart; the runner observes startup/connection readiness and requires a single
execution owner. Server logs never intentionally print API keys or authenticated OTP
URLs.
