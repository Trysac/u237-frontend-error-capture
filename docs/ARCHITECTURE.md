# Architecture

## Overview

`@trysac/frontend-error-capture` is a modular, dependency-free TypeScript library for capturing and reporting frontend errors. It focuses on privacy, reliability, and testability by redacting sensitive data before it leaves the page, deduplicating repeated errors, and respecting rate limits.

## Core Components

### Stack Parsing (`parseStack`)

Parses Chrome/V8 and Firefox/Safari stack formats. Input is truncated to 50,000 characters, and only up to 50 frames are returned by default. Unparseable lines are ignored.

### Fingerprinting (`fingerprint`)

Uses FNV-1a 32-bit hashing over the error type and the top three frames (basename of file without query, and function name). This provides stable grouping for the same error across occurrences.

### Redaction (`redactText` and `redactUrl`)

Text redaction removes Bearer tokens, JWTs, email addresses, and long digit runs. URL redaction removes userinfo and fragments and masks sensitive query parameters.

### Reporter (`createReporter`)

The reporter maintains a queue of error reports, breadcrumbs, and rate limit timestamps. It handles:
- **Deduplication**: merges reports with the same fingerprint within a sliding window.
- **Rate limiting**: counts distinct reports per 60 seconds; excess reports are dropped with an event.
- **Batching**: sends reports in batches of `batchSize` when the queue reaches that size or when `flush()` is called.
- **Breadcrumbs**: retained in memory up to `maxBreadcrumbs`, messages cut to 200 characters.
- **Transport**: sends batches through a user-supplied `transport.send`; failures drop the batch and emit `send_failed`.

### Installation (`install`)

Attaches `error` and `unhandledrejection` listeners to a target (e.g., `window`). The cleanup function removes both listeners.

## Data Flow

1. Error occurs (global listener or direct `capture`).
2. Error is normalized: `Error` instances use `name` and `message`, strings become type `'Error'`, other values become `'NonError'` with message `'non-error value'`. Unhandled rejections get type `'UnhandledRejection'`.
3. Stack frames are parsed (if available).
4. Fingerprint is computed.
5. Context values and URL are redacted.
6. If matching fingerprint exists within `dedupWindowMs`, its count is incremented and `lastAt` updated; otherwise, a new report is created after rate limit check.
7. Report is added to queue; if queue exceeds `maxQueue`, oldest is dropped and `queue_full` event emitted; if queue size reaches `batchSize`, flush is triggered.
8. `flush()` takes up to `batchSize` reports and calls `transport.send`; on failure, `send_failed` event is emitted.

## Security Considerations

- All sensitive data is redacted before storage or transmission.
- Breadcrumb messages are truncated to 200 characters.
- Stack trace input is limited to 50,000 characters.
- The reporter never throws on capture, preventing error loops from crashing the application.

## Testing

Unit tests cover all public functions, error paths, and edge cases (undefined stacks, throwing `toString`, missing query, multiple installs). Tests are deterministic with injected clock and transport mocks.
