# Security Summary

**Reviewed Files**: 19
**Issues Resolved**: 5

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Missing API Rate Limiting & Payload Caps | `server.ts` | 274 | AI generation, provider connection test, and geolocation endpoints lacked per-user/per-IP request throttling and chat input size checks. | Medium | Fixed | Added sliding-window per-UID/IP rate limiters (`createSlidingWindowRateLimiter`), `Retry-After` responses, response security headers, and strict `validateChatPayloadBounds` checks on `/api/chat` and `/api/chat/stream`. |
| Unbounded Numeric Fields in Firestore Rules | `firestore.rules` | 100 | `messageCount`, `conversationCount`, `reminderMinutes`, `durationSeconds`, and `latencyMs` checked numeric type without non-negative lower/upper bounds, and `/admins/{adminUid}` lacked a blueprint entry. | Low | Fixed | Added `>= 0` and realistic upper bounds across all validators in `firestore.rules` and added `AdminAllowlist` / `/admins/{adminUid}` to `firebase-blueprint.json`. |
| Fallback Triggered on Client 400 Errors | `server.ts` | 509 | `generateWithModelFallback` only skipped fallback on 401/403 auth failures, allowing malformed 400 requests to retry across models. | Low | Fixed | Added `isNonFallbackClientError` blocking fallback on all `400`, `401`, and `403` errors across both helper routes and chat/stream endpoints. |
| Missing Opt-In Gate & Scrubbing on Analytics | `src/utils/analytics.ts` | 73 | Analytics usage events needed strict consent gating and explicit PII/secret scrubbing before invoking Firebase Analytics. | Medium | Fixed | Added opt-in `analyticsConsent` (`false` by default) in Settings and `sanitizeAnalyticsPayload()` stripping emails, tokens, keys, prompts, and user identifiers. |
| Missing Secret & Bundle Exclusions | `.gitignore` | 10 | `.gitignore` omitted mobile signing keystores, native Firebase service configs, Vercel build cache, and Git bundle files (note: `aadesh-ai-v2.5.bundle` is present in workspace root without a local `.git` directory). | Low | Needs Follow-Up | Added `*.bundle`, `*.jks`, `*.keystore`, `google-services.json`, `GoogleService-Info.plist`, `.vercel/`, and `DRAFT_firestore.rules` to `.gitignore`; verify remote GitHub repository history and remove `aadesh-ai-v2.5.bundle` if unneeded. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| API Keys & Secrets | `server.ts` | `GEMINI_API_KEY`, `GROQ_API_KEY`, and `OPENROUTER_API_KEY` are read solely from server `process.env`, redacted in all error messages via `sanitizeProviderSecretText`, and excluded from client `VITE_*` variables. |
| Authentication & Role Isolation | `firestore.rules`, `server.ts` | Backend protected routes verify Firebase ID tokens and `emailVerified == true` server-side; Firestore admin access is restricted exclusively to `aadeshjaisi6@gmail.com` with verified email, while normal accounts cannot self-assign `admin` roles. |
| Client Rendering & Data Handling | `src/components/*` | UI uses safe React text bindings and structured Markdown rendering without raw unescaped script sinks; Firebase Storage/Firestore writes enforce schema allowlists and owner UID checks. |
| Third-Party Dependencies | `package.json` | Lockfile security audit found 2 moderate/high transitive advisories limited to `@grpc/grpc-js@1.9.16` under `@firebase/firestore-compat` (Node gRPC transport module unused by browser SPA). |

---

## PoC Verification

### 1. API Burst Rate Limiting & Oversized Chat Payload Rejection

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Request Rate Limiting & Input Bounds |
| Impact | Medium |
| Affected File | `server.ts:274` |
| Test Scenario | Sending a >32,000-character message or exceeding 35 requests within 60 seconds to `/api/chat` |

#### How It Was Fixed
Added `validateChatPayloadBounds(req.body)` inside `/api/chat` and `/api/chat/stream` plus `createSlidingWindowRateLimiter` mounted ahead of AI, provider test, and geo API routes.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Incoming `POST /api/chat` request enters Express middleware chain at `server.ts:363` | Matched against `aiGenerationRateLimiter.middleware` |
| 2 | `checkLimit(identifier)` counts timestamps in the active 60s window (`server.ts:282`) | Exceeding 35 requests returns HTTP `429` with `Retry-After` before any Gemini call |
| 3 | Validated requests reach `/api/chat` handler and invoke `validateChatPayloadBounds(req.body)` (`server.ts:2144`) | Messages over 32,000 characters return HTTP `400` (`INVALID_INPUT`) immediately |

#### Conclusion
**Fix Verified** - Excessive request bursts and oversized payloads are rejected cleanly before reaching provider SDK calls.

---

### 2. Non-Fallback Guard & Bounded Single Quota Switch

#### Summary
| Field | Value |
|---|---|
| Issue Type | Improper Model Fallback Triggering on 4xx Client Errors |
| Impact | Low |
| Affected File | `server.ts:2442` |
| Test Scenario | Simulated `HTTP 400 INVALID_ARGUMENT` vs. simulated `HTTP 429 RESOURCE_EXHAUSTED` from primary Gemini model |

#### How It Was Fixed
Added `isNonFallbackClientError()` and `isGeminiQuotaOrRateLimitError()` guards before any backoff or fallback to `gemini-3.1-flash-lite`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Primary `executeChatWithModel(configuredModel)` rejects with `status: 400` | Enters `primaryErr` catch at `server.ts:2441` |
| 2 | `if (isNonFallbackClientError(primaryErr))` evaluates `true` (`src/utils/aiProviders.ts:683`) | Rethrows immediately; **zero** backoff and **zero** fallback call |
| 3 | On `status: 429` / `RESOURCE_EXHAUSTED` with `configuredModel !== 'gemini-3.1-flash-lite'` | Sleeps `250ms`, switches once to `gemini-3.1-flash-lite`, returns `fallbackUsed: true` |

#### Conclusion
**Fix Verified** - Client errors fail fast without masking root causes, while genuine quota/rate-limit exhaustion switches once cleanly to `gemini-3.1-flash-lite`.

---

### 3. Analytics Privacy Sanitization & Opt-In Consent Gate

#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsanitized or Unconsented Analytics Metadata |
| Impact | Medium |
| Affected File | `src/utils/analytics.ts:88` |
| Test Scenario | Calling `trackAnalyticsEvent('chat_message_sent', { email: 'user@example.com', prompt: 'secret', apiKey: 'AIzaSy1234567890', model: 'gemini-3.1-flash-lite' }, consent)` |

#### How It Was Fixed
`trackAnalyticsEvent` returns `false` unless `analyticsConsent === true`, and `sanitizeAnalyticsPayload` removes disallowed fields and redacts email/API key patterns from string metadata.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `trackAnalyticsEvent` checks `if (!analyticsConsent) return false` (`src/utils/analytics.ts:93`) | Unconsented calls exit before loading Firebase Analytics |
| 2 | When consented, `sanitizeAnalyticsPayload(params)` iterates entries (`src/utils/analytics.ts:61`) | Drops `email`, `prompt`, `apiKey` against `BLOCKED_PARAM_KEYS` |
| 3 | Safe metadata (`model`) passes `sanitizeProviderSecretText` + email regex scrubbing | Only non-PII `model` metadata reaches `logEvent` |

#### Conclusion
**Fix Verified** - Personal information, prompts, and credentials never reach analytics telemetry.
