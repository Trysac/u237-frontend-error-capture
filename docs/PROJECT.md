# Project record: frontend-error-capture

## Objective

Capture frontend errors with parsed stacks, breadcrumbs, redacted messages and URLs, stable fingerprints, deduplication, rate limits and batching through an injected transport.

## Scope

In scope:

- Public functions `parseStack`, `fingerprint`, `redactText`, `redactUrl`, `createReporter` and `install`, plus the `FrontendCaptureError` class and the `Frame`, `ErrorReport`, `ReporterOptions` and `Reporter` types.
- Chrome/V8 and Firefox/Safari stack parsing with a 50,000-character input limit and a default `maxFrames` of 50.
- FNV-1a 32-bit fingerprints over the error type and top three frames.
- Text and URL redaction for the documented token formats and query parameter names.
- Deduplication, rate limiting, batching, breadcrumbs, queue limits, optional `release`, `onEvent` reporting, and an injected transport and clock.
- Global `error` and `unhandledrejection` listener installation with cleanup.

Out of scope:

- Source map resolution.
- Session replay.
- Performance metrics.
- Sending reports to a backend; the caller supplies the transport.
- Retries after a failed transport send.

## Timeline

| Date | Milestone |
|---|---|
| 2026 | Repository created from the factory utility template. |

## Effort metrics

Values are filled by the factory ledger and time log.

| Metric | Value | Source |
|---|---|---|
| Tokens (input / output) | 2061393 / 138618 | factory ledger |
| Hours (human) | pending measurement | time log |
| Cost (USD) | 0.1468 | factory ledger |

## Factory run u237 (measured from API usage)

| Date (UTC) | Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|---|
| 2026-11-10 | generation | deepseek-v4-pro | yes | 1879 | 27221 | 0 | 3584 | 0.0552 |
| 2026-11-10 | fix-1 | deepseek-flash | no | 33619 | 31467 | 0 | 1111808 | 0.0273 |
| 2026-11-10 | fix-2 | deepseek-flash | no | 8889 | 7121 | 0 | 38528 | 0.0057 |
| 2026-11-10 | audit | deepseek-flash | no | 24273 | 23780 | 0 | 290048 | 0.0188 |
| 2026-11-10 | fix-3 | deepseek-flash | no | 14027 | 18736 | 0 | 252544 | 0.0141 |
| 2026-11-10 | threat-model | deepseek-flash | no | 17357 | 11117 | 0 | 147584 | 0.0097 |
| 2026-11-10 | fix-4 | deepseek-flash | no | 10990 | 5997 | 0 | 88832 | 0.0055 |
| 2026-11-10 | docs | deepseek-flash | no | 17047 | 13179 | 0 | 384 | 0.0105 |

Total: $0.1468. Prices: deepseek line, as measured by its adapter. Providers serve the current version of each model id, so the date tells which version answered; versions, launch stages and price sources per line are in the factory's model register (docs/MODELS.md).
