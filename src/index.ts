/**
 * Public API of @trysac/frontend-error-capture.
 */

/** A parsed stack frame. */
export interface Frame {
  fn: string;
  file: string;
  line: number;
  col: number;
}

/** A report sent to the transport. */
export interface ErrorReport {
  type: string;
  message: string;
  frames: Frame[];
  fingerprint: string;
  url?: string;
  breadcrumbs: { at: number; category: string; message: string }[];
  context: Record<string, string>;
  release?: string;
  count: number;
  firstAt: number;
  lastAt: number;
}

/** Options for createReporter. */
export interface ReporterOptions {
  transport: { send(reports: ErrorReport[]): Promise<void> };
  now?: () => number;
  batchSize?: number;
  dedupWindowMs?: number;
  maxPerMinute?: number;
  maxBreadcrumbs?: number;
  maxQueue?: number;
  release?: string;
  onEvent?: (event: { type: string; reports?: number }) => void;
}

/** Reporter instance returned by createReporter. */
export interface Reporter {
  capture(error: unknown, context?: Record<string, string>): void;
  addBreadcrumb(message: string, category?: string): void;
  flush(): Promise<void>;
}

/** Error thrown for invalid reporter options. */
export class FrontendCaptureError extends Error {
  public readonly code = "invalid_options";
  constructor(message: string) {
    super(message);
    this.name = "FrontendCaptureError";
  }
}

const MAX_STACK_LENGTH = 50_000;
const DEFAULT_MAX_FRAMES = 50;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_DEDUP_WINDOW_MS = 60_000;
const DEFAULT_MAX_PER_MINUTE = 30;
const DEFAULT_MAX_BREADCRUMBS = 50;
const DEFAULT_MAX_QUEUE = 100;
const MAX_BREADCRUMB_MESSAGE_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 1_000;
const SENSITIVE_QUERY_PARAMS = new Set([
  "token",
  "access_token",
  "id_token",
  "password",
  "secret",
  "key",
  "api_key",
  "code",
  "session",
  "sid",
]);

function truncateMessage(message: string): string {
  return message.length > MAX_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_MESSAGE_LENGTH)} [truncated]`
    : message;
}

/** Coerces an arbitrary value to a string without ever throwing. */
function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

/** Redacts a frame location: URLs get URL redaction, opaque locations get text redaction. */
function redactLocation(file: string): string {
  try {
    new URL(file);
    return redactUrl(file);
  } catch {
    return redactText(file);
  }
}

function basenameWithoutQuery(file: string): string {
  const withoutQuery = file.split("?")[0]?.split("#")[0] ?? file;
  const parts = withoutQuery.split("/");
  return parts[parts.length - 1] ?? withoutQuery;
}

/**
 * Parses a stack trace string into frames.
 * Supports Chrome/V8 "    at fn (file:line:col)" and "    at file:line:col",
 * and Firefox/Safari "fn@file:line:col". Unparseable lines are skipped.
 * Input longer than 50,000 characters is truncated before parsing.
 *
 * @param stack - The stack trace string.
 * @param opts - Optional configuration.
 * @param opts.maxFrames - Maximum number of frames to return (default: 50).
 * @returns Array of parsed frames.
 */
export function parseStack(stack: string, opts?: { maxFrames?: number }): Frame[] {
  const maxFrames = opts?.maxFrames ?? DEFAULT_MAX_FRAMES;
  const truncated = stack.slice(0, MAX_STACK_LENGTH);
  const lines = truncated.split("\n");
  const frames: Frame[] = [];
  // Chrome/V8: "fn (file:line:col)" or "file:line:col", after the leading "at ".
  const parseChrome = (afterAt: string): Frame | undefined => {
    const withParen = /^(.+?)\s+\((.+):(\d+):(\d+)\)$/.exec(afterAt);
    if (withParen) {
      const [, fn, file, lineStr, colStr] = withParen;
      if (fn === undefined || file === undefined) return undefined;
      return { fn, file, line: Number(lineStr), col: Number(colStr) };
    }
    const withoutParen = /^(.+):(\d+):(\d+)$/.exec(afterAt);
    if (withoutParen) {
      const [, file, lineStr, colStr] = withoutParen;
      if (file === undefined) return undefined;
      return { fn: "<anonymous>", file, line: Number(lineStr), col: Number(colStr) };
    }
    return undefined;
  };

  // Firefox/Safari: fn@file:line:col
  const parseFirefox = (trimmed: string): Frame | undefined => {
    const atIndex = trimmed.indexOf("@");
    if (atIndex === -1) return undefined;
    const fnPart = trimmed.slice(0, atIndex).trim();
    const rest = trimmed.slice(atIndex + 1).trim();
    const match = /^(.+):(\d+):(\d+)$/.exec(rest);
    if (!match) return undefined;
    const [, file, lineStr, colStr] = match;
    if (file === undefined) return undefined;
    return { fn: fnPart || "<anonymous>", file, line: Number(lineStr), col: Number(colStr) };
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    // Prefer the Chrome/V8 form when the line starts with "at ", so URLs that
    // contain "@" (scoped CDN bundles) are not mistaken for Firefox frames.
    let frame: Frame | undefined;
    if (trimmed.startsWith("at ")) {
      frame = parseChrome(trimmed.slice(3).trim());
    }
    if (frame === undefined) {
      frame = parseFirefox(trimmed);
    }
    if (frame === undefined) continue;
    frames.push(frame);
    if (frames.length >= maxFrames) break;
  }
  return frames;
}

/**
 * Computes a stable FNV-1a 32-bit fingerprint for an error type and its top frames.
 * Uses the format `${type}\n${top3frames}` where each frame is `${basename}:${fn}`.
 * Returns 8 lowercase hex characters.
 *
 * @param type - Error type (e.g., "TypeError").
 * @param frames - Parsed stack frames (first up to 3 used).
 * @returns Fingerprint string.
 */
export function fingerprint(type: string, frames: Frame[]): string {
  const topFrames = frames
    .slice(0, 3)
    .map((frame) => `${basenameWithoutQuery(frame.file)}:${frame.fn}`);
  const payload = [type, ...topFrames].join("\n");
  const bytes = new TextEncoder().encode(payload);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Redacts sensitive information from a text string.
 * Order: Bearer tokens, JWTs, email addresses, long digit runs (13-19 digits).
 *
 * @param text - The text to redact.
 * @returns Redacted text.
 */
export function redactText(text: string): string {
  let result = text;
  // Bearer tokens (case-insensitive)
  result = result.replace(/Bearer\s+([A-Za-z0-9._~+/-]+=*)/gi, "Bearer [redacted]");
  // JWTs: three base64url segments starting with eyJ
  result = result.replace(/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]");
  // Email addresses
  result = result.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]");
  // Long digit runs 13-19 digits
  result = result.replace(/\b\d{13,19}\b/g, "[number]");
  return result;
}

/**
 * Redacts sensitive parts of a URL: removes userinfo and fragment,
 * sets sensitive query parameter values to "REDACTED".
 * Invalid URLs become "[invalid url]".
 *
 * @param url - The URL to redact.
 * @returns Redacted URL string.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    const params = parsed.searchParams;
    for (const key of [...params.keys()]) {
      if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
        params.set(key, "REDACTED");
      }
    }
    parsed.search = params.toString();
    return parsed.toString();
  } catch {
    return "[invalid url]";
  }
}

/**
 * Creates a reporter that captures errors, deduplicates, rate-limits, batches,
 * and redacts sensitive data before sending through the provided transport.
 *
 * @param opts - Configuration options.
 * @returns Reporter instance.
 * @throws {FrontendCaptureError} If any numeric limit is <= 0 or transport is missing/invalid.
 */
export function createReporter(opts: ReporterOptions): Reporter {
  const {
    transport,
    now = Date.now,
    batchSize = DEFAULT_BATCH_SIZE,
    dedupWindowMs = DEFAULT_DEDUP_WINDOW_MS,
    maxPerMinute = DEFAULT_MAX_PER_MINUTE,
    maxBreadcrumbs = DEFAULT_MAX_BREADCRUMBS,
    maxQueue = DEFAULT_MAX_QUEUE,
    release,
    onEvent,
  } = opts;

  // Validation
  if (!transport || typeof transport.send !== "function") {
    throw new FrontendCaptureError("transport.send must be a function");
  }
  const numericLimits = [batchSize, dedupWindowMs, maxPerMinute, maxBreadcrumbs, maxQueue];
  if (numericLimits.some((v) => typeof v !== "number" || v <= 0 || !Number.isFinite(v))) {
    throw new FrontendCaptureError(
      "batchSize, dedupWindowMs, maxPerMinute, maxBreadcrumbs, and maxQueue must be positive numbers",
    );
  }

  // Internal state
  const queue: ErrorReport[] = [];
  // Dedup ledger, independent of the queue so it survives flushes.
  const recent = new Map<string, ErrorReport>();
  const rateLimitTimes: number[] = [];
  const breadcrumbs: { at: number; category: string; message: string }[] = [];

  const emit = (type: string, reports?: number) => {
    try {
      onEvent?.({ type, ...(reports !== undefined ? { reports } : {}) });
    } catch {
      // A user-supplied hook must never break the reporter.
    }
  };

  const doFlush = async (): Promise<void> => {
    if (queue.length === 0) return;
    const batch = queue.splice(0, Math.min(batchSize, queue.length));
    try {
      await transport.send(batch);
    } catch {
      emit("send_failed", batch.length);
    }
  };

  const enqueue = (report: ErrorReport): void => {
    if (queue.length >= maxQueue) {
      queue.shift();
      emit("queue_full");
    }
    queue.push(report);
    if (queue.length >= batchSize) {
      // Fire and forget flush; the batch is taken from the queue by splice.
      void doFlush();
    }
  };

  const normalizeError = (error: unknown): { type: string; message: string; frames: Frame[] } => {
    if (error instanceof Error) {
      const frames = parseStack(error.stack ?? "", { maxFrames: DEFAULT_MAX_FRAMES }).map(
        (frame) => ({
          fn: redactText(frame.fn),
          file: redactLocation(frame.file),
          line: frame.line,
          col: frame.col,
        }),
      );
      return { type: error.name, message: error.message, frames };
    }
    if (typeof error === "string") {
      return { type: "Error", message: error, frames: [] };
    }
    return { type: "NonError", message: "non-error value", frames: [] };
  };

  const reporter: Reporter = {
    capture(error: unknown, context?: Record<string, string>): void {
      // capture() is documented to never throw: no caller-supplied value
      // (context values, toString, stack getter) or hook may escape.
      try {
        const nowTime = now();
        const normalized = normalizeError(error);
        const fp = fingerprint(normalized.type, normalized.frames);

        // Drop ledger entries whose dedup window has elapsed.
        for (const [key, entry] of recent) {
          if (nowTime - entry.firstAt >= dedupWindowMs) {
            recent.delete(key);
          }
        }

        // Dedup against the ledger, not the queue: a sent report must keep
        // merging later duplicates instead of starting a fresh count.
        const existing = recent.get(fp);
        if (existing) {
          existing.count += 1;
          existing.lastAt = nowTime;
          // If the report was already sent, re-queue it so the updated count
          // reaches the transport. If it is still pending it is already queued.
          if (!queue.includes(existing)) {
            enqueue(existing);
          }
          return;
        }

        const rawUrl = context?.url;
        const url = rawUrl ? redactUrl(safeString(rawUrl)) : undefined;
        const redactedContext: Record<string, string> = {};
        if (context) {
          for (const [key, value] of Object.entries(context)) {
            if (key === "url") continue;
            redactedContext[key] = redactText(safeString(value));
          }
        }
        const currentBreadcrumbs = [...breadcrumbs];

        // Rate limit check
        const cutoff = nowTime - 60_000;
        while (rateLimitTimes.length > 0) {
          const oldest = rateLimitTimes[0];
          if (oldest === undefined || oldest > cutoff) break;
          rateLimitTimes.shift();
        }
        if (rateLimitTimes.length >= maxPerMinute) {
          emit("rate_limited");
          return;
        }
        rateLimitTimes.push(nowTime);

        const report: ErrorReport = {
          type: normalized.type,
          message: truncateMessage(redactText(normalized.message)),
          frames: normalized.frames,
          fingerprint: fp,
          ...(url !== undefined ? { url } : {}),
          breadcrumbs: currentBreadcrumbs,
          context: redactedContext,
          ...(release !== undefined ? { release } : {}),
          count: 1,
          firstAt: nowTime,
          lastAt: nowTime,
        };

        recent.set(fp, report);
        enqueue(report);
      } catch {
        // Swallow every failure: capturing an error must never raise one.
      }
    },

    addBreadcrumb(message: string, category = "custom"): void {
      const nowTime = now();
      const cut = redactText(safeString(message)).slice(0, MAX_BREADCRUMB_MESSAGE_LENGTH);
      breadcrumbs.push({ at: nowTime, category, message: cut });
      if (breadcrumbs.length > maxBreadcrumbs) {
        breadcrumbs.shift();
      }
    },

    flush: doFlush,
  };

  return reporter;
}

/**
 * Installs global error and unhandledrejection listeners on the given target.
 * Returns a function that removes both listeners.
 *
 * @param target - EventTarget-like object with addEventListener/removeEventListener.
 * @param reporter - Reporter instance.
 * @returns Cleanup function.
 */
export function install(
  target: {
    addEventListener(type: string, fn: (event: unknown) => void): void;
    removeEventListener(type: string, fn: (event: unknown) => void): void;
  },
  reporter: Reporter,
): () => void {
  const onError = (event: unknown) => {
    if (!event || typeof event !== "object") return;
    const e = event as { error?: unknown; message?: unknown };
    if (e.error !== undefined) {
      reporter.capture(e.error);
    } else if (e.message !== undefined) {
      reporter.capture(new Error(String(e.message)));
    }
  };

  const onUnhandledRejection = (event: unknown) => {
    const reason =
      event && typeof event === "object" && "reason" in event
        ? (event as { reason?: unknown }).reason
        : undefined;
    const message =
      typeof reason === "string"
        ? reason
        : reason instanceof Error
          ? reason.message
          : "non-error value";
    const error = new Error(message);
    error.name = "UnhandledRejection";
    if (reason instanceof Error && reason.stack) {
      error.stack = reason.stack;
    }
    reporter.capture(error);
  };

  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
