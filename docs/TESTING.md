# Testing

## Tools

- The repository contains one test file: `test/index.test.ts`.
- It uses Vitest (`describe`, `expect`, `it`, `vi`) and imports the public API from `../src/index.js`.
- No other test files or test tools are present in the provided code.

## Commands

- The suite is defined in `test/index.test.ts` and is run with Vitest.
- The file uses an injected `now` clock, mock transports and a mock event target; it requires no network calls.

## Rules

- Tests exercise the public entry point `src/index.ts` through the `../src/index.js` import.
- Assertions cover return values, thrown errors and their codes, redaction output, fingerprints, reporter events and batch contents.
- Time-dependent tests inject `now`; transport and target tests use `vi.fn()` mocks.

## Tiers

- Only one tier exists in the repository: the Vitest unit suite in `test/index.test.ts`.
- No conformance test files or CI-only test files are present in the provided code.

## Reports

- `test/index.test.ts` is the only test file provided; no coverage configuration or report output is present in the provided code.

## What `test/index.test.ts` covers

- `parseStack`: Chrome/V8 frames with and without function names, URLs containing `@`, Firefox/Safari frames, anonymous frames, skipped unparseable lines, the 50,000-character truncation, and the `maxFrames` option.
- `fingerprint`: the documented hash for `render`/`main` frames, the documented payload hash, empty frames, basename without query or hash, and scoped CDN frames.
- `redactText`: Bearer tokens and emails, JWTs, 13-19 digit runs and boundary cases, and the documented redaction order.
- `redactUrl`: userinfo, fragment and sensitive parameters; case-insensitive parameter names; invalid URLs; URLs without query.
- `createReporter`: invalid limits and missing transport; normalization of `Error`, string and non-error values; message truncation; URL and context redaction; breadcrumb truncation and oldest-drop behavior; deduplication with `count`, `firstAt` and `lastAt`; `rate_limited`; batching and `flush`; `send_failed`; `queue_full`; synchronous transport throw; stack-frame URL redaction; non-string context values; throwing `onEvent`; detached `capture`; and dedup state kept across flushes.
- `install`: listener registration, `error` event capture, `unhandledrejection` type and message, and independent removal when installed twice on one target.
- `FrontendCaptureError`: `code: 'invalid_options'` and name.
