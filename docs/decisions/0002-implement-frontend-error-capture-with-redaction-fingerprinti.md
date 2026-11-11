# Implement frontend error capture with redaction, fingerprinting, and batching

Status: accepted (generated, pending human review)

## Context

The spec requires a dependency-free TypeScript library to capture frontend errors with redaction before they leave the page, stable grouping, and rate-limited batching.

## Decision

Build a comprehensive utility with parseStack, fingerprint (FNV-1a), redactText/redactUrl, createReporter (with dedup, rate limit, batching, breadcrumbs), and install for global handlers. All sensitive data is redacted; errors never throw from capture.

## Consequences

The library is small, testable with injected clock/transport, and safe for use in browsers and Node.
