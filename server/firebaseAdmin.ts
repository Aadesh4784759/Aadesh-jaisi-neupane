import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { App as AdminApp, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth, UserRecord } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
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

/**
 * Verifies whether the Firebase Admin SDK has already been initialized in memory.
 * Initialization is strictly deferred until an authorized owner-admin operation executes.
 */
export function isFirebaseAdminInitialized(): boolean {
  return cachedAdminApp !== null || getApps().length > 0;
}

function getOrInitAdminApp(): AdminApp {
  if (cachedAdminApp) return cachedAdminApp;
  if (getApps().length > 0) {
    cachedAdminApp = getApp();
    return cachedAdminApp;
  }

  const config = readFirebaseAppletConfig();
  const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKeyRaw = String(process.env.FIREBASE_PRIVATE_KEY || '').trim();

  if (serviceAccountJson) {
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(serviceAccountJson);
    } catch {
      throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON server credential format.');
    }
    cachedCredentialMode = 'service_account_json';
    cachedAdminApp = initializeApp({
      credential: cert(parsed),
      projectId: String(parsed.project_id || config.projectId),
    });
    return cachedAdminApp;
  }

  if (clientEmail && privateKeyRaw) {
    const envProjectId = String(process.env.FIREBASE_PROJECT_ID || config.projectId).trim();
    cachedCredentialMode = 'service_account_env';
    cachedAdminApp = initializeApp({
      credential: cert({
        projectId: envProjectId,
        clientEmail,
        privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
      }),
      projectId: envProjectId,
    });
    return cachedAdminApp;
  }

  cachedCredentialMode = 'adc';
  cachedAdminApp = initializeApp({
    projectId: config.projectId,
  });
  return cachedAdminApp;
}

export function getAdminAuthService(): Auth {
  return getAuth(getOrInitAdminApp());
}

export function getAdminDbService(): Firestore {
  const app = getOrInitAdminApp();
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
    message: sanitizeProviderSecretText(rawMsg).slice(0, 300),
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
  const auth = getAdminAuthService();
  const db = getAdminDbService();

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
  const auth = getAdminAuthService();
  const db = getAdminDbService();

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
  const auth = getAdminAuthService();
  const db = getAdminDbService();

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
  const auth = getAdminAuthService();
  const db = getAdminDbService();

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
  const db = getAdminDbService();
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

  const db = getAdminDbService();
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
  const db = getAdminDbService();
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
