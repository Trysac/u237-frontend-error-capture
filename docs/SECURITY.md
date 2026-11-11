# Security

## Threat Model

This library processes untrusted error data from browser events and direct `capture` calls. The defended threats are leaks of sensitive tokens, emails, numeric identifiers and URL credentials or parameters; unbounded error volume or payload size; and failures in error reporting destabilising the host application.

### Defended

- `redactText` is applied to messages, breadcrumb messages, context values and frame function names in this order: Bearer tokens to `Bearer [redacted]`, JWT-shaped values to `[jwt]`, email addresses to `[email]`, and 13-19 digit runs to `[number]`.
- `context.url` and URL-shaped frame locations use `redactUrl`: userinfo and fragment are removed, and query parameters named `token`, `access_token`, `id_token`, `password`, `secret`, `key`, `api_key`, `code`, `session` or `sid` are set to `REDACTED` case-insensitively. Invalid URLs become `[invalid url]`. Opaque frame locations use text redaction.
- Messages are cut to 1,000 characters plus ` [truncated]`; stack input is cut to 50,000 characters; `parseStack` defaults to 50 frames; breadcrumb messages are cut to 200 characters; `maxBreadcrumbs` defaults to 50; `maxQueue` defaults to 100 and drops the oldest entry with `queue_full`; `batchSize` defaults to 10; `maxPerMinute` defaults to 30 reports per rolling 60,000 ms and emits `rate_limited`; `dedupWindowMs` defaults to 60,000 ms.
- `capture` never throws. It catches failures from user-supplied `toString`, non-string context values are coerced with `String` in a guarded helper, `onEvent` hook failures are swallowed, and a failed `transport.send` drops the batch and emits `send_failed`.
- The implementation uses standard built-ins only and has no runtime dependencies.

### Not defended

- Source map resolution.
- Session replay and performance metrics.
- Sending, backend storage and retries; the caller supplies `transport` and a failed send is dropped.
- Sensitive data that does not match the redaction patterns or the listed query parameter names is not detected by this library.

## Reporting Vulnerabilities

Report security issues to the repository maintainers.
