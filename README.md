# @trysac/frontend-error-capture

[![npm version](https://img.shields.io/npm/v/@trysac/frontend-error-capture)](https://www.npmjs.com/package/@trysac/frontend-error-capture)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A small, dependency-free TypeScript library for capturing frontend errors with parsed stacks, breadcrumbs, redacted messages and URLs, stable fingerprints, deduplication, rate limiting, and batching through an injected transport.

## Description

Front-end errors are invisible unless the page reports them, and a naive `window.onerror` handler can ship raw messages that contain emails, tokens and full URLs with session parameters, floods the backend when an error loops, and gives no stable way to group the same bug. Hosted SDKs solve this but are large and send data to a third party. This library normalises errors, redacts them, groups them by fingerprint and sends batches through a transport the application controls.

## Installation

```bash
npm install @trysac/frontend-error-capture
```

## Usage

```typescript
import { createReporter, install } from '@trysac/frontend-error-capture';

const reporter = createReporter({
  transport: { send: async (reports) => console.log(reports) },
});
const uninstall = install(window, reporter);

reporter.capture(new Error('demo'));
await reporter.flush();
uninstall();
```

## API

### Types

```ts
interface Frame { fn: string; file: string; line: number; col: number }
interface ErrorReport { type: string; message: string; frames: Frame[]; fingerprint: string; url?: string; breadcrumbs: { at: number; category: string; message: string }[]; context: Record<string, string>; release?: string; count: number; firstAt: number; lastAt: number }
```

### `parseStack(stack: string, opts?: { maxFrames?: number }): Frame[]`

Parses Chrome/V8 `"    at fn (file:line:col)"` and `"    at file:line:col"`, and Firefox/Safari `"fn@file:line:col"`. Unparseable lines are skipped. Input is cut to 50,000 characters before parsing. `maxFrames` defaults to 50.

### `fingerprint(type: string, frames: Frame[]): string`

Computes FNV-1a 32-bit over the UTF-8 bytes of `type` and the first three frames formatted as `<basename of file without query or hash>:<fn>`. Returns 8 lowercase hex digits.

### `redactText(text: string): string`

Applies redaction in this order: `Bearer` tokens (case-insensitive) become `Bearer [redacted]`; JWT-shaped three base64url segments starting with `eyJ` become `[jwt]`; email addresses become `[email]`; digit runs of 13 to 19 digits become `[number]`.

### `redactUrl(url: string): string`

Removes userinfo and fragment. Query parameters named `token`, `access_token`, `id_token`, `password`, `secret`, `key`, `api_key`, `code`, `session` or `sid` are set to `REDACTED` (case-insensitive). Invalid URLs become `"[invalid url]"`.

### `createReporter(opts: ReporterOptions): Reporter`

`ReporterOptions`: required `transport: { send(reports: ErrorReport[]): Promise<void> }`; optional `now` (default `Date.now`), `batchSize` (10), `dedupWindowMs` (60_000), `maxPerMinute` (30), `maxBreadcrumbs` (50), `maxQueue` (100), `release`, and `onEvent({ type, reports? })`.

`Reporter` has `capture(error, context?)`, `addBreadcrumb(message, category?)` and `flush()`. `capture` never throws; it normalises `Error` instances by `name` and `message`, strings as type `Error`, other values as type `NonError` with message `non-error value`. The URL supplied as `context.url` and all context values are redacted. Breadcrumb messages are redacted and cut to 200 characters; `category` defaults to `custom`.

Limits: messages are cut to 1,000 characters plus ` [truncated]`; stacks to 50,000 characters; frames default to 50; breadcrumbs default to 50 stored; queue default to 100 (oldest dropped and `queue_full` emitted); batches default to 10; rate limit is 30 reports per rolling 60,000 ms (`rate_limited` emitted for excess); dedup window is 60,000 ms and merges the same fingerprint into `count` and `lastAt`. A failed `transport.send` drops that batch and emits `send_failed`; there are no retries. `flush()` sends up to `batchSize` queued reports.

Throws `FrontendCaptureError` with `code: 'invalid_options'` when `transport.send` is not a function or any numeric limit is not a positive finite number.

### `install(target, reporter): () => void`

Registers `error` and `unhandledrejection` listeners on `target`. An `error` event captures `event.error`, or wraps `event.message` in an `Error`. An `unhandledrejection` is captured with type `UnhandledRejection`; the reason string or `Error.message` becomes the message, and an `Error` stack is preserved. The returned function removes both listeners.

### `FrontendCaptureError`

Error class with `name: 'FrontendCaptureError'` and `code: 'invalid_options'`, thrown by `createReporter` for invalid options.

## Why not a hosted SDK

The specification compares this library with a hosted SDK. This library has no third-party destination: the caller supplies the transport, redaction happens before any report is stored or sent, and the target and clock can be injected for tests. It does not provide source map resolution, session replay, performance metrics, retries, or a backend.

## Security

All strings that enter a report are redacted before storage or transmission. Stack input, frames, messages, breadcrumbs and queues are bounded. The reporter never throws on capture, even if the transport fails. See [docs/SECURITY.md](docs/SECURITY.md) for the threat model and limits.

## Contributing

The package is published as public OSS; changes are made in the repository.

## License

MIT
