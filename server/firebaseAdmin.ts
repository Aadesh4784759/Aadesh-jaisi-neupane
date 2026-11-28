import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { App as AdminApp } from 'firebase-admin/app';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import {
  buildUserActivityTimeline,
  isValidSafePhotoUrl,
  OwnerAuditAction,
  OwnerAuditLogRecord,
  OwnerManagedUser,
  OwnerProfileUpdateInput,
  OwnerStreakUpdateInput,
  SOLE_OWNER_EMAIL,
  UserTimelineEvent,
  validateAndComputeOwnerStreakUpdate,
  validateOwnerProfilePatch,
  validateOwnerReason,
} from '../src/utils/ownerAdmin';
import {
  AIProviderId,
  normalizeAIProviderId,
  sanitizeProviderSecretText,
} from '../src/utils/aiProviders';
import { computeLevelInfo, NEPAL_TIMEZONE, resolveValidTimezone } from '../src/utils/gamification';

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

const safeDirname =
  typeof import.meta !== 'undefined' && import.meta.url
    ? path.dirname(fileURLToPath(import.meta.url))
    : process.cwd();

let cachedAppletConfig: FirebaseAppletConfig | null = null;
let cachedCredentialMode: 'service_account_json' | 'service_account_env' | 'adc' = 'adc';
let cachedAdminApp: AdminApp | null = null;
let cachedAdminInitPromise: Promise<AdminApp> | null = null;

type FirebaseAdminAppModule = typeof import('firebase-admin/app');
type FirebaseAdminAuthModule = typeof import('firebase-admin/auth');
type FirebaseAdminFirestoreModule = typeof import('firebase-admin/firestore');

let appModulePromise: Promise<FirebaseAdminAppModule> | null = null;
let authModulePromise: Promise<FirebaseAdminAuthModule> | null = null;
let firestoreModulePromise: Promise<FirebaseAdminFirestoreModule> | null = null;

async function loadFirebaseAdminAppModule(): Promise<FirebaseAdminAppModule> {
  if (!appModulePromise) {
    appModulePromise = import('firebase-admin/app');
  }
  return appModulePromise;
}

async function loadFirebaseAdminAuthModule(): Promise<FirebaseAdminAuthModule> {
  if (!authModulePromise) {
    authModulePromise = import('firebase-admin/auth');
  }
  return authModulePromise;
}

async function loadFirebaseAdminFirestoreModule(): Promise<FirebaseAdminFirestoreModule> {
  if (!firestoreModulePromise) {
    firestoreModulePromise = import('firebase-admin/firestore');
  }
  return firestoreModulePromise;
}

function readFirebaseAppletConfig(): FirebaseAppletConfig {
  if (cachedAppletConfig) return cachedAppletConfig;

  const candidates = [
    path.resolve(safeDirname, '..', 'firebase-applet-config.json'),
    path.resolve(safeDirname, 'firebase-applet-config.json'),
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
  ];

  for (const configPath of candidates) {
    try {
      if (fs.existsSync(configPath)) {
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const projectId = String(parsed.projectId || '').trim();
        const firestoreDatabaseId = String(parsed.firestoreDatabaseId || '').trim();
        if (projectId && projectId !== 'remixed-project-id') {
          cachedAppletConfig = { projectId, firestoreDatabaseId };
          return cachedAppletConfig;
        }
      }
    } catch {
      // continue searching candidate paths
    }
  }

  const envProjectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  if (envProjectId) {
    cachedAppletConfig = {
      projectId: envProjectId,
      firestoreDatabaseId: String(process.env.FIREBASE_DATABASE_ID || 'default').trim(),
    };
    return cachedAppletConfig;
  }

  // Safe fallback to default project configuration instead of throwing
  cachedAppletConfig = {
    projectId: 'aadesh-ai-global',
    firestoreDatabaseId: 'default',
  };
  return cachedAppletConfig;
}

export function isValidPemPrivateKey(raw?: string | null): boolean {
  const normalized = String(raw || '')
    .trim()
    .replace(/\\n/g, '\n');
  if (!normalized || normalized.length < 120) return false;
  return (
    /-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(normalized) &&
    /-----END (?:RSA )?PRIVATE KEY-----/.test(normalized)
  );
}

export function isValidServiceAccountEmail(raw?: string | null): boolean {
  const email = String(raw || '').trim();
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function sanitizeAdminErrorMessage(raw: unknown): string {
  return sanitizeProviderSecretText(String(raw ?? ''))
    .replace(
      /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/g,
      '[REDACTED_PRIVATE_KEY]'
    )
    .replace(/"private_key"\s*:\s*"[^"]*"/g, '"private_key":"[REDACTED]"')
    .replace(/FIREBASE_PRIVATE_KEY\s*=\s*\S+/gi, 'FIREBASE_PRIVATE_KEY=[REDACTED]')
    .replace(/FIREBASE_SERVICE_ACCOUNT_JSON\s*=\s*\S+/gi, 'FIREBASE_SERVICE_ACCOUNT_JSON=[REDACTED]')
    .slice(0, 300);
}

export type ResolvedAdminCredential =
  | {
      mode: 'service_account_json';
      projectId: string;
      serviceAccount: Record<string, any>;
    }
  | {
      mode: 'service_account_env';
      projectId: string;
      clientEmail: string;
      privateKey: string;
    }
  | {
      mode: 'adc';
      projectId: string;
    };

function makeAdminConfigError(message: string): Error {
  const err = new Error(message);
  (err as any).code = 'ADMIN_SDK_CONFIG_ERROR';
  return err;
}

export function resolveAdminCredentialsFromEnv(
  config: FirebaseAppletConfig = readFirebaseAppletConfig(),
  env: Record<string, string | undefined> = process.env
): ResolvedAdminCredential {
  const serviceAccountJson = String(env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const clientEmail = String(env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKeyRaw = String(env.FIREBASE_PRIVATE_KEY || '').trim();
  const effectivePrivateKey =
    privateKeyRaw && privateKeyRaw.toLowerCase() !== 'undefined' && privateKeyRaw.toLowerCase() !== 'null'
      ? privateKeyRaw
      : '';

  // 1. Validate FIREBASE_SERVICE_ACCOUNT_JSON first (takes precedence over individual fallback env vars)
  if (serviceAccountJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(serviceAccountJson);
    } catch {
      throw makeAdminConfigError(
        'Invalid FIREBASE_SERVICE_ACCOUNT_JSON credential format. Expected valid service account JSON.'
      );
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw makeAdminConfigError(
        'Invalid FIREBASE_SERVICE_ACCOUNT_JSON credential structure. Expected a JSON object.'
      );
    }

    const sa = parsed as Record<string, any>;
    if (sa.type && String(sa.type).trim() !== 'service_account') {
      throw makeAdminConfigError(
        'Invalid FIREBASE_SERVICE_ACCOUNT_JSON credential type. Expected "service_account".'
      );
    }

    const saEmail = String(sa.client_email || '').trim();
    const saKey = String(sa.private_key || '').trim();
    if (!isValidServiceAccountEmail(saEmail) || !isValidPemPrivateKey(saKey)) {
      throw makeAdminConfigError(
        'FIREBASE_SERVICE_ACCOUNT_JSON is missing a valid client_email or PEM private_key.'
      );
    }

    return {
      mode: 'service_account_json',
      projectId:
        String(sa.project_id || env.FIREBASE_PROJECT_ID || config.projectId).trim() || config.projectId,
      serviceAccount: sa,
    };
  }

  // 2. Fallback to individual FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY only if valid PEM;
  // ignore blank fallback (use ADC) and reject invalid non-blank key without crashing cert().
  if (effectivePrivateKey) {
    if (!isValidPemPrivateKey(effectivePrivateKey)) {
      throw makeAdminConfigError(
        'Invalid FIREBASE_PRIVATE_KEY fallback: expected a valid PEM private key (-----BEGIN PRIVATE KEY-----...). Configure FIREBASE_SERVICE_ACCOUNT_JSON or remove the invalid key.'
      );
    }
    if (!isValidServiceAccountEmail(clientEmail)) {
      throw makeAdminConfigError(
        'FIREBASE_CLIENT_EMAIL is missing or invalid while FIREBASE_PRIVATE_KEY is configured.'
      );
    }

    const envProjectId = String(env.FIREBASE_PROJECT_ID || config.projectId).trim() || config.projectId;
    return {
      mode: 'service_account_env',
      projectId: envProjectId,
      clientEmail,
      privateKey: effectivePrivateKey.replace(/\\n/g, '\n'),
    };
  }

  // 3. Application Default Credentials (Google AI Studio Preview / GCP host)
  return {
    mode: 'adc',
    projectId: String(env.FIREBASE_PROJECT_ID || config.projectId).trim() || config.projectId,
  };
}

/**
 * Verifies whether the Firebase Admin SDK has already been initialized in memory.
 * Initialization is strictly deferred until an authorized owner-admin operation executes.
 */
export function isFirebaseAdminInitialized(): boolean {
  return cachedAdminApp !== null;
}

async function getOrInitAdminApp(): Promise<AdminApp> {
  if (cachedAdminApp) return cachedAdminApp;
  if (cachedAdminInitPromise) return cachedAdminInitPromise;

  cachedAdminInitPromise = (async () => {
    const { cert, getApp, getApps, initializeApp } = await loadFirebaseAdminAppModule();

    if (getApps().length > 0) {
      cachedAdminApp = getApp();
      return cachedAdminApp;
    }

    const config = readFirebaseAppletConfig();
    const resolved = resolveAdminCredentialsFromEnv(config, process.env);

    if (resolved.mode === 'service_account_json') {
      cachedCredentialMode = 'service_account_json';
      cachedAdminApp = initializeApp({
        credential: cert(resolved.serviceAccount),
        projectId: resolved.projectId,
      });
      return cachedAdminApp;
    }

    if (resolved.mode === 'service_account_env') {
      cachedCredentialMode = 'service_account_env';
      cachedAdminApp = initializeApp({
        credential: cert({
          projectId: resolved.projectId,
          clientEmail: resolved.clientEmail,
          privateKey: resolved.privateKey,
        }),
        projectId: resolved.projectId,
      });
      return cachedAdminApp;
    }

    cachedCredentialMode = 'adc';
    cachedAdminApp = initializeApp({
      projectId: resolved.projectId,
    });
    return cachedAdminApp;
  })();

  try {
    return await cachedAdminInitPromise;
  } catch (err) {
    cachedAdminInitPromise = null;
    throw err;
  }
}

export async function getAdminAuthService(): Promise<Auth> {
  const [app, { getAuth }] = await Promise.all([
    getOrInitAdminApp(),
    loadFirebaseAdminAuthModule(),
  ]);
  return getAuth(app);
}

export async function getAdminDbService(): Promise<Firestore> {
  const [app, { getFirestore }] = await Promise.all([
    getOrInitAdminApp(),
    loadFirebaseAdminFirestoreModule(),
  ]);
  const config = readFirebaseAppletConfig();
  const dbId = config.firestoreDatabaseId;
  return dbId && dbId !== '(default)' ? getFirestore(app, dbId) : getFirestore(app);
}

export function getAdminConfigSummary(): {
  projectId: string;
  databaseId: string;
  credentialMode: 'service_account_json' | 'service_account_env' | 'adc';
} {
  const config = readFirebaseAppletConfig();
  return {
    projectId: config.projectId,
    databaseId: config.firestoreDatabaseId || '(default)',
    credentialMode: cachedCredentialMode,
  };
}

export function classifyFirebaseAdminError(err: unknown): {
  status: number;
  code: string;
  message: string;
} {
  const rawCode = String((err as any)?.code || '').toLowerCase();
  const rawMsg = String((err as any)?.message || err || 'Unknown Firebase Admin error');
  const lower = rawMsg.toLowerCase();

  if (
    rawCode === 'admin_sdk_config_error' ||
    lower.includes('firebase_service_account_json') ||
    lower.includes('firebase_private_key') ||
    lower.includes('firebase_client_email') ||
    lower.includes('failed to parse private key') ||
    lower.includes('invalid pem') ||
    lower.includes('service account object must contain')
  ) {
    return {
      status: 503,
      code: 'ADMIN_SDK_CONFIG_ERROR',
      message: sanitizeAdminErrorMessage(rawMsg),
    };
  }

  if (
    rawCode.includes('permission-denied') ||
    rawCode.includes('insufficient-permission') ||
    rawCode === '7' ||
    lower.includes('permission_denied') ||
    lower.includes('insufficient permission') ||
    lower.includes('caller does not have permission') ||
    lower.includes('could not load the default credentials') ||
    lower.includes('failed to determine project id') ||
    lower.includes('default credentials')
  ) {
    return {
      status: 503,
      code: 'ADMIN_SDK_PERMISSION_ERROR',
      message:
        'Firebase Admin SDK lacks required Google Cloud IAM permissions (Cloud Datastore User and Firebase Authentication Admin) or server credentials for project aadesh-ai-global.',
    };
  }

  if (rawCode === 'auth/user-not-found') {
    return {
      status: 404,
      code: 'USER_NOT_FOUND',
      message: 'User record was not found in Firebase Authentication.',
    };
  }

  return {
    status: 500,
    code: 'ADMIN_SDK_OPERATION_FAILED',
    message: sanitizeAdminErrorMessage(rawMsg),
  };
}

function safeIso(value: unknown, fallback: string = ''): string {
  if (!value) return fallback;
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? fallback : new Date(ms).toISOString();
  }
  if (typeof value === 'object' && value !== null && typeof (value as any).toDate === 'function') {
    try {
      return (value as any).toDate().toISOString();
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function safeSafeDocId(rawId: string): string {
  const cleaned = String(rawId || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cleaned)) {
    throw new Error('Invalid Firebase UID or document identifier.');
  }
  return cleaned;
}

function mergeAuthAndFirestoreUser(params: {
  uid: string;
  authUser?: UserRecord | null;
  fsData?: Record<string, any> | null;
  analyticsStats?: { count: number; lastTimestamp: string | null };
}): OwnerManagedUser {
  const { uid, authUser, fsData, analyticsStats } = params;
  const fs = fsData || {};

  const email = String(authUser?.email || fs.email || '').trim();
  const emailLower = email.toLowerCase();
  const displayName = String(
    fs.displayName || authUser?.displayName || (email ? email.split('@')[0] : '') || 'User'
  ).trim();
  const providerId =
    authUser?.providerData?.[0]?.providerId || String(fs.provider || 'firebase').trim();

  const authCreated = authUser?.metadata?.creationTime
    ? safeIso(authUser.metadata.creationTime)
    : '';
  const fsCreated = safeIso(fs.createdAt);
  const createdAt = authCreated || fsCreated || new Date().toISOString();

  const lastLoginAt = authUser?.metadata?.lastSignInTime
    ? safeIso(authUser.metadata.lastSignInTime, '') || null
    : null;

  const fsLastActive = safeIso(fs.lastActiveAt || fs.updatedAt, '') || null;
  const analyticsLast = analyticsStats?.lastTimestamp || null;

  const lastActiveCandidates = [fsLastActive, analyticsLast, lastLoginAt].filter(
    (v): v is string => Boolean(v)
  );
  const lastActiveAt =
    lastActiveCandidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

  const disabled = Boolean(authUser?.disabled);
  const status: 'active' | 'suspended' =
    disabled || fs.status === 'suspended' ? 'suspended' : 'active';

  const currentStreak = Math.max(
    0,
    Math.floor(Number(fs.currentStreak ?? fs.streakDays ?? 0) || 0)
  );
  const longestStreak = Math.max(
    currentStreak,
    Math.floor(Number(fs.longestStreak ?? 0) || 0)
  );
  const xp = Math.max(0, Math.floor(Number(fs.xp ?? 0) || 0));
  const levelInfo = computeLevelInfo(xp);

  const timezone = resolveValidTimezone(
    typeof fs.timezone === 'string' && fs.timezone.trim() ? fs.timezone : NEPAL_TIMEZONE
  );

  const isOwner = emailLower === SOLE_OWNER_EMAIL;

  const rawPhoto = String(fs.photoURL || authUser?.photoURL || '').trim();
  const safePhoto = rawPhoto && isValidSafePhotoUrl(rawPhoto) ? rawPhoto : undefined;

  return {
    uid,
    userId: String(fs.userId || uid),
    email,
    emailVerified: Boolean(authUser?.emailVerified),
    displayName,
    username: typeof fs.username === 'string' ? fs.username : undefined,
    nickname: typeof fs.nickname === 'string' ? fs.nickname : undefined,
    photoURL: safePhoto,
    country: typeof fs.country === 'string' ? fs.country : undefined,
    countryCode: typeof fs.countryCode === 'string' ? fs.countryCode : undefined,
    countryFlag: typeof fs.countryFlag === 'string' ? fs.countryFlag : undefined,
    timezone,
    createdAt,
    lastLoginAt,
    lastActiveAt,
    status,
    disabled,
    role: isOwner || fs.role === 'admin' ? 'admin' : 'user',
    provider: providerId,
    preferredLanguage: String(fs.preferredLanguage || 'en'),
    aiProvider: normalizeAIProviderId(fs.aiProvider),
    aiModel: typeof fs.aiModel === 'string' ? fs.aiModel : undefined,
    aiResponseLanguage: typeof fs.aiResponseLanguage === 'string' ? fs.aiResponseLanguage : undefined,
    messageCount: Math.max(
      Number(fs.messageCount || 0) || 0,
      analyticsStats?.count || 0
    ),
    conversationCount: Number(fs.conversationCount || 0) || 0,
    lastMessageAt: analyticsLast || fsLastActive || null,
    lastAiProviderUsed: fs.aiProvider ? normalizeAIProviderId(fs.aiProvider) : null,
    currentStreak,
    longestStreak,
    lastActiveDate: String(fs.lastActiveDate || ''),
    recoveryCount: Math.min(5, Math.max(0, Math.floor(Number(fs.recoveryCount ?? 0) || 0))),
    recoveryMonth: typeof fs.recoveryMonth === 'string' ? fs.recoveryMonth : undefined,
    streakBeforeBreak:
      typeof fs.streakBeforeBreak === 'number' ? fs.streakBeforeBreak : undefined,
    streakBrokenDate: typeof fs.streakBrokenDate === 'string' ? fs.streakBrokenDate : undefined,
    recoveredDates: Array.isArray(fs.recoveredDates)
      ? fs.recoveredDates.filter((d: unknown) => typeof d === 'string')
      : [],
    xp,
    level: Number(fs.level || levelInfo.level) || levelInfo.level,
    levelTitle: typeof fs.levelTitle === 'string' ? fs.levelTitle : levelInfo.levelTitle,
    authSynced: Boolean(authUser),
    hasFirestoreProfile: Boolean(fsData),
  };
}

async function listAllFirebaseAuthUsers(auth: Auth): Promise<Map<string, UserRecord>> {
  const authMap = new Map<string, UserRecord>();
  let nextPageToken: string | undefined = undefined;
  let pages = 0;

  do {
    const page = await auth.listUsers(1000, nextPageToken);
    for (const user of page.users) {
      authMap.set(user.uid, user);
    }
    nextPageToken = page.pageToken;
    pages += 1;
  } while (nextPageToken && pages < 5);

  return authMap;
}

async function writeOwnerAuditLog(
  db: Firestore,
  entry: Omit<OwnerAuditLogRecord, 'id' | 'timestamp'>
): Promise<OwnerAuditLogRecord> {
  const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = new Date().toISOString();
  const payload: OwnerAuditLogRecord = {
    id,
    timestamp,
    actorUid: entry.actorUid,
    actorEmail: entry.actorEmail,
    targetUid: entry.targetUid,
    ...(entry.targetEmail ? { targetEmail: entry.targetEmail } : {}),
    action: entry.action,
    reason: entry.reason,
    ...(entry.beforeSnapshot ? { beforeSnapshot: entry.beforeSnapshot } : {}),
    ...(entry.afterSnapshot ? { afterSnapshot: entry.afterSnapshot } : {}),
  };
  await db.collection('owner_audit_logs').doc(id).set(payload);
  return payload;
}

export async function listMergedOwnerUsers(): Promise<OwnerManagedUser[]> {
  const [auth, db] = await Promise.all([getAdminAuthService(), getAdminDbService()]);

  const [authMap, usersSnap, analyticsSnap] = await Promise.all([
    listAllFirebaseAuthUsers(auth),
    db.collection('users').limit(1000).get(),
    db.collection('usage_analytics').orderBy('timestamp', 'desc').limit(1000).get(),
  ]);

  const fsMap = new Map<string, Record<string, any>>();
  for (const docSnap of usersSnap.docs) {
    fsMap.set(docSnap.id, docSnap.data());
  }

  const analyticsByUid = new Map<string, { count: number; lastTimestamp: string | null }>();
  for (const docSnap of analyticsSnap.docs) {
    const data = docSnap.data();
    const uid = String(data.userId || '').trim();
    if (!uid) continue;
    const prev = analyticsByUid.get(uid) || { count: 0, lastTimestamp: null };
    const ts = safeIso(data.timestamp, '');
    const latest =
      ts && (!prev.lastTimestamp || new Date(ts).getTime() > new Date(prev.lastTimestamp).getTime())
        ? ts
        : prev.lastTimestamp;
    analyticsByUid.set(uid, {
      count: prev.count + 1,
      lastTimestamp: latest,
    });
  }

  const allUids = new Set<string>([...authMap.keys(), ...fsMap.keys()]);
  const merged: OwnerManagedUser[] = [];

  for (const uid of allUids) {
    merged.push(
      mergeAuthAndFirestoreUser({
        uid,
        authUser: authMap.get(uid) || null,
        fsData: fsMap.get(uid) || null,
        analyticsStats: analyticsByUid.get(uid),
      })
    );
  }

  return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getMergedOwnerUserDetail(rawUid: string): Promise<{
  user: OwnerManagedUser;
  conversations: Array<{
    id: string;
    title: string;
    language: string;
    messageCount: number;
    createdAt?: string;
    updatedAt?: string;
    lastAiProviderUsed?: AIProviderId | null;
  }>;
  analyticsEvents: Array<{
    id: string;
    eventType: string;
    language?: string;
    latencyMs?: number;
    dateKey: string;
    timestamp: string;
  }>;
  auditLogs: OwnerAuditLogRecord[];
  timeline: UserTimelineEvent[];
}> {
  const uid = safeSafeDocId(rawUid);
  const [auth, db] = await Promise.all([getAdminAuthService(), getAdminDbService()]);

  let authUser: UserRecord | null = null;
  try {
    authUser = await auth.getUser(uid);
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') {
      throw err;
    }
  }

  const [userDoc, convSnap, analyticsSnap, auditSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('users').doc(uid).collection('conversations').orderBy('updatedAt', 'desc').limit(50).get(),
    db.collection('usage_analytics').where('userId', '==', uid).limit(100).get(),
    db.collection('owner_audit_logs').where('targetUid', '==', uid).limit(100).get(),
  ]);

  const fsData = userDoc.exists ? userDoc.data() || null : null;
  if (!authUser && !fsData) {
    const notFoundErr = new Error(`User ${uid} not found in Firebase Auth or Firestore.`);
    (notFoundErr as any).code = 'auth/user-not-found';
    throw notFoundErr;
  }

  const analyticsEvents = analyticsSnap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: String(data.id || d.id),
        eventType: String(data.eventType || 'chat'),
        language: typeof data.language === 'string' ? data.language : undefined,
        latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : undefined,
        dateKey: String(data.dateKey || ''),
        timestamp: safeIso(data.timestamp, new Date().toISOString()),
      };
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const conversations = convSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: String(data.id || d.id),
      title: String(data.title || 'Untitled Conversation'),
      language: String(data.language || 'en'),
      messageCount: Number(data.messageCount || 0) || 0,
      createdAt: safeIso(data.createdAt) || undefined,
      updatedAt: safeIso(data.updatedAt) || undefined,
    };
  });

  const auditLogs: OwnerAuditLogRecord[] = auditSnap.docs
    .map((d) => d.data() as OwnerAuditLogRecord)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const analyticsStats = {
    count: analyticsEvents.length,
    lastTimestamp: analyticsEvents[0]?.timestamp || null,
  };

  const user = mergeAuthAndFirestoreUser({
    uid,
    authUser,
    fsData,
    analyticsStats,
  });

  if (conversations.length > user.conversationCount) {
    user.conversationCount = conversations.length;
  }

  const timeline = buildUserActivityTimeline({
    user,
    conversations,
    analyticsEvents,
    auditLogs,
  });

  return {
    user,
    conversations,
    analyticsEvents,
    auditLogs,
    timeline,
  };
}

export async function applyOwnerProfileUpdate(
  rawUid: string,
  input: OwnerProfileUpdateInput,
  actor: { uid: string; email: string }
): Promise<{ user: OwnerManagedUser; auditLog: OwnerAuditLogRecord }> {
  const uid = safeSafeDocId(rawUid);
  const [auth, db] = await Promise.all([getAdminAuthService(), getAdminDbService()]);

  let authUser: UserRecord | null = null;
  try {
    authUser = await auth.getUser(uid);
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const fsData = userSnap.exists ? userSnap.data() || null : null;

  if (!authUser && !fsData) {
    const notFoundErr = new Error(`User ${uid} not found.`);
    (notFoundErr as any).code = 'auth/user-not-found';
    throw notFoundErr;
  }

  const currentMerged = mergeAuthAndFirestoreUser({ uid, authUser, fsData });
  const validation = validateOwnerProfilePatch(input, currentMerged);

  if (!validation.ok || !validation.firestorePatch || !validation.auditAction) {
    const err = new Error(validation.error || 'Invalid profile update payload.');
    (err as any).statusCode = 400;
    throw err;
  }

  if (validation.authPatch && Object.keys(validation.authPatch).length > 0 && authUser) {
    await auth.updateUser(uid, validation.authPatch);
  }

  const fsDocPayload = userSnap.exists
    ? validation.firestorePatch
    : {
        userId: uid,
        displayName: currentMerged.displayName || 'User',
        email: currentMerged.email || '',
        createdAt: currentMerged.createdAt || new Date().toISOString(),
        ...validation.firestorePatch,
      };

  await userRef.set(fsDocPayload, { merge: true });

  if (validation.leaderboardPatch && Object.keys(validation.leaderboardPatch).length > 0) {
    const lbRef = db.collection('streak_leaderboard').doc(uid);
    const lbSnap = await lbRef.get();
    if (lbSnap.exists) {
      await lbRef.set(
        { ...validation.leaderboardPatch, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    }
  }

  const auditLog = await writeOwnerAuditLog(db, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetUid: uid,
    targetEmail: currentMerged.email || undefined,
    action: validation.auditAction,
    reason: validation.reason || input.reason,
    beforeSnapshot: validation.beforeSnapshot,
    afterSnapshot: validation.afterSnapshot,
  });

  const detail = await getMergedOwnerUserDetail(uid);
  return { user: detail.user, auditLog };
}

export async function applyOwnerStreakUpdate(
  rawUid: string,
  input: OwnerStreakUpdateInput,
  actor: { uid: string; email: string }
): Promise<{ user: OwnerManagedUser; auditLog: OwnerAuditLogRecord }> {
  const uid = safeSafeDocId(rawUid);
  const [auth, db] = await Promise.all([getAdminAuthService(), getAdminDbService()]);

  let authUser: UserRecord | null = null;
  try {
    authUser = await auth.getUser(uid);
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const fsData = userSnap.exists ? userSnap.data() || null : null;

  if (!authUser && !fsData) {
    const notFoundErr = new Error(`User ${uid} not found.`);
    (notFoundErr as any).code = 'auth/user-not-found';
    throw notFoundErr;
  }

  const currentMerged = mergeAuthAndFirestoreUser({ uid, authUser, fsData });
  const validation = validateAndComputeOwnerStreakUpdate(input, currentMerged);

  if (!validation.ok || !validation.firestorePatch) {
    const err = new Error(validation.error || 'Invalid streak update payload.');
    (err as any).statusCode = 400;
    throw err;
  }

  const fsDocPayload = userSnap.exists
    ? validation.firestorePatch
    : {
        userId: uid,
        displayName: currentMerged.displayName || 'User',
        email: currentMerged.email || '',
        createdAt: currentMerged.createdAt || new Date().toISOString(),
        ...validation.firestorePatch,
      };

  await userRef.set(fsDocPayload, { merge: true });

  const lbRef = db.collection('streak_leaderboard').doc(uid);
  const lbSnap = await lbRef.get();
  const nextCurrent = Number(validation.afterSnapshot?.currentStreak ?? 0);
  const nextLongest = Number(validation.afterSnapshot?.longestStreak ?? 0);

  if (lbSnap.exists || nextCurrent >= 1 || nextLongest >= 1) {
    await lbRef.set(
      {
        userId: uid,
        displayName: (currentMerged.displayName || 'User').slice(0, 64),
        ...(currentMerged.photoURL ? { avatarUrl: currentMerged.photoURL } : {}),
        ...(currentMerged.country ? { country: currentMerged.country } : {}),
        ...(currentMerged.countryFlag ? { countryFlag: currentMerged.countryFlag } : {}),
        ...(validation.leaderboardPatch || {}),
      },
      { merge: true }
    );
  }

  const auditLog = await writeOwnerAuditLog(db, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetUid: uid,
    targetEmail: currentMerged.email || undefined,
    action: 'streak_update',
    reason: validation.reason || input.reason,
    beforeSnapshot: validation.beforeSnapshot,
    afterSnapshot: validation.afterSnapshot,
  });

  const detail = await getMergedOwnerUserDetail(uid);
  return { user: detail.user, auditLog };
}

export async function listOwnerUserConversations(rawUid: string) {
  const uid = safeSafeDocId(rawUid);
  const db = await getAdminDbService();
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('conversations')
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: String(data.id || d.id),
      userId: uid,
      title: String(data.title || 'Untitled Conversation'),
      language: String(data.language || 'en'),
      category: typeof data.category === 'string' ? data.category : undefined,
      messageCount: Number(data.messageCount || 0) || 0,
      createdAt: safeIso(data.createdAt) || undefined,
      updatedAt: safeIso(data.updatedAt) || undefined,
    };
  });
}

export async function inspectUserConversationMessagesAudit(params: {
  rawUid: string;
  rawConversationId: string;
  actor: { uid: string; email: string };
  reason?: string;
}) {
  const uid = safeSafeDocId(params.rawUid);
  const convId = safeSafeDocId(params.rawConversationId);
  const reasonCheck = validateOwnerReason(
    params.reason && params.reason.trim().length >= 3
      ? params.reason
      : 'Owner support conversation inspection'
  );
  if (!reasonCheck.ok) {
    const err = new Error(reasonCheck.error || 'Audit reason required.');
    (err as any).statusCode = 400;
    throw err;
  }

  const db = await getAdminDbService();
  const msgSnap = await db
    .collection('users')
    .doc(uid)
    .collection('conversations')
    .doc(convId)
    .collection('messages')
    .orderBy('timestamp', 'asc')
    .limit(150)
    .get();

  const messages = msgSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: String(data.id || d.id),
      role: data.role === 'user' ? 'user' : data.role === 'participant' ? 'participant' : 'model',
      senderName: typeof data.senderName === 'string' ? data.senderName : undefined,
      content: String(data.content || ''),
      translation: typeof data.translation === 'string' ? data.translation : undefined,
      translationLanguage:
        typeof data.translationLanguage === 'string' ? data.translationLanguage : undefined,
      provider: data.provider ? normalizeAIProviderId(data.provider) : undefined,
      modelUsed: typeof data.modelUsed === 'string' ? data.modelUsed : undefined,
      timestamp: safeIso(data.timestamp, new Date().toISOString()),
    };
  });

  const auditLog = await writeOwnerAuditLog(db, {
    actorUid: params.actor.uid,
    actorEmail: params.actor.email,
    targetUid: uid,
    action: 'conversation_inspect',
    reason: reasonCheck.clean,
    beforeSnapshot: {
      conversationId: convId,
      inspectedMessageCount: messages.length,
    },
  });

  return { messages, auditLog };
}

export async function listOwnerAuditLogs(filters?: {
  targetUid?: string;
  action?: OwnerAuditAction | string;
  limit?: number;
}): Promise<OwnerAuditLogRecord[]> {
  const db = await getAdminDbService();
  const maxItems = Math.min(250, Math.max(1, Number(filters?.limit || 150) || 150));

  const snap = await db
    .collection('owner_audit_logs')
    .orderBy('timestamp', 'desc')
    .limit(maxItems)
    .get();

  let logs = snap.docs.map((d) => d.data() as OwnerAuditLogRecord);

  if (filters?.targetUid && filters.targetUid.trim()) {
    const tUid = filters.targetUid.trim();
    logs = logs.filter((l) => l.targetUid === tUid);
  }
  if (filters?.action && filters.action.trim() && filters.action !== 'all') {
    const act = filters.action.trim();
    logs = logs.filter((l) => l.action === act);
  }
  return logs;
}
