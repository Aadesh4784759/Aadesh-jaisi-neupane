# Security Summary

**Reviewed Files**: 26
**Issues Resolved**: 8

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Stored Avatar URL Rendering | `src/components/OwnerControlPanel.tsx`, `src/components/AdminDashboardView.tsx`, `server/firebaseAdmin.ts` | 709 / 747 / 262 | Stored `photoURL` values on user records were rendered directly in avatar `<img>` tags without scheme verification on read. | Medium | Fixed | Enforced `isValidSafePhotoUrl()` (`http:`/`https:` allowlist, blocking `javascript:`, `data:`, and `vbscript:`) in server profile merging and before rendering avatar images in UI tables. |
| Firebase Admin Error & Credential Parsing | `server/firebaseAdmin.ts` | 85, 177 | `FIREBASE_SERVICE_ACCOUNT_JSON` was parsed without a friendly `try/catch` wrapper, and fallback Admin SDK errors were not passed through secret-scrubbing redaction. | Medium | Fixed | Wrapped JSON credential parsing with a safe non-secret error message and scrubbed all returned fallback error strings via `sanitizeProviderSecretText()`. |
| Owner Middleware Consistency | `server.ts` | 242 | `verifyOwnerFromRequest` relied on `OWNER_ADMIN_EMAIL` (`process.env.ADMIN_EMAIL`) while `requireAadeshAdmin` explicitly pinned verified `aadeshjaisi6@gmail.com`. | Medium | Fixed | Added explicit verified `aadeshjaisi6@gmail.com` enforcement inside `verifyOwnerFromRequest` alongside `requireAadeshAdmin`, ensuring environment overrides cannot broaden owner access. |
| Missing API Rate Limiting & Payload Caps | `server.ts` | 429 | AI generation, provider connection test, and geolocation endpoints lacked per-user/per-IP request throttling and chat input size checks. | Medium | Fixed | Added sliding-window per-UID/IP rate limiters (`createSlidingWindowRateLimiter`), `Retry-After` responses, security headers, and strict `validateChatPayloadBounds` checks on `/api/chat` and `/api/chat/stream`. |
| Unbounded Numeric Fields in Firestore Rules | `firestore.rules` | 100 | `messageCount`, `conversationCount`, `reminderMinutes`, `durationSeconds`, and `latencyMs` needed explicit bounds, and `owner_audit_logs` / `admins` needed strict schema rules. | Low | Fixed | Added bounds across validators in `firestore.rules`, added `OwnerAuditLog` (`allow update, delete: if false;`) and `AdminAllowlist` rules, and synced `firebase-blueprint.json`. |
| Fallback Triggered on Client 400 Errors | `server.ts` | 509 | Malformed client `400` errors risked triggering unnecessary provider/model retries. | Low | Fixed | Added `isNonFallbackClientError` blocking fallback on `400`, `401`, `403`, and safety errors, and halted failover if streaming output already began. |
| Missing Opt-In Gate & Scrubbing on Analytics | `src/utils/analytics.ts` | 73 | Analytics usage events needed strict consent gating and explicit PII/secret scrubbing before invoking Firebase Analytics. | Medium | Fixed | Added opt-in `analyticsConsent` (`false` by default) and `sanitizeAnalyticsPayload()` stripping emails, tokens, keys, prompts, and identifiers. |
| Secret & Bundle Exclusions | `.gitignore`, `.env.example` | 10 | `.gitignore` needed native keystore, service config, Vercel cache, and bundle exclusions, plus documented server-only Firebase Admin env placeholders. | Low | Fixed | Excluded `.env*` (preserving `.env.example`), `*.bundle`, `*.jks`, `*.keystore`, `google-services.json`, `GoogleService-Info.plist`, `.vercel/`, `server.js`, and `DRAFT_firestore.rules`. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| API Keys & Service Account Secrets | `server.ts`, `server/firebaseAdmin.ts`, `.env.example` | `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, and optional Vercel `FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_PRIVATE_KEY` stay strictly on the server via `process.env`, are absent from `src/` client bundles, and are redacted from error messages and failover CSV exports. |
| Owner Access Control & Role Isolation | `server.ts`, `firestore.rules`, `src/utils/ownerAdmin.ts` | All `/api/admin/*` and `/api/admin/owner/*` routes verify Firebase ID tokens server-side and allow only verified `aadeshjaisi6@gmail.com` (`401` if unauthenticated, `403` for `sagarjaisi92@gmail.com` or unverified emails). Owner editor rejects UID edits, role escalation, and owner self-suspension. |
| Immutable Audit Trail & Restore Guards | `server/firebaseAdmin.ts`, `src/utils/backupValidation.ts`, `firestore.rules` | Owner profile edits, streak adjustments, status updates, and support conversation inspections write append-only records to `owner_audit_logs` (`allow update, delete: if false;`). Restore rejects forged collection paths, wrong project IDs, and secret-containing JSON payloads. |
| CSV Formula & Client Rendering Safety | `src/utils/aiProviders.ts`, `src/components/*` | Failover CSV export escapes spreadsheet formula prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`); React components bind text safely without `innerHTML` or `dangerouslySetInnerHTML`. |
| Third-Party Dependencies | `package.json`, `bun.lock` | `bun audit` found 2 advisories solely in transitive `@grpc/grpc-js` (`firebase`/`firebase-admin` gRPC transport); HTTP/REST and server/client SDK usage does not expose custom gRPC servers. |

---

## PoC Verification

### 1. Stored Avatar URL Scheme Guard in Owner Directory & Server Merge
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsafe URL Scheme Rendering on Profile Avatars |
| Impact | Medium |
| Affected File | `server/firebaseAdmin.ts:261`, `src/components/OwnerControlPanel.tsx:709`, `src/components/AdminDashboardView.tsx:747` |
| Test Scenario | A legacy or tampered Firestore user profile containing `photoURL: "javascript:alert(1)"` or `"data:text/html,..."` |

#### How It Was Fixed
Applied `isValidSafePhotoUrl()` during server-side Auth/Firestore user merging and before rendering any `<img>` avatar element in `OwnerControlPanel.tsx` and `AdminDashboardView.tsx`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `mergeAuthAndFirestoreUser` reads `fs.photoURL` at `server/firebaseAdmin.ts:261` | Evaluates `isValidSafePhotoUrl(rawPhoto)` (`src/utils/ownerAdmin.ts:150`) |
| 2 | Pattern `/^(javascript\|data\|vbscript):/i` matches or URL protocol is not `http:`/`https:` | `safePhoto` resolves to `undefined` |
| 3 | Client table renders row at `OwnerControlPanel.tsx:709` and `AdminDashboardView.tsx:747` | Renders initial letter fallback instead of `<img>` tag (**Handled Safely**) |

#### Conclusion
**Fix Verified** - Unsafe URL schemes in stored `photoURL` fields are stripped server-side and blocked from rendering in `<img src>`.

---

### 2. Strict Owner Email Enforcement Across All `/api/admin/*` Routes
#### Summary
| Field | Value |
|---|---|
| Issue Type | Environment Override Risk on Admin Middleware |
| Impact | Medium |
| Affected File | `server.ts:242` |
| Test Scenario | Calling `/api/admin/overview`, `/api/admin/backup`, or `/api/admin/owner/users` with a verified non-owner token (such as `sagarjaisi92@gmail.com`) even if `ADMIN_EMAIL` were misconfigured |

#### How It Was Fixed
Pinned `verifyOwnerFromRequest` (`server.ts:242`) to enforce `emailLower === 'aadeshjaisi6@gmail.com' && result.user.emailVerified`, matching `requireAadeshAdmin` (`server.ts:263`).

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Request reaches `/api/admin/overview` or `/api/admin/owner/users` | Calls `verifyFirebaseUserFromRequest(req)` |
| 2 | Non-owner verified account (`sagarjaisi92@gmail.com`) passes token verification | Enters `verifyOwnerFromRequest` / `requireAadeshAdmin` |
| 3 | Middleware checks `emailLower !== 'aadeshjaisi6@gmail.com' \|\| !emailVerified` | Immediately returns **HTTP 403** (`Access restricted` / `FORBIDDEN_NOT_ADMIN`) |

#### Conclusion
**Fix Verified** - All admin, backup, restore, failover log, and Owner Control Panel endpoints exclusively accept verified `aadeshjaisi6@gmail.com`.

---

### 3. API Burst Rate Limiting, Provider Non-Fallback & Analytics Scrubbing
#### Summary
| Field | Value |
|---|---|
| Issue Type | Rate Limiting, Improper Fallback on 4xx, and Telemetry Scrubbing |
| Impact | Medium |
| Affected File | `server.ts:429`, `src/utils/aiProviders.ts`, `src/utils/analytics.ts` |
| Test Scenario | Sending >32k-char prompts, exceeding 35 req/min, or triggering `HTTP 400`/`401`/`403` vs `HTTP 429` |

#### How It Was Fixed
Per-UID/IP sliding-window rate limits reject bursts with `HTTP 429`; `isNonFallbackClientError` stops fallback on client/auth/safety errors while allowing clean failover (`Gemini -> Groq -> OpenRouter`) on `429`/quota exhaustion when `autoFailover` is enabled; `sanitizeAnalyticsPayload` strips PII and credentials.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Chat request enters `aiGenerationRateLimiter.middleware` and `validateChatPayloadBounds` | Excessive bursts or oversized text blocked before SDK invocation |
| 2 | Provider responds with `400`/`401`/`403` vs `429` | `400`/`401`/`403` fails immediately without failover; `429` activates next configured fallback provider |
| 3 | Analytics/failover telemetry sanitized via `sanitizeProviderSecretText` / `sanitizeAnalyticsPayload` | Secrets and PII never reach logs, analytics, or CSV exports (**Handled Safely**) |

#### Conclusion
**Fix Verified** - Provider failover, telemetry, and backup/restore boundaries remain strictly protected against abuse and credential exposure.
