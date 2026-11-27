# Aadesh AI — Complete 13-Point Technical Audit, Security & Mobile Readiness Report

This report documents the direct technical audit, verified code hardening, and production readiness checklist for **Aadesh AI Global Hub** (Web + Node.js/Express + Firebase + Vercel + Future React Native Mobile Architecture).

---

## 1. Google Fonts Optimization Audit
- **Verified Configuration (`index.html`)**: Uses `<link rel="preconnect" href="https://fonts.googleapis.com">` and `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`, paired with a single combined CSS stylesheet loading `Plus Jakarta Sans` (`400;500;600;700;800`) and `JetBrains Mono` (`400;500;600`) with `display=swap`.
- **Efficiency Assessment**: Avoids multiple redundant font network requests, avoids heavy italic/unused weights, and keeps fallback rendering instant via `font-display: swap`.

---

## 2. Web Framework & Future React Native Mobile Architecture
- **Web Application Preserved**: React 19 + TypeScript + Vite SPA paired with Express/Node.js backend (`server.ts` locally, `api/index.ts` via `vercel.json` on Vercel). No Flutter migration introduced.
- **Shared Core Monorepo / Workspace Plan for Future React Native (No Breaking Refactor Required)**:
  - **Already Portable Pure TypeScript Business Logic (`src/utils/` & `src/types/`)**:
    - `src/utils/aiProviders.ts` (provider metadata, error classification, quota/rate-limit fallback rules, 3-state health resolution, secret sanitization)
    - `src/utils/gamification.ts` (timezone-safe streak calculations, recovery limits, XP/level calculations)
    - `src/types/index.ts` & `src/data/languages.ts`
  - **Recommended Future Workspace Structure (when adding Expo / React Native CLI)**:
    - `packages/shared-core/` → pure TS types, AI provider catalog/classifiers, streak math, API request/SSE stream client (`fetch` + `Authorization: Bearer <Firebase ID Token>`).
    - `apps/web/` → existing Vite React web UI.
    - `apps/mobile/` → React Native + TypeScript (`@react-native-firebase/auth`, `@react-native-firebase/firestore`, `@react-native-firebase/messaging`, `@react-native-firebase/crashlytics`, `react-native-keychain` / `expo-secure-store`, `expo-notifications`).
  - **Backend Reuse**: Existing `/api/*` Express endpoints (rate-limited, Firebase ID-token verified) serve both web and mobile clients with zero API redesign.

---

## 3. Development Tools, VS Code, Android Studio, Android SDK & Emulator Readiness
- **VS Code Readiness**:
  - `tsconfig.json`, TypeScript ESLint, and Vite scripts work directly in VS Code with TypeScript IntelliSense and zero platform lock-in.
- **Android Studio & Android SDK Readiness Checklist (for Future React Native Mobile Phase)**:
  - Ensure **JDK 17** (`JAVA_HOME` configured), **Android Studio Ladybug/Meerkat+**, **Android SDK Platform 34/35**, **Android SDK Build-Tools 35.0.0**, **Android SDK Platform-Tools (`adb`)**, and **Android Emulator** with Google Play system images (needed to test Google Sign-In & Firebase Cloud Messaging locally).
  - Add future native project folders cleanly alongside `android/` and `ios/` in `apps/mobile/` without touching root web build files.
  - Keep `.jks`/`.keystore`, `google-services.json`, and `GoogleService-Info.plist` excluded from Git (already added to `.gitignore`).

---

## 4. GitHub & Repository Hygiene Audit
- **`.gitignore` Hardened**: Excluded `.env*` (except `.env.example`), `.vercel/`, `server.js`, `*.bundle`, `*.jks`, `*.keystore`, `*.p12`, `*.mobileprovision`, `google-services.json`, `GoogleService-Info.plist`, and `DRAFT_firestore.rules`.
- **Container Findings**:
  - No `.git/` directory exists inside this container workspace, so local commit history could not be inspected.
  - Found `aadesh-ai-v2.5.bundle` (1.79 MB) in the workspace root; `*.bundle` has been added to `.gitignore`, and the existing file should be removed from any remote Git repository/commits if it is not intended as a release artifact.
- **Firebase Client Config Clarification**: `firebase-applet-config.json` contains public Firebase Web SDK identifiers (`apiKey`, `projectId`, `appId`, `measurementId`), which are intentionally public and protected by Firestore Security Rules + Firebase Authentication domains rather than secrecy.

---

## 5. Firebase Security Rules & Role Isolation Audit
- **Strict Admin Isolation (`firestore.rules` & `firebase-blueprint.json`)**:
  - Verified `isAdmin()` requires `request.auth.token.email_verified == true` and strictly checks `request.auth.token.email.lower() == 'aadeshjaisi6@gmail.com'` (or read-only `/admins/{uid}` allowlist).
  - `sagarjaisi92@gmail.com` has **no** admin privilege anywhere in `firestore.rules`, `server.ts`, or frontend code and remains a normal user (`role: 'user'`).
- **Rule Tightening Applied**:
  - Added strict non-negative numeric bounds (`>= 0`) and upper limits on `messageCount`, `conversationCount`, `reminderMinutes`, `durationSeconds`, and `latencyMs` across user, conversation, task, generated image, voice, and usage analytics validators.
  - Preserved strict `recoveryCount >= 0 && recoveryCount <= 5` enforcement and anti-elevation checks preventing users from writing `role: 'admin'` or `status: 'suspended'`.
  - Synced `/admins/{adminUid}` schema into `firebase-blueprint.json`.

---

## 6. Free Email Forwarding Options (Honest Assessment)
- **What Exists vs. External Setup**: This web codebase handles password reset and email verification emails natively via Firebase Authentication (`sendPasswordResetEmail` / `sendEmailVerification`). Custom domain email forwarding (e.g., forwarding `support@yourdomain.com` to `aadeshjaisi6@gmail.com`) cannot be provisioned inside repository code and must be configured at your domain DNS/registrar:
  - **Recommended Zero-Cost Options**:
    1. **Cloudflare Email Routing** (free custom domain routing with MX/TXT DNS verification).
    2. **ImprovMX Free Tier** or **ForwardMX / Registrar Email Forwarding** (Namecheap / Porkbun free forwarding).
  - **Custom Sender Domain in Firebase Auth**: Optional; configure custom SMTP or DNS SPF/DKIM in **Firebase Console -> Authentication -> Templates -> SMTP settings** if branding auth emails under a custom domain.

---

## 7. Firebase Cloud Messaging (FCM) & Notification Readiness
- **Implemented Inspection (`src/utils/notifications.ts`)**:
  - Browser `Notification`, `ServiceWorker`, and `PushManager` capability detection plus `firebaseConfig.messagingSenderId` verification (`10769299263`).
  - Daily streak alerts currently use permitted local browser `Notification` API triggers cleanly.
- **What Remains in Firebase Console / Mobile App**:
  - Remote background web push requires generating a Web Push certificate key pair in **Firebase Console -> Project Settings -> Cloud Messaging**, setting `VITE_FIREBASE_VAPID_KEY`, and adding a `firebase-messaging-sw.js` background handler.
  - Mobile push notifications for the future React Native app require `@react-native-firebase/messaging`, `google-services.json` (Android), and APNs key upload in Firebase Console (iOS).

---

## 8. Crashlytics Readiness Plan (Honest Separation Web vs. Mobile)
- **Honest Status**: Firebase Crashlytics officially targets native Android & iOS mobile binaries (not browser SPAs). Local/backend error logs in `server.ts` and `providerErrorLogs` are **not** disguised as Crashlytics.
- **Mobile Phase Integration Plan**:
  - Install `@react-native-firebase/crashlytics` in the future `apps/mobile` React Native project, upload Android ProGuard/R8 mapping & iOS dSYM symbols during builds, and attach non-PII error codes + app version context while excluding prompts, keys, and emails.

---

## 9. Privacy-Safe, Consent-Gated Firebase Analytics (`src/utils/analytics.ts`)
- **Consent Gate**: Controlled via `settings.analyticsConsent` (defaults to `false`, toggleable under **Settings -> Account, Privacy & Permissions -> Privacy-Safe Usage Analytics**).
- **Allowed Events**: Only `login`, `sign_up`, `chat_message_sent`, `model_switched`, and `ai_error` are emitted, guarded by `firebase/analytics` `isSupported()` + `firebaseConfig.measurementId`.
- **Strict Sanitization**: `sanitizeAnalyticsPayload()` strips all PII and credential keys (`email`, `password`, `token`, `apiKey`, `prompt`, `message`, `content`, `reply`, `name`, `phone`, `uid`, `ip`, coordinates) and scrubs emails/API key patterns from string metadata.

---

## 10. Billing Budget Alert Checklist (Firebase, Google Cloud & Vercel)
- **Important Honesty Note**: Budget alerts send email/webhook notifications only — **alerts do not automatically cap serverless or AI API spend** unless quota limits or billing triggers are also enforced.
- **Recommended Manual Dashboard Setup (No Paid Plan Activated by Code)**:
  1. **Google Cloud / Gemini API Console -> Billing -> Budgets & Alerts**: Create budgets with notification thresholds at **50%**, **80%**, and **100%** of target spend, plus monitor Gemini API Requests-Per-Minute / Tokens-Per-Minute quotas.
  2. **Firebase Console -> Usage & Billing**: Verify Spark (Free) vs. Blaze thresholds and enable monthly budget email alerts.
  3. **Vercel Dashboard -> Account / Project Settings -> Usage & Spend Management**: Set Spend Management notifications at **50%**, **80%**, and **100%** (or hard pause threshold if on Pro).

---

## 11. API Key Security & Backend API Hardening (`server.ts`)
- **Zero Client Secret Leaks**: `GEMINI_API_KEY`, `GROQ_API_KEY`, and `OPENROUTER_API_KEY` are read strictly in `server.ts` from `process.env`; never prefixed with `VITE_`.
- **Auth Enforcement**: All AI generation, provider mutation, and status history routes enforce `requireAuthenticatedUser` (Firebase ID token verified server-side + `emailVerified === true`); owner routes enforce `verifyOwnerFromRequest` (`aadeshjaisi6@gmail.com`).
- **Rate Limiting & Payload Bounds**: Added sliding-window per-UID/IP rate limiting (`35/min` AI routes, `15/min` `/api/providers/test`, `60/min` `/api/geo`), `X-RateLimit-*` + `Retry-After` headers, strict payload character/size bounds (`validateChatPayloadBounds`), and safe HTTP headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `x-powered-by` disabled) without blocking AI Studio iframe embedding.

---

## 12. Smart Gemini Model Quota / 429 Auto-Fallback (`server.ts`, `src/utils/aiProviders.ts`, `src/App.tsx`)
- Keeps the user's chosen Gemini model as primary.
- On HTTP `429`, `RESOURCE_EXHAUSTED`, quota/rate-limit errors, or `503` overload errors: guards strictly against `400/401/403` client/auth failures (`isNonFallbackClientError`), waits a short bounded backoff (`250ms`), and automatically switches **once** to `gemini-3.1-flash-lite` preserving conversation history and model-compatible `thinkingConfig`.
- Updates Live AI diagnostics and notifies the user cleanly once per switch with:
  > *"Your primary AI model has reached its usage limit. Aadesh AI automatically switched to Gemini 3.1 Flash-Lite for uninterrupted assistance."*

---

## 13. Real-Time Provider Health Dots & Live AI Diagnostics (`AIProviderSelector.tsx`, `SettingsView.tsx`, `LiveAIControlCenter.tsx`, `Header.tsx`)
- **Settings Health Dots & Subtitles**: Color-coded dot next to each AI provider (`Green` = Connected, `Yellow` = Degraded/Slow/Checking/Untested, `Red` = Unavailable) with descriptive tooltip and subtitle displaying real measured latency (`ms`) and formatted status timestamp.
- **Truthful Live AI Control Center & Header Monitor**: Displays real-time Internet Network, Backend API, AI Provider API, Current Provider, Current Model, API Connection Latency, Last Successful Connection, Selected Response Language, and Actual AI Generation Status (`Verified` / `Failed` / `Testing AI...` / `Not Tested`).
