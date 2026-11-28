import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
  Auth,
} from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AIMemoryItem,
  AdminConversationSummary,
  AdminUserRecord,
  AutomationRunLogItem,
  AutomationScheduleItem,
  ChatMessage,
  ChatSession,
  GeneratedImageItem,
  PersonalTask,
  StudyProgressItem,
  SuggestionAnalyticsItem,
  SuggestionCategory,
  UserProfile,
} from '../types';
import { AIProviderId, normalizeAIProviderId } from './aiProviders';
import { OWNER_ADMIN_EMAIL } from './storage';
import {
  buildSuggestionStatId,
  classifySuggestionCategory,
  normalizeSuggestionKey,
} from './suggestionAnalytics';
import {
  applyDailyActivityToStreakState,
  computeLevelInfo,
  getLocalDateKeyInTimezone,
  getRecoveredGapDateKeys,
  GlobalLeaderboardEntry,
  MAX_MONTHLY_STREAK_RECOVERIES,
  NEPAL_TIMEZONE,
  PersistentStreakState,
  RankedLeaderboardEntry,
  rankLeaderboardEntries,
  rankLongestStreakLeaderboardEntries,
  recoverBrokenStreakState,
  resolveEffectiveStreakTimezone,
  resolveValidTimezone,
  StreakActivityTransitionResult,
  StreakRecoveryResult,
} from './gamification';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  auth = getAuth(app);
  const configuredDatabaseId = String(firebaseConfig.firestoreDatabaseId || '').trim();
  db =
    configuredDatabaseId && configuredDatabaseId !== '(default)'
      ? getFirestore(app, configuredDatabaseId)
      : getFirestore(app);
} catch (err) {
  console.warn('Firebase initialization notice:', err);
}

export { app, auth, db };

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid ?? null,
      email: auth?.currentUser?.email ?? null,
      emailVerified: auth?.currentUser?.emailVerified ?? null,
      isAnonymous: auth?.currentUser?.isAnonymous ?? null,
      tenantId: auth?.currentUser?.tenantId ?? null,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Boot connectivity verification against Firestore using a rules-permitted config document
async function testFirestoreConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'admin_settings', 'platform'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration (Firestore client offline).');
    }
  }
}
if (typeof window !== 'undefined') {
  testFirestoreConnection();
}

// Friendly human-readable error messages for Firebase Authentication
export function formatAuthError(errorCodeOrMessage: string): string {
  const raw = String(errorCodeOrMessage || '').trim();
  const code = raw.toLowerCase();
  if (code.includes('auth/email-already-in-use')) {
    return 'This email address is already in use by another account. Please sign in or reset your password.';
  }
  if (
    code.includes('auth/invalid-credential') ||
    code.includes('auth/invalid-login-credentials') ||
    code.includes('auth/wrong-password') ||
    code.includes('auth/user-not-found')
  ) {
    return 'Invalid email or password. Please verify your credentials and try again.';
  }
  if (code.includes('auth/missing-password')) {
    return 'Please enter your password before signing in.';
  }
  if (code.includes('auth/missing-email')) {
    return 'Please enter your email address.';
  }
  if (code.includes('auth/weak-password')) {
    return 'Password is too weak. Please use at least 6 characters with a combination of letters and numbers.';
  }
  if (code.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (code.includes('auth/user-disabled')) {
    return 'This account has been disabled. Please contact support for assistance.';
  }
  if (code.includes('auth/unauthorized-domain')) {
    return 'Sign-in from this domain is not yet authorized in Firebase Authentication settings.';
  }
  if (code.includes('auth/requires-recent-login')) {
    return 'For your security, please sign out and sign back in to complete this action.';
  }
  if (code.includes('auth/user-token-expired')) {
    return 'Your authentication session expired. Please sign in again.';
  }
  if (code.includes('auth/popup-closed-by-user') || code.includes('auth/cancelled-popup-request')) {
    return 'Sign-in popup was closed before completion. Please try again.';
  }
  if (code.includes('auth/popup-blocked')) {
    return 'Sign-in popup was blocked by your browser. Please allow popups for this site and retry.';
  }
  if (code.includes('auth/network-request-failed')) {
    return 'Network connection error. Please check your internet connection and retry.';
  }
  if (code.includes('auth/too-many-requests')) {
    return 'Too many unsuccessful attempts. Access temporarily paused. Please reset your password or wait a moment.';
  }
  if (code.includes('auth/operation-not-allowed')) {
    return 'This sign-in provider is not enabled yet in Firebase Console Authentication settings.';
  }
  const cleaned = raw.replace(/^Firebase:\s*Error\s*\(([^)]+)\)\.?/i, '$1').replace(/^auth\//i, '').replace(/-/g, ' ').trim();
  return cleaned && cleaned !== raw ? `Authentication error: ${cleaned}. Please try again.` : raw || 'Authentication failed. Please try again.';
}

export async function signInWithGoogle() {
  if (!auth) throw new Error('Firebase Auth is not initialized');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return await signInWithPopup(auth, provider);
}

export async function registerWithEmail(email: string, pass: string, displayName: string) {
  if (!auth) throw new Error('Firebase Auth is not initialized');
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  if (credential.user && displayName.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }
  if (credential.user) {
    try {
      await sendEmailVerification(credential.user);
    } catch (err) {
      console.warn('Initial verification email dispatch notice:', err);
      throw err;
    }
  }
  return credential.user;
}

export async function loginWithEmail(email: string, pass: string) {
  if (!auth) throw new Error('Firebase Auth is not initialized');
  const credential = await signInWithEmailAndPassword(auth, email.trim(), pass);
  return credential.user;
}

export async function resendVerificationEmail() {
  if (!auth?.currentUser) throw new Error('No user currently signed in');
  await sendEmailVerification(auth.currentUser);
}

export async function refreshCurrentUserVerification(): Promise<FirebaseUser | null> {
  if (!auth?.currentUser) return null;
  await reload(auth.currentUser);
  if (auth.currentUser.emailVerified) {
    await auth.currentUser.getIdToken(true);
  }
  return auth.currentUser;
}

export async function resetPassword(email: string) {
  if (!auth) throw new Error('Firebase Auth is not initialized');
  return await sendPasswordResetEmail(auth, email.trim());
}

export async function updateUserProfile(data: { displayName?: string; photoURL?: string }) {
  if (!auth || !auth.currentUser) throw new Error('No user currently signed in');
  await updateProfile(auth.currentUser, data);
  return auth.currentUser;
}

export async function logOut() {
  if (!auth) return;
  return await signOut(auth);
}

export async function getCurrentIdToken(forceRefresh: boolean = false): Promise<string | null> {
  if (!auth?.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

export async function getAuthHeaders(
  extraHeaders: Record<string, string> = {}
): Promise<Record<string, string>> {
  const token = await getCurrentIdToken();
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function subscribeToAuth(callback: (user: FirebaseUser | null) => void) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

// ---------------- FIRESTORE USER & CHAT SYNC ----------------

function safeDocId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-');
  return cleaned.slice(0, 128) || `id-${Date.now()}`;
}

export function sanitizeFiniteInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number = min
): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function resolveSafeDisplayName(
  ...candidates: Array<string | null | undefined>
): string {
  for (const raw of candidates) {
    const trimmed = String(raw || '').trim();
    if (trimmed.length >= 1) {
      return trimmed.slice(0, 100);
    }
  }
  return 'User';
}

export async function syncUserProfileToFirestore(
  profile: UserProfile & {
    preferredTheme?: string;
    memoryConsent?: 'pending' | 'agreed' | 'disagreed';
    aiProvider?: AIProviderId;
    aiModel?: string;
    openRouterModel?: string;
    aiResponseLanguage?: string;
    autoDetectInputLanguage?: boolean;
    translationEnabled?: boolean;
    translationLanguage?: string;
  }
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== profile.id) return;
  const uid = safeDocId(profile.id);
  const docRef = doc(db, 'users', uid);

  try {
    let existingSnap;
    try {
      existingSnap = await getDocFromServer(docRef);
    } catch (serverErr: any) {
      if (classifyFirestoreErrorKind(serverErr) === 'unavailable') {
        existingSnap = await getDoc(docRef);
      } else {
        throw serverErr;
      }
    }

    const nowIso = new Date().toISOString();
    const creationTime = auth.currentUser.metadata.creationTime
      ? new Date(auth.currentUser.metadata.creationTime).toISOString()
      : profile.createdAt && Number.isFinite(profile.createdAt)
      ? new Date(profile.createdAt).toISOString()
      : nowIso;

    const isVerifiedOwner =
      (auth.currentUser.email || '').toLowerCase() === OWNER_ADMIN_EMAIL &&
      auth.currentUser.emailVerified;

    const safeStreakDays = sanitizeFiniteInt(profile.streakDays, 0, 10000, 0);
    const safeLongestStreak = Math.max(
      safeStreakDays,
      sanitizeFiniteInt(profile.longestStreak, 0, 10000, 0)
    );
    const safeLastActiveDate = String(profile.lastActiveDate || '').trim().slice(0, 20);
    const safeDisplayName = resolveSafeDisplayName(
      profile.name,
      auth.currentUser.displayName,
      auth.currentUser.email ? auth.currentUser.email.split('@')[0] : undefined
    );

    const coreCreatePayload = {
      userId: uid,
      displayName: safeDisplayName,
      username: (String(profile.username || 'user').trim() || 'user').slice(0, 64),
      email: String(profile.email || '').slice(0, 160),
      photoURL: String(profile.avatarUrl || '').slice(0, 1000),
      preferredLanguage: (String(profile.preferredLanguage || 'en').trim() || 'en').slice(0, 20),
      status: 'active',
      role: isVerifiedOwner ? 'admin' : 'user',
      provider: (String(profile.provider || 'email').trim() || 'email').slice(0, 32),
      messageCount: 0,
      conversationCount: 1,
      createdAt: creationTime.slice(0, 50),
      updatedAt: nowIso,
      lastActiveAt: nowIso,
    };

    const nonStreakExtendedFields = {
      ...(profile.preferredTheme ? { preferredTheme: String(profile.preferredTheme).slice(0, 40) } : {}),
      ...(profile.aiProvider ? { aiProvider: normalizeAIProviderId(profile.aiProvider) } : {}),
      ...(profile.aiModel ? { aiModel: String(profile.aiModel).slice(0, 120) } : {}),
      ...(profile.openRouterModel ? { openRouterModel: String(profile.openRouterModel).slice(0, 120) } : {}),
      ...(profile.aiResponseLanguage ? { aiResponseLanguage: String(profile.aiResponseLanguage).slice(0, 20) } : {}),
      ...(typeof profile.autoDetectInputLanguage === 'boolean'
        ? { autoDetectInputLanguage: profile.autoDetectInputLanguage }
        : {}),
      ...(typeof profile.translationEnabled === 'boolean'
        ? { translationEnabled: profile.translationEnabled }
        : {}),
      ...(profile.translationLanguage
        ? { translationLanguage: String(profile.translationLanguage).slice(0, 20) }
        : {}),
      ...(profile.nickname ? { nickname: String(profile.nickname).slice(0, 64) } : {}),
      ...(typeof profile.age === 'number' && Number.isFinite(profile.age) && profile.age > 0 && profile.age <= 130
        ? { age: Math.floor(profile.age) }
        : {}),
      ...(typeof profile.onboardingCompleted === 'boolean'
        ? { onboardingCompleted: profile.onboardingCompleted }
        : {}),
      ...(profile.memoryConsent ? { memoryConsent: profile.memoryConsent } : {}),
      termsAccepted: profile.termsAccepted ?? true,
      termsAcceptedAt: (profile.termsAcceptedAt || nowIso).slice(0, 50),
      country: (profile.country || 'Global').slice(0, 80),
      countryCode: (profile.countryCode || 'GL').slice(0, 10),
      countryFlag: (profile.countryFlag || '🌐').slice(0, 16),
      timezone: resolveEffectiveStreakTimezone(profile.timezone).slice(0, 64),
      countryDetectionMethod: profile.countryDetectionMethod || 'timezone',
      isManualCountry: Boolean(profile.isManualCountry),
      ...(typeof profile.streakGoalDays === 'number' &&
      Number.isFinite(profile.streakGoalDays) &&
      profile.streakGoalDays >= 1 &&
      profile.streakGoalDays <= 365
        ? { streakGoalDays: Math.floor(profile.streakGoalDays) }
        : {}),
      ...(typeof profile.xp === 'number' && Number.isFinite(profile.xp) && profile.xp >= 0
        ? { xp: Math.floor(profile.xp) }
        : {}),
      ...(typeof profile.level === 'number' && Number.isFinite(profile.level) && profile.level >= 1
        ? { level: Math.min(100, Math.floor(profile.level)) }
        : {}),
      ...(profile.levelTitle ? { levelTitle: String(profile.levelTitle).slice(0, 40) } : {}),
      ...(Array.isArray(profile.recoveredDates) && profile.recoveredDates.length > 0
        ? { recoveredDates: profile.recoveredDates.slice(0, 120) }
        : {}),
    };

    const streakFieldsPayload = {
      streakDays: safeStreakDays,
      currentStreak: safeStreakDays,
      longestStreak: safeLongestStreak,
      ...(safeLastActiveDate ? { lastActiveDate: safeLastActiveDate } : {}),
      ...(typeof profile.recoveryCount === 'number'
        ? { recoveryCount: Math.max(0, Math.min(MAX_MONTHLY_STREAK_RECOVERIES, Math.floor(profile.recoveryCount))) }
        : {}),
      ...(profile.recoveryMonth ? { recoveryMonth: profile.recoveryMonth.slice(0, 16) } : {}),
      ...(typeof profile.streakBeforeBreak === 'number' ? { streakBeforeBreak: profile.streakBeforeBreak } : {}),
      ...(profile.streakBrokenDate ? { streakBrokenDate: profile.streakBrokenDate.slice(0, 20) } : {}),
    };

    if (!existingSnap.exists()) {
      try {
        await setDoc(docRef, { ...coreCreatePayload, ...nonStreakExtendedFields, ...streakFieldsPayload });
      } catch (writeErr: any) {
        if (String(writeErr?.code || writeErr?.message || '').toLowerCase().includes('permission')) {
          await setDoc(docRef, coreCreatePayload).catch(() => {});
        }
      }
    } else {
      const existingData = existingSnap.data() || {};
      const existingHasStreakRecord =
        Boolean(existingData.lastActiveDate || existingData.last_active_date) ||
        Number(existingData.currentStreak ?? existingData.current_streak ?? existingData.streakDays ?? 0) > 0 ||
        Number(existingData.longestStreak ?? existingData.longest_streak ?? 0) > 0;

      // CRITICAL DATA SAFETY: Never overwrite an existing Firestore streak document with 0 or stale local state.
      // Streak increments and recoveries are persisted exclusively through atomic Firestore transactions.
      const safeStreakBackfill =
        !existingHasStreakRecord && (safeStreakDays > 0 || Boolean(safeLastActiveDate))
          ? streakFieldsPayload
          : {};

      const existingXp = typeof existingData.xp === 'number' && Number.isFinite(existingData.xp) ? existingData.xp : 0;
      const safeMergedXp = Math.max(existingXp, Math.floor(Number(profile.xp ?? 0) || 0));
      const safeLevelInfo = computeLevelInfo(safeMergedXp);

      const coreUpdatePayload = {
        ...(!existingData.userId || existingData.userId !== uid ? { userId: uid } : {}),
        displayName: safeDisplayName,
        username: (String(profile.username || 'user').trim() || 'user').slice(0, 64),
        email: String(profile.email || '').slice(0, 160),
        photoURL: String(profile.avatarUrl || '').slice(0, 1000),
        preferredLanguage: (String(profile.preferredLanguage || 'en').trim() || 'en').slice(0, 20),
        provider: (String(profile.provider || 'email').trim() || 'email').slice(0, 32),
        updatedAt: nowIso,
        lastActiveAt: nowIso,
      };
      try {
        await updateDoc(docRef, {
          ...coreUpdatePayload,
          ...nonStreakExtendedFields,
          xp: safeMergedXp,
          level: Math.max(sanitizeFiniteInt(existingData.level, 1, 100, 1), sanitizeFiniteInt(profile.level, 1, 100, safeLevelInfo.level)),
          levelTitle: (profile.levelTitle || safeLevelInfo.levelTitle || 'Novice').slice(0, 40),
          ...safeStreakBackfill,
        });
      } catch (updateErr: any) {
        if (classifyFirestoreErrorKind(updateErr) === 'permission_denied') {
          await updateDoc(docRef, coreUpdatePayload).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn('Firestore user profile sync warning:', err);
  }
}

export type FirestoreUserProfileRecord = Partial<UserProfile> & {
  preferredTheme?: string;
  memoryConsent?: 'pending' | 'agreed' | 'disagreed';
  aiProvider?: AIProviderId;
  aiModel?: string;
  openRouterModel?: string;
  aiResponseLanguage?: string;
  autoDetectInputLanguage?: boolean;
  translationEnabled?: boolean;
  translationLanguage?: string;
};

export type FirestoreErrorKind = 'permission_denied' | 'unavailable' | 'other';

/**
 * Classifies Firestore SDK errors cleanly so callers NEVER confuse a `permission-denied`
 * error with a missing (`not_found`) document or offline/unavailable transport failure.
 */
export function classifyFirestoreErrorKind(err: unknown): FirestoreErrorKind {
  const code = String((err as any)?.code || '').toLowerCase();
  const msg = String((err as any)?.message || err || '').toLowerCase();
  if (
    code.includes('permission-denied') ||
    code.includes('permission_denied') ||
    msg.includes('missing or insufficient permissions') ||
    msg.includes('permission denied') ||
    msg.includes('permission-denied')
  ) {
    return 'permission_denied';
  }
  if (
    code.includes('unavailable') ||
    code.includes('failed-precondition') ||
    msg.includes('offline') ||
    msg.includes('unavailable')
  ) {
    return 'unavailable';
  }
  return 'other';
}

export type FirestoreProfileLoadResult =
  | { status: 'found'; profile: FirestoreUserProfileRecord }
  | { status: 'not_found' }
  | { status: 'permission_denied'; error: string }
  | { status: 'error'; error: string };

/**
 * Loads the authenticated user's profile from Firestore (`users/{uid}`) with explicit status.
 * Attempts a fresh server read first (preventing stale empty caches across refresh/logout-login),
 * falls back to cached `getDoc` if offline, and explicitly separates missing documents (`not_found`)
 * from Firestore authorization failures (`permission_denied`).
 */
export async function loadUserProfileFromFirestoreWithStatus(
  uid: string
): Promise<FirestoreProfileLoadResult> {
  if (!db || !auth?.currentUser) {
    return { status: 'error', error: 'Firestore or authenticated session unavailable' };
  }
  if (auth.currentUser.uid !== uid) {
    return { status: 'permission_denied', error: 'Authenticated UID does not match requested profile' };
  }
  const safeUid = safeDocId(uid);
  const docRef = doc(db, 'users', safeUid);
  try {
    let snap;
    try {
      snap = await getDocFromServer(docRef);
    } catch (serverErr: any) {
      // Only fall back to local cache for offline/unavailable transport errors
      if (classifyFirestoreErrorKind(serverErr) === 'unavailable') {
        snap = await getDoc(docRef);
      } else {
        throw serverErr;
      }
    }

    if (!snap.exists()) {
      return { status: 'not_found' };
    }

    const data = snap.data();
    return {
      status: 'found',
      profile: {
        name: data.displayName,
        nickname: typeof data.nickname === 'string' ? data.nickname : undefined,
        age: typeof data.age === 'number' ? data.age : undefined,
        onboardingCompleted:
          typeof data.onboardingCompleted === 'boolean' ? data.onboardingCompleted : undefined,
        memoryConsent:
          data.memoryConsent === 'agreed' || data.memoryConsent === 'disagreed' || data.memoryConsent === 'pending'
            ? data.memoryConsent
            : undefined,
        username: data.username,
        email: data.email,
        avatarUrl: data.photoURL,
        preferredLanguage: data.preferredLanguage,
        country: data.country || data.country_name,
        countryCode: data.countryCode || data.country_code,
        countryFlag: data.countryFlag,
        timezone: data.timezone,
        countryDetectionMethod: data.countryDetectionMethod,
        isManualCountry: typeof data.isManualCountry === 'boolean' ? data.isManualCountry : undefined,
        termsAccepted: data.termsAccepted,
        termsAcceptedAt: data.termsAcceptedAt,
        preferredTheme: data.preferredTheme,
        aiProvider:
          data.aiProvider === 'gemini' || data.aiProvider === 'groq' || data.aiProvider === 'openrouter'
            ? data.aiProvider
            : undefined,
        aiModel: typeof data.aiModel === 'string' ? data.aiModel.slice(0, 120) : undefined,
        openRouterModel:
          typeof data.openRouterModel === 'string' ? data.openRouterModel.slice(0, 120) : undefined,
        aiResponseLanguage:
          typeof data.aiResponseLanguage === 'string' ? data.aiResponseLanguage.slice(0, 20) : undefined,
        autoDetectInputLanguage:
          typeof data.autoDetectInputLanguage === 'boolean' ? data.autoDetectInputLanguage : undefined,
        translationEnabled:
          typeof data.translationEnabled === 'boolean' ? data.translationEnabled : undefined,
        translationLanguage:
          typeof data.translationLanguage === 'string' ? data.translationLanguage.slice(0, 20) : undefined,
        streakDays:
          typeof data.currentStreak === 'number'
            ? data.currentStreak
            : typeof data.current_streak === 'number'
            ? data.current_streak
            : typeof data.streakDays === 'number'
            ? data.streakDays
            : undefined,
        currentStreak:
          typeof data.currentStreak === 'number'
            ? data.currentStreak
            : typeof data.current_streak === 'number'
            ? data.current_streak
            : typeof data.streakDays === 'number'
            ? data.streakDays
            : undefined,
        longestStreak:
          typeof data.longestStreak === 'number'
            ? data.longestStreak
            : typeof data.longest_streak === 'number'
            ? data.longest_streak
            : undefined,
        lastActiveDate:
          typeof data.lastActiveDate === 'string'
            ? data.lastActiveDate
            : typeof data.last_active_date === 'string'
            ? data.last_active_date
            : undefined,
        recoveryCount:
          typeof data.recoveryCount === 'number'
            ? data.recoveryCount
            : typeof data.recovery_count === 'number'
            ? data.recovery_count
            : undefined,
        recoveryMonth:
          typeof data.recoveryMonth === 'string'
            ? data.recoveryMonth
            : typeof data.recovery_month === 'string'
            ? data.recovery_month
            : undefined,
        streakBeforeBreak: typeof data.streakBeforeBreak === 'number' ? data.streakBeforeBreak : undefined,
        streakBrokenDate: typeof data.streakBrokenDate === 'string' ? data.streakBrokenDate : undefined,
        xp: typeof data.xp === 'number' && Number.isFinite(data.xp) ? Math.max(0, Math.floor(data.xp)) : undefined,
        level: typeof data.level === 'number' && Number.isFinite(data.level) ? Math.max(1, Math.floor(data.level)) : undefined,
        levelTitle: typeof data.levelTitle === 'string' ? data.levelTitle : undefined,
        streakGoalDays:
          typeof data.streakGoalDays === 'number' && Number.isFinite(data.streakGoalDays)
            ? Math.max(1, Math.min(365, Math.floor(data.streakGoalDays)))
            : undefined,
        recoveredDates: Array.isArray(data.recoveredDates)
          ? data.recoveredDates.filter((d: unknown): d is string => typeof d === 'string').slice(0, 120)
          : undefined,
        status: data.status || 'active',
        role: data.role || 'user',
        createdAt: data.createdAt ? new Date(data.createdAt).getTime() : undefined,
        lastActiveAt: data.lastActiveAt ? new Date(data.lastActiveAt).getTime() : undefined,
      },
    };
  } catch (err: any) {
    const errKind = classifyFirestoreErrorKind(err);
    const errMsg = err?.message || 'Failed to read user profile from Firestore';
    console.warn('Load user profile warning:', err);
    if (errKind === 'permission_denied') {
      return { status: 'permission_denied', error: errMsg };
    }
    return { status: 'error', error: errMsg };
  }
}

export async function loadUserProfileFromFirestore(
  uid: string
): Promise<FirestoreUserProfileRecord | null> {
  const res = await loadUserProfileFromFirestoreWithStatus(uid);
  return res.status === 'found' ? res.profile : null;
}

export interface StreakCreateDocMeta {
  displayName?: string;
  username?: string;
  email?: string;
  photoURL?: string;
  preferredLanguage?: string;
  provider?: string;
  role?: 'user' | 'admin';
  createdAt?: number;
}

export type StreakErrorCode = 'unauthenticated' | 'permission_denied' | 'unavailable' | 'other';

export type StreakTransactionSafeResult =
  | { ok: true; result: StreakActivityTransitionResult }
  | { ok: false; errorCode: StreakErrorCode; error: string };

/**
 * Atomic Firestore transaction to record a daily active streak day for an authenticated user (`users/{uid}`).
 * - Uses the user's permanent Firebase UID as the single document identifier (no duplicate Streak documents).
 * - Creates the `users/{uid}` document atomically if it does not yet exist.
 * - Prevents duplicate same-day increments across concurrent tabs, rapid refreshes, or multiple devices.
 * - Reports Firestore read/write errors explicitly without silently resetting values to 0.
 */
export interface StreakTransactionAdapter {
  userId: string;
  authEmail?: string | null;
  authEmailVerified?: boolean;
  authDisplayName?: string | null;
  authCreationTime?: string | null;
  runTx: <T>(
    executor: (ops: {
      getDoc: () => Promise<{ exists: boolean; data: Record<string, any> }>;
      updateDoc: (patch: Record<string, any>) => Promise<void> | void;
      setDoc: (docData: Record<string, any>) => Promise<void> | void;
    }) => Promise<T>
  ) => Promise<T>;
  fallbackSetDoc?: (docData: Record<string, any>) => Promise<void>;
  fallbackUpdateDoc?: (patch: Record<string, any>) => Promise<void>;
}

/**
 * Pure adapter-backed execution of the atomic streak transaction so both live Firestore
 * (`recordDailyStreakActivityInFirestoreSafe`) and integration tests in `src/tests/firestore.test.ts`
 * run the exact same transaction read/merge/write logic.
 */
export async function executeDailyStreakTransactionCore(
  adapter: StreakTransactionAdapter,
  preferredTimeZone: string = NEPAL_TIMEZONE,
  nowMs: number = Date.now(),
  createMeta?: StreakCreateDocMeta,
  localSeedState?: Partial<PersistentStreakState> | null
): Promise<StreakTransactionSafeResult> {
  const uid = safeDocId(adapter.userId);
  let computedTransition: StreakActivityTransitionResult | null = null;
  let docExisted = false;

  const buildMergedServerState = (data: Record<string, any>, effectiveTz: string) => {
    const fsCurrent = sanitizeFiniteInt(data.currentStreak ?? data.current_streak ?? data.streakDays, 0, 10000, 0);
    const fsLongest = sanitizeFiniteInt(data.longestStreak ?? data.longest_streak, 0, 10000, 0);
    const fsLastDate = String(data.lastActiveDate ?? data.last_active_date ?? '').trim().slice(0, 20);
    const serverHasRecord = Boolean(fsLastDate) || fsCurrent > 0 || fsLongest > 0;

    const seed = localSeedState || null;
    const seedLastDate = String(seed?.lastActiveDate || '').trim().slice(0, 20);
    const seedCurrent = sanitizeFiniteInt(seed?.currentStreak, 0, 10000, 0);
    const seedLongest = sanitizeFiniteInt(seed?.longestStreak, 0, 10000, 0);
    const seedHasRecord = Boolean(seedLastDate) || seedCurrent > 0 || seedLongest > 0;

    const useSeed =
      seedHasRecord &&
      (!serverHasRecord ||
        (seedLastDate !== '' && (fsLastDate === '' || seedLastDate > fsLastDate)) ||
        (seedLastDate === fsLastDate && seedCurrent > fsCurrent));

    const fsRecoveryCount = sanitizeFiniteInt(
      data.recoveryCount ?? data.recovery_count,
      0,
      MAX_MONTHLY_STREAK_RECOVERIES,
      0
    );
    const seedRecoveryCount = sanitizeFiniteInt(
      seed?.recoveryCount,
      0,
      MAX_MONTHLY_STREAK_RECOVERIES,
      0
    );

    return {
      currentStreak: useSeed ? seedCurrent : fsCurrent,
      longestStreak: Math.max(fsLongest, fsCurrent, seedLongest, seedCurrent),
      lastActiveDate: useSeed ? seedLastDate : fsLastDate,
      timezone: effectiveTz,
      recoveryCount: Math.max(fsRecoveryCount, seedRecoveryCount),
      recoveryMonth:
        (String(data.recoveryMonth ?? data.recovery_month ?? '').trim() ||
          String(seed?.recoveryMonth ?? '').trim()).slice(0, 16),
      streakBeforeBreak: sanitizeFiniteInt(
        data.streakBeforeBreak ?? seed?.streakBeforeBreak,
        0,
        10000,
        0
      ),
      streakBrokenDate: String(data.streakBrokenDate ?? seed?.streakBrokenDate ?? '').trim().slice(0, 20),
    };
  };

  try {
    const transition = await adapter.runTx(async (txOps) => {
      const snap = await txOps.getDoc();
      docExisted = snap.exists;
      const data = snap.exists ? snap.data : {};
      const effectiveTz = resolveEffectiveStreakTimezone(
        preferredTimeZone && preferredTimeZone !== 'UTC' && preferredTimeZone !== 'Etc/UTC'
          ? preferredTimeZone
          : typeof data.timezone === 'string'
          ? data.timezone
          : undefined,
        preferredTimeZone
      );

      const serverState = buildMergedServerState(data, effectiveTz);
      const nextTransition = applyDailyActivityToStreakState(serverState, nowMs, effectiveTz);
      computedTransition = nextTransition;
      const next = nextTransition.nextState;
      const nowIso = new Date(nowMs).toISOString();

      const safeNextCurrent = sanitizeFiniteInt(next.currentStreak, 0, 10000, 0);
      const safeNextLongest = Math.max(safeNextCurrent, sanitizeFiniteInt(next.longestStreak, 0, 10000, 0));
      const safeNextRecoveryCount = sanitizeFiniteInt(
        next.recoveryCount,
        0,
        MAX_MONTHLY_STREAK_RECOVERIES,
        0
      );
      const safeNextBeforeBreak = sanitizeFiniteInt(next.streakBeforeBreak, 0, 10000, 0);
      const safeNextLastActive = String(next.lastActiveDate || '').trim().slice(0, 20);
      const safeNextRecoveryMonth = String(next.recoveryMonth || '').trim().slice(0, 16);
      const safeNextBrokenDate = String(next.streakBrokenDate || '').trim().slice(0, 20);
      const safeNextTz = String(next.timezone || NEPAL_TIMEZONE).trim().slice(0, 64) || NEPAL_TIMEZONE;

      const safeDisplayName = resolveSafeDisplayName(
        createMeta?.displayName,
        adapter.authDisplayName,
        adapter.authEmail ? adapter.authEmail.split('@')[0] : undefined
      );

      if (snap.exists) {
        const unchanged =
          data.userId === uid &&
          typeof data.displayName === 'string' &&
          data.displayName.trim().length > 0 &&
          data.currentStreak === safeNextCurrent &&
          data.streakDays === safeNextCurrent &&
          data.longestStreak === safeNextLongest &&
          data.lastActiveDate === safeNextLastActive &&
          data.timezone === safeNextTz &&
          data.recoveryCount === safeNextRecoveryCount &&
          String(data.recoveryMonth ?? '') === safeNextRecoveryMonth &&
          sanitizeFiniteInt(data.streakBeforeBreak, 0, 10000, 0) === safeNextBeforeBreak &&
          String(data.streakBrokenDate ?? '') === safeNextBrokenDate;

        if (!unchanged) {
          const identityBackfill: Record<string, any> = {};
          if (!data.userId || typeof data.userId !== 'string' || data.userId !== uid) {
            identityBackfill.userId = uid;
          }
          if (!data.displayName || typeof data.displayName !== 'string' || !data.displayName.trim()) {
            identityBackfill.displayName = safeDisplayName;
          }

          await txOps.updateDoc({
            ...identityBackfill,
            streakDays: safeNextCurrent,
            currentStreak: safeNextCurrent,
            longestStreak: safeNextLongest,
            lastActiveDate: safeNextLastActive,
            timezone: safeNextTz,
            recoveryCount: safeNextRecoveryCount,
            recoveryMonth: safeNextRecoveryMonth,
            streakBeforeBreak: safeNextBeforeBreak,
            streakBrokenDate: safeNextBrokenDate,
            updatedAt: nowIso,
            lastActiveAt: nowIso,
          });
        }
      } else {
        const isVerifiedOwner =
          (adapter.authEmail || '').toLowerCase() === OWNER_ADMIN_EMAIL &&
          Boolean(adapter.authEmailVerified);
        const creationTime = adapter.authCreationTime
          ? new Date(adapter.authCreationTime).toISOString()
          : createMeta?.createdAt && Number.isFinite(createMeta.createdAt)
          ? new Date(createMeta.createdAt).toISOString()
          : nowIso;
        const fallbackHandle =
          createMeta?.username?.trim() ||
          safeDisplayName.toLowerCase().replace(/[^a-z0-9_]/g, '') ||
          'user';

        await txOps.setDoc({
          userId: uid,
          displayName: safeDisplayName,
          username: fallbackHandle.slice(0, 64),
          email: String(createMeta?.email || adapter.authEmail || '').slice(0, 160),
          photoURL: String(createMeta?.photoURL || '').slice(0, 1000),
          preferredLanguage: (String(createMeta?.preferredLanguage || 'en').trim() || 'en').slice(0, 20),
          status: 'active',
          role: isVerifiedOwner ? 'admin' : 'user',
          provider: (String(createMeta?.provider || 'email').trim() || 'email').slice(0, 32),
          messageCount: 0,
          conversationCount: 1,
          createdAt: creationTime.slice(0, 50),
          updatedAt: nowIso,
          lastActiveAt: nowIso,
          streakDays: safeNextCurrent,
          currentStreak: safeNextCurrent,
          longestStreak: safeNextLongest,
          lastActiveDate: safeNextLastActive,
          timezone: safeNextTz,
          recoveryCount: safeNextRecoveryCount,
          recoveryMonth: safeNextRecoveryMonth,
          streakBeforeBreak: safeNextBeforeBreak,
          streakBrokenDate: safeNextBrokenDate,
        });
      }

      return nextTransition;
    });
    return { ok: true, result: transition };
  } catch (err: any) {
    if (classifyFirestoreErrorKind(err) === 'permission_denied' && computedTransition) {
      const next = (computedTransition as StreakActivityTransitionResult).nextState;
      const nowIso = new Date(nowMs).toISOString();
      const safeNextCurrent = sanitizeFiniteInt(next.currentStreak, 0, 10000, 0);
      const safeNextLongest = Math.max(safeNextCurrent, sanitizeFiniteInt(next.longestStreak, 0, 10000, 0));
      const safeNextRecoveryCount = sanitizeFiniteInt(
        next.recoveryCount,
        0,
        MAX_MONTHLY_STREAK_RECOVERIES,
        0
      );
      const safeNextLastActive = String(next.lastActiveDate || '').trim().slice(0, 20);
      const safeNextRecoveryMonth = String(next.recoveryMonth || '').trim().slice(0, 16);
      const safeNextTz = String(next.timezone || NEPAL_TIMEZONE).trim().slice(0, 64) || NEPAL_TIMEZONE;
      const safeDisplayName = resolveSafeDisplayName(
        createMeta?.displayName,
        adapter.authDisplayName,
        adapter.authEmail ? adapter.authEmail.split('@')[0] : undefined
      );

      if (!docExisted && adapter.fallbackSetDoc) {
        try {
          await adapter.fallbackSetDoc({
            userId: uid,
            displayName: safeDisplayName,
            email: String(createMeta?.email || adapter.authEmail || '').slice(0, 160),
            role: 'user',
            status: 'active',
            createdAt: nowIso,
            updatedAt: nowIso,
            lastActiveAt: nowIso,
            streakDays: safeNextCurrent,
            currentStreak: safeNextCurrent,
            longestStreak: safeNextLongest,
            lastActiveDate: safeNextLastActive,
            timezone: safeNextTz,
            recoveryCount: safeNextRecoveryCount,
            recoveryMonth: safeNextRecoveryMonth,
          });
          return { ok: true, result: computedTransition };
        } catch {
          // Fall through
        }
      } else if (docExisted && adapter.fallbackUpdateDoc) {
        const fallbackPayloads: Record<string, any>[] = [
          {
            streakDays: safeNextCurrent,
            currentStreak: safeNextCurrent,
            longestStreak: safeNextLongest,
            lastActiveDate: safeNextLastActive,
            timezone: safeNextTz,
            recoveryCount: safeNextRecoveryCount,
            recoveryMonth: safeNextRecoveryMonth,
            updatedAt: nowIso,
            lastActiveAt: nowIso,
          },
          {
            displayName: safeDisplayName,
            streakDays: safeNextCurrent,
            currentStreak: safeNextCurrent,
            longestStreak: safeNextLongest,
            lastActiveDate: safeNextLastActive,
            timezone: safeNextTz,
            recoveryCount: safeNextRecoveryCount,
            recoveryMonth: safeNextRecoveryMonth,
            updatedAt: nowIso,
            lastActiveAt: nowIso,
          },
          {
            streakDays: safeNextCurrent,
            currentStreak: safeNextCurrent,
            longestStreak: safeNextLongest,
            lastActiveDate: safeNextLastActive,
            updatedAt: nowIso,
            lastActiveAt: nowIso,
          },
          {
            streakDays: safeNextCurrent,
            lastActiveDate: safeNextLastActive,
            updatedAt: nowIso,
            lastActiveAt: nowIso,
          },
        ];
        for (const payload of fallbackPayloads) {
          try {
            await adapter.fallbackUpdateDoc(payload);
            return { ok: true, result: computedTransition };
          } catch {
            // Try next subset
          }
        }
      }
    }
    console.warn('Atomic streak activity transaction warning:', err);
    return {
      ok: false,
      errorCode: classifyFirestoreErrorKind(err),
      error: err?.message || 'Failed to save streak transaction to Firestore',
    };
  }
}

export async function recordDailyStreakActivityInFirestoreSafe(
  userId: string,
  preferredTimeZone: string = NEPAL_TIMEZONE,
  nowMs: number = Date.now(),
  createMeta?: StreakCreateDocMeta,
  localSeedState?: Partial<PersistentStreakState> | null
): Promise<StreakTransactionSafeResult> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) {
    return {
      ok: false,
      errorCode: 'unauthenticated',
      error: 'Authenticated Firebase user required for streak persistence',
    };
  }
  const firestore = db;
  const currentAuthUser = auth.currentUser;
  const uid = safeDocId(userId);
  const docRef = doc(firestore, 'users', uid);

  return executeDailyStreakTransactionCore(
    {
      userId: uid,
      authEmail: currentAuthUser.email,
      authEmailVerified: currentAuthUser.emailVerified,
      authDisplayName: currentAuthUser.displayName,
      authCreationTime: currentAuthUser.metadata.creationTime,
      runTx: (executor) =>
        runTransaction(firestore, async (tx) =>
          executor({
            getDoc: async () => {
              const snap = await tx.get(docRef);
              return { exists: snap.exists(), data: snap.exists() ? snap.data() : {} };
            },
            updateDoc: (patch) => {
              tx.update(docRef, patch);
            },
            setDoc: (docData) => {
              tx.set(docRef, docData);
            },
          })
        ),
      fallbackSetDoc: (docData) => setDoc(docRef, docData),
      fallbackUpdateDoc: (patch) => updateDoc(docRef, patch),
    },
    preferredTimeZone,
    nowMs,
    {
      ...createMeta,
      photoURL: String(createMeta?.photoURL || currentAuthUser.photoURL || '').slice(0, 1000),
    },
    localSeedState
  );
}

export async function recordDailyStreakActivityInFirestore(
  userId: string,
  preferredTimeZone: string = NEPAL_TIMEZONE,
  nowMs: number = Date.now(),
  createMeta?: StreakCreateDocMeta,
  localSeedState?: Partial<PersistentStreakState> | null
): Promise<StreakActivityTransitionResult | null> {
  const res = await recordDailyStreakActivityInFirestoreSafe(
    userId,
    preferredTimeZone,
    nowMs,
    createMeta,
    localSeedState
  );
  return res.ok ? res.result : null;
}

/**
 * Atomic Firestore transaction to recover an eligible broken streak (max 5 recoveries per calendar month).
 * Prevents concurrent or repeated recovery requests from consuming multiple monthly credits.
 */
export async function recoverDailyStreakInFirestore(
  userId: string,
  preferredTimeZone: string = NEPAL_TIMEZONE,
  nowMs: number = Date.now()
): Promise<(StreakRecoveryResult & { recoveredDates?: string[] }) | null> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return null;
  const firestore = db;
  const uid = safeDocId(userId);
  const docRef = doc(firestore, 'users', uid);

  try {
    let bridgedDates: string[] = [];
    let resolvedTzForLog = resolveEffectiveStreakTimezone(preferredTimeZone);
    const txResult = await runTransaction(firestore, async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists()) return null;
      const data = snap.data();
      const effectiveTz = resolveEffectiveStreakTimezone(
        preferredTimeZone && preferredTimeZone !== 'UTC' && preferredTimeZone !== 'Etc/UTC'
          ? preferredTimeZone
          : typeof data.timezone === 'string'
          ? data.timezone
          : undefined,
        preferredTimeZone
      );
      resolvedTzForLog = effectiveTz;

      const serverState = {
        currentStreak: sanitizeFiniteInt(data.currentStreak ?? data.current_streak ?? data.streakDays, 0, 10000, 0),
        longestStreak: sanitizeFiniteInt(data.longestStreak ?? data.longest_streak, 0, 10000, 0),
        lastActiveDate: String(data.lastActiveDate ?? data.last_active_date ?? '').trim().slice(0, 20),
        timezone: effectiveTz,
        recoveryCount: sanitizeFiniteInt(data.recoveryCount ?? data.recovery_count, 0, MAX_MONTHLY_STREAK_RECOVERIES, 0),
        recoveryMonth: String(data.recoveryMonth ?? data.recovery_month ?? '').trim().slice(0, 16),
        streakBeforeBreak: sanitizeFiniteInt(data.streakBeforeBreak, 0, 10000, 0),
        streakBrokenDate: String(data.streakBrokenDate ?? '').trim().slice(0, 20),
      };

      const result = recoverBrokenStreakState(serverState, nowMs, effectiveTz);
      if (!result.ok) {
        return result;
      }

      const brokenAnchor =
        serverState.streakBrokenDate || serverState.lastActiveDate || '';
      bridgedDates = getRecoveredGapDateKeys(brokenAnchor, result.todayKey);

      const existingRecoveredDates = Array.isArray(data.recoveredDates)
        ? data.recoveredDates.filter((d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
        : [];
      const mergedRecoveredDates = Array.from(new Set([...existingRecoveredDates, ...bridgedDates]))
        .sort()
        .slice(-120);

      const next = result.nextState;
      const nowIso = new Date(nowMs).toISOString();
      const safeRecoveredCurrent = sanitizeFiniteInt(next.currentStreak, 0, 10000, 0);
      const safeRecoveredLongest = Math.max(
        safeRecoveredCurrent,
        sanitizeFiniteInt(next.longestStreak, 0, 10000, 0)
      );
      tx.update(docRef, {
        ...(!data.userId || data.userId !== uid ? { userId: uid } : {}),
        streakDays: safeRecoveredCurrent,
        currentStreak: safeRecoveredCurrent,
        longestStreak: safeRecoveredLongest,
        lastActiveDate: String(next.lastActiveDate || '').trim().slice(0, 20),
        timezone: String(next.timezone || effectiveTz).trim().slice(0, 64),
        recoveryCount: sanitizeFiniteInt(next.recoveryCount, 0, MAX_MONTHLY_STREAK_RECOVERIES, 0),
        recoveryMonth: String(next.recoveryMonth || '').trim().slice(0, 16),
        streakBeforeBreak: 0,
        streakBrokenDate: '',
        recoveredDates: mergedRecoveredDates,
        updatedAt: nowIso,
        lastActiveAt: nowIso,
      });

      return result;
    });

    if (txResult && txResult.ok && bridgedDates.length > 0) {
      // Persist recovered calendar dates in usage_analytics so the Streak Calendar displays them across sessions/devices
      void Promise.all(
        bridgedDates.map((dateKey) =>
          recordUsageAnalyticsToFirestore({
            eventType: 'streak_recovery',
            explicitDateKey: dateKey,
            timeZone: resolvedTzForLog,
          })
        )
      ).catch(() => {});
      return { ...txResult, recoveredDates: bridgedDates };
    }

    return txResult;
  } catch (err) {
    console.warn('Atomic streak recovery transaction warning:', err);
    return null;
  }
}

/**
 * Persists a Streak Freeze update (XP deduction, recoveryCount, anchored lastActiveDate, preserved streak)
 * directly on `users/{uid}` so refreshing or logging out never resets the frozen streak to 0.
 */
export async function syncStreakFreezeToFirestoreSafe(
  userId: string,
  updatedUser: UserProfile,
  timeZone: string = NEPAL_TIMEZONE,
  nowMs: number = Date.now()
): Promise<{ ok: boolean; error?: string }> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) {
    return { ok: false, error: 'Authenticated Firebase user required' };
  }
  const uid = safeDocId(userId);
  const docRef = doc(db, 'users', uid);
  const nowIso = new Date(nowMs).toISOString();
  const safeStreak = Math.max(1, Math.min(10000, Math.floor(updatedUser.currentStreak ?? updatedUser.streakDays ?? 1)));
  const safeLongest = Math.max(safeStreak, Math.min(10000, Math.floor(updatedUser.longestStreak ?? safeStreak)));
  const safeTz = resolveEffectiveStreakTimezone(timeZone || updatedUser.timezone);
  const safeRecoveryCount = Math.max(0, Math.min(MAX_MONTHLY_STREAK_RECOVERIES, Math.floor(updatedUser.recoveryCount ?? 1)));
  const safeRecoveryMonth = (updatedUser.recoveryMonth || getLocalDateKeyInTimezone(nowMs, safeTz).slice(0, 7)).slice(0, 16);
  const safeLastActive = (updatedUser.lastActiveDate || getLocalDateKeyInTimezone(nowMs, safeTz)).slice(0, 20);
  const safeXp = Math.max(0, Math.floor(Number(updatedUser.xp) || 0));

  try {
    await updateDoc(docRef, {
      streakDays: safeStreak,
      currentStreak: safeStreak,
      longestStreak: safeLongest,
      lastActiveDate: safeLastActive,
      timezone: safeTz.slice(0, 64),
      recoveryCount: safeRecoveryCount,
      recoveryMonth: safeRecoveryMonth,
      streakBeforeBreak: 0,
      streakBrokenDate: '',
      xp: safeXp,
      updatedAt: nowIso,
      lastActiveAt: nowIso,
    });
    return { ok: true };
  } catch (err: any) {
    const errText = String(err?.code || err?.message || '').toLowerCase();
    if (errText.includes('permission')) {
      try {
        await updateDoc(docRef, {
          streakDays: safeStreak,
          currentStreak: safeStreak,
          longestStreak: safeLongest,
          lastActiveDate: safeLastActive,
          recoveryCount: safeRecoveryCount,
          recoveryMonth: safeRecoveryMonth,
          updatedAt: nowIso,
          lastActiveAt: nowIso,
        });
        return { ok: true };
      } catch {
        // Fall through
      }
    }
    return { ok: false, error: err?.message || 'Failed to sync streak freeze to Firestore' };
  }
}

export async function loadConversationsFromFirestore(userId: string): Promise<ChatSession[]> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return [];
  const firestore = db;
  const uid = safeDocId(userId);
  const convPath = `users/${uid}/conversations`;

  try {
    const convSnap = await getDocs(
      query(collection(firestore, 'users', uid, 'conversations'), orderBy('updatedAt', 'desc'), limit(25))
    );

    const loaded = await Promise.all(
      convSnap.docs.map(async (convDoc) => {
        const data = convDoc.data();
        const convId = data.id || convDoc.id;
        let messages: ChatMessage[] = [];
        const msgPath = `users/${uid}/conversations/${convId}/messages`;
        try {
          const msgSnap = await getDocs(
            query(
              collection(firestore, 'users', uid, 'conversations', convId, 'messages'),
              orderBy('timestamp', 'asc'),
              limit(80)
            )
          );
          messages = msgSnap.docs.map((mDoc) => {
            const m = mDoc.data();
            return {
              id: m.id || mDoc.id,
              role: m.role === 'user' ? 'user' : m.role === 'participant' ? 'participant' : 'model',
              senderName: m.senderName,
              senderAvatarUrl: m.senderAvatarUrl,
              content: m.content || '',
              translation: m.translation,
              translationLanguage: m.translationLanguage,
              feedback: m.feedback,
              reactions: m.reactions,
              userReactions: Array.isArray(m.userReactions) ? m.userReactions : undefined,
              isPinned: Boolean(m.isPinned),
              pinnedAt: m.pinnedAt ? new Date(m.pinnedAt).getTime() : undefined,
              attachmentName: m.attachmentName,
              imageUrl: m.imageUrl,
              isVoiceInput: Boolean(m.isVoice),
              editedAt: m.editedAt ? new Date(m.editedAt).getTime() : undefined,
              timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
            };
          });
        } catch (err) {
          if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
            handleFirestoreError(err, OperationType.LIST, msgPath);
          }
        }

        const session: ChatSession = {
          id: convId,
          title: data.title || 'Conversation',
          createdAt: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
          updatedAt: data.updatedAt ? new Date(data.updatedAt).getTime() : Date.now(),
          targetLanguage: data.language || 'ne',
          category: data.category || 'General',
          messages,
        };
        return session;
      })
    );

    return loaded;
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.LIST, convPath);
    }
    return [];
  }
}

export async function saveConversationAndMessagesToFirestore(
  userId: string,
  session: ChatSession
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const convId = safeDocId(session.id);
  const convPath = `users/${uid}/conversations/${convId}`;

  try {
    const convRef = doc(db, 'users', uid, 'conversations', convId);
    const existingConv = await getDoc(convRef);
    const createdIso = new Date(session.createdAt || Date.now()).toISOString();
    const updatedIso = new Date(session.updatedAt || Date.now()).toISOString();

    if (!existingConv.exists()) {
      await setDoc(convRef, {
        id: convId,
        userId: uid,
        title: (session.title || 'Conversation').slice(0, 200),
        language: (session.targetLanguage || 'ne').slice(0, 20),
        category: (session.category || 'General').slice(0, 48),
        messageCount: session.messages.length,
        createdAt: createdIso,
        updatedAt: updatedIso,
      });
    } else {
      await updateDoc(convRef, {
        title: (session.title || 'Conversation').slice(0, 200),
        language: (session.targetLanguage || 'ne').slice(0, 20),
        category: (session.category || 'General').slice(0, 48),
        messageCount: session.messages.length,
        updatedAt: updatedIso,
      });
    }

    // Persist the most recent 4 messages concurrently to avoid unnecessary serialization
    const recentMsgs = session.messages.slice(-4);
    await Promise.all(recentMsgs.map((msg) => saveSingleMessageToFirestore(uid, convId, msg)));
  } catch (err) {
    console.warn('Firestore conversation sync warning:', err);
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, convPath);
    }
  }
}

export async function saveSingleMessageToFirestore(
  userId: string,
  conversationId: string,
  msg: ChatMessage
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const convId = safeDocId(conversationId);
  const msgId = safeDocId(msg.id);
  const msgPath = `users/${uid}/conversations/${convId}/messages/${msgId}`;
  const msgRef = doc(db, 'users', uid, 'conversations', convId, 'messages', msgId);

  try {
    const snap = await getDoc(msgRef);
    if (!snap.exists()) {
      const payload: Record<string, any> = {
        id: msgId,
        userId: uid,
        conversationId: convId,
        role: msg.role === 'user' ? 'user' : msg.role === 'participant' ? 'participant' : 'model',
        content: (msg.content || '').slice(0, 49000),
        timestamp: new Date(msg.timestamp || Date.now()).toISOString(),
      };
      if (msg.senderName) payload.senderName = msg.senderName.slice(0, 100);
      if (msg.senderAvatarUrl && msg.senderAvatarUrl.length <= 1000) {
        payload.senderAvatarUrl = msg.senderAvatarUrl;
      }
      if (msg.translation) payload.translation = msg.translation.slice(0, 49000);
      if (msg.translationLanguage) payload.translationLanguage = msg.translationLanguage.slice(0, 20);
      if (msg.feedback) payload.feedback = msg.feedback;
      if (msg.reactions && Object.keys(msg.reactions).length > 0) payload.reactions = msg.reactions;
      if (Array.isArray(msg.userReactions) && msg.userReactions.length > 0) {
        payload.userReactions = msg.userReactions.slice(0, 6);
      }
      if (typeof msg.isPinned === 'boolean') payload.isPinned = msg.isPinned;
      if (msg.pinnedAt) payload.pinnedAt = new Date(msg.pinnedAt).toISOString();
      if (msg.attachmentName) payload.attachmentName = msg.attachmentName.slice(0, 256);
      if (msg.imageUrl && msg.imageUrl.length <= 950) payload.imageUrl = msg.imageUrl;
      if (typeof msg.isVoiceInput === 'boolean') payload.isVoice = msg.isVoiceInput;
      if (msg.provider) payload.provider = msg.provider;
      if (msg.modelUsed) payload.modelUsed = msg.modelUsed.slice(0, 120);
      if (msg.editedAt) payload.editedAt = new Date(msg.editedAt).toISOString();
      await setDoc(msgRef, payload);
    } else {
      const patch: Record<string, any> = {};
      if (msg.content !== undefined) patch.content = msg.content.slice(0, 49000);
      if (msg.editedAt !== undefined) patch.editedAt = new Date(msg.editedAt).toISOString();
      if (msg.translation !== undefined) patch.translation = msg.translation.slice(0, 49000);
      if (msg.translationLanguage !== undefined) patch.translationLanguage = msg.translationLanguage.slice(0, 20);
      if (msg.feedback !== undefined) patch.feedback = msg.feedback;
      if (msg.reactions !== undefined) patch.reactions = msg.reactions;
      if (msg.userReactions !== undefined) patch.userReactions = msg.userReactions.slice(0, 6);
      if (typeof msg.isPinned === 'boolean') patch.isPinned = msg.isPinned;
      if (msg.isPinned !== undefined) {
        patch.pinnedAt = msg.isPinned && msg.pinnedAt ? new Date(msg.pinnedAt).toISOString() : '';
      }
      if (Object.keys(patch).length > 0) {
        await updateDoc(msgRef, patch);
      }
    }
  } catch (err) {
    console.warn('Firestore message sync warning:', err);
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, msgPath);
    }
  }
}

export async function deleteConversationFromFirestore(
  userId: string,
  conversationId: string
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const convId = safeDocId(conversationId);
  const path = `users/${uid}/conversations/${convId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'conversations', convId));
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}

export async function recordUsageAnalyticsToFirestore(params: {
  eventType: 'chat' | 'voice' | 'image' | 'translation' | 'file' | 'streak_recovery';
  language?: string;
  latencyMs?: number;
  timeZone?: string;
  explicitDateKey?: string;
}): Promise<void> {
  if (!db || !auth?.currentUser) return;
  const uid = safeDocId(auth.currentUser.uid);
  const eventId = safeDocId(`evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const path = `usage_analytics/${eventId}`;
  const now = new Date();
  const dateKey =
    params.explicitDateKey && /^\d{4}-\d{2}-\d{2}$/.test(params.explicitDateKey)
      ? params.explicitDateKey
      : getLocalDateKeyInTimezone(now.getTime(), resolveEffectiveStreakTimezone(params.timeZone));
  try {
    await setDoc(doc(db, 'usage_analytics', eventId), {
      id: eventId,
      userId: uid,
      eventType: params.eventType,
      language: (params.language || 'en').slice(0, 20),
      latencyMs: typeof params.latencyMs === 'number' ? params.latencyMs : 0,
      dateKey,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }
}

export interface FirestoreUsageStreakResult {
  dateCounts: Record<string, number>;
  recoveredDates: string[];
  totalInteractions: number;
  source: 'firestore' | 'local';
}

export async function fetchUserUsageDatesFromFirestore(
  userId: string,
  timeZone: string = NEPAL_TIMEZONE
): Promise<FirestoreUsageStreakResult> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) {
    return { dateCounts: {}, recoveredDates: [], totalInteractions: 0, source: 'local' };
  }
  const uid = safeDocId(userId);
  const dateCounts: Record<string, number> = {};
  const recoveredDateSet = new Set<string>();
  let totalInteractions = 0;

  // 1. Query user's usage_analytics logs
  const analyticsPath = 'usage_analytics';
  try {
    const analyticsSnap = await getDocs(
      query(collection(db, analyticsPath), where('userId', '==', uid), limit(300))
    );
    analyticsSnap.docs.forEach((d) => {
      const data = d.data();
      const isRecoveryEvent = data.eventType === 'streak_recovery';
      let dateKey = '';

      if (isRecoveryEvent && typeof data.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.dateKey)) {
        // Recovery events store the exact missed calendar date bridged by the recovery
        dateKey = data.dateKey;
      } else if (typeof data.timestamp === 'string') {
        const ms = new Date(data.timestamp).getTime();
        if (!Number.isNaN(ms)) {
          dateKey = getLocalDateKeyInTimezone(ms, timeZone);
        }
      }
      if (!dateKey && typeof data.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.dateKey)) {
        dateKey = data.dateKey;
      }
      if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        if (isRecoveryEvent) {
          recoveredDateSet.add(dateKey);
        } else {
          dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;
          totalInteractions += 1;
        }
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.LIST, analyticsPath);
    }
    console.warn('Firestore usage_analytics streak fetch warning:', err);
  }

  // 2. Also incorporate user conversation activity timestamps so historical sessions count
  const convPath = `users/${uid}/conversations`;
  try {
    const convSnap = await getDocs(query(collection(db, 'users', uid, 'conversations'), limit(100)));
    convSnap.docs.forEach((d) => {
      const data = d.data();
      let updatedKey = '';
      let createdKey = '';
      if (typeof data.updatedAt === 'string') {
        const ms = new Date(data.updatedAt).getTime();
        if (!Number.isNaN(ms)) {
          updatedKey = getLocalDateKeyInTimezone(ms, timeZone);
        }
      }
      if (typeof data.createdAt === 'string') {
        const ms = new Date(data.createdAt).getTime();
        if (!Number.isNaN(ms)) {
          createdKey = getLocalDateKeyInTimezone(ms, timeZone);
        }
      }
      if (updatedKey && /^\d{4}-\d{2}-\d{2}$/.test(updatedKey)) {
        dateCounts[updatedKey] = Math.max(dateCounts[updatedKey] || 0, 1);
      }
      if (createdKey && /^\d{4}-\d{2}-\d{2}$/.test(createdKey)) {
        dateCounts[createdKey] = Math.max(dateCounts[createdKey] || 0, 1);
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.LIST, convPath);
    }
  }

  return {
    dateCounts,
    recoveredDates: Array.from(recoveredDateSet).sort(),
    totalInteractions: Math.max(
      totalInteractions,
      Object.values(dateCounts).reduce((sum, n) => sum + n, 0)
    ),
    source: 'firestore',
  };
}

export interface UserActivityAnalyticsRecord {
  id: string;
  eventType: string;
  language?: string;
  latencyMs?: number;
  dateKey?: string;
  timestamp?: string;
}

export async function fetchUserActivityAnalyticsEvents(
  userId: string
): Promise<UserActivityAnalyticsRecord[]> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) {
    return [];
  }
  const uid = safeDocId(userId);
  const analyticsPath = 'usage_analytics';
  try {
    const analyticsSnap = await getDocs(
      query(collection(db, analyticsPath), where('userId', '==', uid), limit(500))
    );
    return analyticsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: String(data.id || d.id),
        eventType: String(data.eventType || 'chat'),
        language: typeof data.language === 'string' ? data.language : undefined,
        latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : 0,
        dateKey: typeof data.dateKey === 'string' ? data.dateKey : undefined,
        timestamp: typeof data.timestamp === 'string' ? data.timestamp : undefined,
      };
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.LIST, analyticsPath);
    }
    console.warn('Firestore usage_analytics trend fetch warning:', err);
    return [];
  }
}

// ---------------- OWNER ADMIN FIRESTORE QUERIES ----------------

export async function fetchAdminUsersFromFirestore(): Promise<AdminUserRecord[]> {
  if (!db || !auth?.currentUser) return [];
  const path = 'users';
  try {
    const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(200)));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        userId: data.userId || d.id,
        displayName: data.displayName || 'User',
        username: data.username,
        email: data.email,
        photoURL: data.photoURL,
        preferredLanguage: data.preferredLanguage || 'en',
        provider: data.provider || 'google',
        status: data.status === 'suspended' ? 'suspended' : 'active',
        role: data.role === 'admin' ? 'admin' : 'user',
        messageCount: data.messageCount || 0,
        conversationCount: data.conversationCount || 0,
        createdAt: data.createdAt || new Date().toISOString(),
        lastActiveAt: data.lastActiveAt,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchAdminConversationsForUser(
  targetUserId: string,
  userDisplayName?: string,
  userEmail?: string
): Promise<AdminConversationSummary[]> {
  if (!db || !auth?.currentUser) return [];
  const uid = safeDocId(targetUserId);
  const path = `users/${uid}/conversations`;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'conversations'), orderBy('updatedAt', 'desc'), limit(25))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        userId: uid,
        userDisplayName,
        userEmail,
        title: data.title || 'Untitled Conversation',
        language: data.language || 'en',
        messageCount: data.messageCount || 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchAdminConversationMessages(
  targetUserId: string,
  conversationId: string
): Promise<ChatMessage[]> {
  if (!db || !auth?.currentUser) return [];
  const uid = safeDocId(targetUserId);
  const convId = safeDocId(conversationId);
  const path = `users/${uid}/conversations/${convId}/messages`;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'conversations', convId, 'messages'), orderBy('timestamp', 'asc'), limit(100))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        role: data.role === 'user' ? 'user' : data.role === 'participant' ? 'participant' : 'model',
        senderName: data.senderName,
        senderAvatarUrl: data.senderAvatarUrl,
        content: data.content || '',
        translation: data.translation,
        translationLanguage: data.translationLanguage,
        feedback: data.feedback,
        reactions: data.reactions,
        userReactions: Array.isArray(data.userReactions) ? data.userReactions : undefined,
        isPinned: Boolean(data.isPinned),
        pinnedAt: data.pinnedAt ? new Date(data.pinnedAt).getTime() : undefined,
        attachmentName: data.attachmentName,
        provider: data.provider,
        modelUsed: data.modelUsed,
        timestamp: data.timestamp ? new Date(data.timestamp).getTime() : Date.now(),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function updateAdminUserStatusInFirestore(
  targetUserId: string,
  nextStatus: 'active' | 'suspended'
): Promise<void> {
  if (!db || !auth?.currentUser) return;
  const uid = safeDocId(targetUserId);
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function fetchAdminAnalyticsEvents(): Promise<
  Array<{ id: string; userId: string; eventType: string; language?: string; dateKey: string; timestamp: string }>
> {
  if (!db || !auth?.currentUser) return [];
  const path = 'usage_analytics';
  try {
    const snap = await getDocs(query(collection(db, 'usage_analytics'), orderBy('timestamp', 'desc'), limit(250)));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        userId: data.userId,
        eventType: data.eventType,
        language: data.language,
        dateKey: data.dateKey,
        timestamp: data.timestamp,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export function subscribeToPlatformAnnouncement(
  onChange: (data: { announcement?: string; maintenanceMode?: boolean } | null) => void
): Unsubscribe {
  if (!db) {
    onChange(null);
    return () => {};
  }
  const ref = doc(db, 'admin_settings', 'global');
  return onSnapshot(
    ref,
    (snap) => {
      onChange(snap.exists() ? (snap.data() as any) : null);
    },
    () => {
      onChange(null);
    }
  );
}

export async function updateAdminSettingsInFirestore(settings: {
  platformName: string;
  maintenanceMode: boolean;
  announcement: string;
}): Promise<void> {
  if (!db || !auth?.currentUser) return;
  const path = 'admin_settings/global';
  try {
    await setDoc(doc(db, 'admin_settings', 'global'), {
      platformName: settings.platformName.slice(0, 120),
      maintenanceMode: Boolean(settings.maintenanceMode),
      announcement: settings.announcement.slice(0, 500),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// ---------------- AI MEMORY, TASKS & STUDY PROGRESS SYNC ----------------

export async function loadMemoriesFromFirestore(userId: string): Promise<AIMemoryItem[]> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return [];
  const uid = safeDocId(userId);
  const path = `users/${uid}/memories`;
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'memories'), orderBy('updatedAt', 'desc'), limit(100)));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        userId: uid,
        category: data.category || 'preference',
        content: data.content || '',
        approved: Boolean(data.approved),
        ...(data.source ? { source: data.source } : {}),
        ...(typeof data.isSensitive === 'boolean' ? { isSensitive: data.isSensitive } : {}),
        ...(Array.isArray(data.keywords) ? { keywords: data.keywords.slice(0, 12) } : {}),
        createdAt: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt).getTime() : Date.now(),
      };
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
    return [];
  }
}

export async function saveMemoryToFirestore(userId: string, item: AIMemoryItem): Promise<boolean> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return false;
  // Defense-in-depth: never persist secret tokens/keys in memory documents
  if (/\b(?:AIza[0-9A-Za-z\-_]{20,}|gsk_[0-9A-Za-z]{16,}|sk-or-v1-[0-9A-Za-z]{16,}|sk-[0-9A-Za-z]{20,})\b/.test(item.content)) {
    return false;
  }
  const uid = safeDocId(userId);
  const memId = safeDocId(item.id);
  const path = `users/${uid}/memories/${memId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'memories', memId), {
      id: memId,
      userId: uid,
      category: item.category,
      content: item.content.slice(0, 2000),
      approved: Boolean(item.approved),
      ...(item.source ? { source: item.source } : {}),
      ...(typeof item.isSensitive === 'boolean' ? { isSensitive: item.isSensitive } : {}),
      ...(Array.isArray(item.keywords) && item.keywords.length > 0
        ? { keywords: item.keywords.filter((k) => typeof k === 'string').slice(0, 12) }
        : {}),
      createdAt: new Date(item.createdAt || Date.now()).toISOString(),
      updatedAt: new Date(item.updatedAt || Date.now()).toISOString(),
    });
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return false;
  }
}

export async function deleteMemoryFromFirestore(userId: string, memoryId: string): Promise<boolean> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return false;
  const uid = safeDocId(userId);
  const memId = safeDocId(memoryId);
  const path = `users/${uid}/memories/${memId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'memories', memId));
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
    return false;
  }
}

export async function clearAllMemoriesFromFirestore(userId: string): Promise<boolean> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return false;
  const uid = safeDocId(userId);
  const path = `users/${uid}/memories`;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'memories'));
    if (snap.empty) return true;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
    return false;
  }
}

export async function loadTasksFromFirestore(userId: string): Promise<PersonalTask[]> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return [];
  const uid = safeDocId(userId);
  const path = `users/${uid}/tasks`;
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'tasks'), orderBy('updatedAt', 'desc'), limit(150)));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        userId: uid,
        title: data.title || '',
        notes: data.notes,
        dueDate: data.dueDate,
        dueTime: data.dueTime,
        priority: data.priority || 'medium',
        category: data.category || 'daily',
        completed: Boolean(data.completed),
        reminderMinutes: typeof data.reminderMinutes === 'number' ? data.reminderMinutes : undefined,
        createdAt: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt).getTime() : Date.now(),
      };
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
    return [];
  }
}

export async function saveTaskToFirestore(userId: string, task: PersonalTask): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const taskId = safeDocId(task.id);
  const path = `users/${uid}/tasks/${taskId}`;
  try {
    const payload: Record<string, any> = {
      id: taskId,
      userId: uid,
      title: task.title.slice(0, 240),
      priority: task.priority,
      category: task.category.slice(0, 48),
      completed: Boolean(task.completed),
      createdAt: new Date(task.createdAt || Date.now()).toISOString(),
      updatedAt: new Date(task.updatedAt || Date.now()).toISOString(),
    };
    if (task.notes) payload.notes = task.notes.slice(0, 2000);
    if (task.dueDate) payload.dueDate = task.dueDate.slice(0, 20);
    if (task.dueTime) payload.dueTime = task.dueTime.slice(0, 20);
    if (typeof task.reminderMinutes === 'number') payload.reminderMinutes = task.reminderMinutes;
    await setDoc(doc(db, 'users', uid, 'tasks', taskId), payload);
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}

export async function deleteTaskFromFirestore(userId: string, taskId: string): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const safeId = safeDocId(taskId);
  const path = `users/${uid}/tasks/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'tasks', safeId));
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}

export async function loadStudyProgressFromFirestore(userId: string): Promise<StudyProgressItem[]> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return [];
  const uid = safeDocId(userId);
  const path = `users/${uid}/studyProgress`;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'studyProgress'), orderBy('completedAt', 'desc'), limit(100))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        userId: uid,
        topic: data.topic || '',
        mode: data.mode || 'notes',
        score: typeof data.score === 'number' ? data.score : 0,
        totalQuestions: typeof data.totalQuestions === 'number' ? data.totalQuestions : 0,
        language: data.language || 'bilingual',
        completedAt: data.completedAt ? new Date(data.completedAt).getTime() : Date.now(),
      };
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
    return [];
  }
}

export async function saveStudyProgressToFirestore(
  userId: string,
  item: StudyProgressItem
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const progId = safeDocId(item.id);
  const path = `users/${uid}/studyProgress/${progId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'studyProgress', progId), {
      id: progId,
      userId: uid,
      topic: item.topic.slice(0, 200),
      mode: item.mode.slice(0, 40),
      score: Number(item.score) || 0,
      totalQuestions: Number(item.totalQuestions) || 0,
      language: (item.language || 'bilingual').slice(0, 20),
      completedAt: new Date(item.completedAt || Date.now()).toISOString(),
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}

// ---------------- GENERATED IMAGES METADATA SYNC ----------------

export async function saveGeneratedImageMetaToFirestore(
  userId: string,
  item: GeneratedImageItem
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const imageId = safeDocId(item.id);
  const path = `users/${uid}/generatedImages/${imageId}`;
  try {
    const payload: Record<string, any> = {
      id: imageId,
      userId: uid,
      prompt: item.prompt.slice(0, 1500),
      style: (item.style || 'Realistic').slice(0, 64),
      aspectRatio: (item.aspectRatio || '1:1').slice(0, 16),
      modelName: (item.modelName || 'gemini-3.1-flash-lite-image').slice(0, 80),
      mimeType: (item.mimeType || 'image/png').slice(0, 40),
      storageLocation: (item.storageLocation || `indexeddb:${imageId}`).slice(0, 256),
      createdAt: new Date(item.createdAt || Date.now()).toISOString(),
    };
    if (item.revisedPrompt) payload.revisedPrompt = item.revisedPrompt.slice(0, 1500);
    if (item.resolution) payload.resolution = String(item.resolution).slice(0, 16);
    if (typeof item.latencyMs === 'number') payload.latencyMs = item.latencyMs;

    await setDoc(doc(db, 'users', uid, 'generatedImages', imageId), payload);
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}

export async function loadGeneratedImagesMetaFromFirestore(
  userId: string
): Promise<Omit<GeneratedImageItem, 'imageDataUrl'>[]> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return [];
  const uid = safeDocId(userId);
  const path = `users/${uid}/generatedImages`;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'generatedImages'), orderBy('createdAt', 'desc'), limit(50))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        userId: uid,
        prompt: data.prompt || '',
        revisedPrompt: data.revisedPrompt,
        style: data.style || 'Realistic',
        aspectRatio: data.aspectRatio || '1:1',
        resolution: data.resolution,
        modelName: data.modelName || 'gemini-3.1-flash-lite-image',
        mimeType: data.mimeType || 'image/png',
        storageLocation: data.storageLocation || `indexeddb:${d.id}`,
        createdAt: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
        latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : undefined,
      };
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
    return [];
  }
}

export async function deleteGeneratedImageMetaFromFirestore(
  userId: string,
  imageId: string
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const safeId = safeDocId(imageId);
  const path = `users/${uid}/generatedImages/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'generatedImages', safeId));
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}

// ---------------- AUTOMATION SCHEDULES & ACTIVITY LOGS ----------------

export async function saveAutomationScheduleToFirestore(
  userId: string,
  item: AutomationScheduleItem
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const scheduleId = safeDocId(item.id);
  const path = `users/${uid}/automationSchedules/${scheduleId}`;
  try {
    const payload: Record<string, any> = {
      id: scheduleId,
      userId: uid,
      title: (item.title || 'Recurring Automation').slice(0, 200),
      category: item.category,
      frequency: item.frequency,
      timeOfDay: (item.timeOfDay || '09:00').slice(0, 10),
      prompt: (item.prompt || 'Run scheduled automation workflow').slice(0, 2000),
      tone: item.tone,
      targetLanguage: (item.targetLanguage || 'en').slice(0, 20),
      enabled: Boolean(item.enabled),
      nextRunAt: new Date(item.nextRunAt || Date.now()).toISOString(),
      lastStatus: item.lastStatus || 'idle',
      runCount: Math.max(0, Number(item.runCount) || 0),
      createdAt: new Date(item.createdAt || Date.now()).toISOString(),
      updatedAt: new Date(item.updatedAt || Date.now()).toISOString(),
    };
    if (item.dayOfWeek) payload.dayOfWeek = String(item.dayOfWeek).slice(0, 16);
    if (item.lastRunAt) payload.lastRunAt = new Date(item.lastRunAt).toISOString();

    await setDoc(doc(db, 'users', uid, 'automationSchedules', scheduleId), payload);
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}

export async function loadAutomationSchedulesFromFirestore(
  userId: string
): Promise<AutomationScheduleItem[]> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return [];
  const uid = safeDocId(userId);
  const path = `users/${uid}/automationSchedules`;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'automationSchedules'), orderBy('updatedAt', 'desc'), limit(40))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        userId: uid,
        title: data.title || 'Recurring Task',
        category: data.category || 'emails',
        frequency: data.frequency || 'daily',
        timeOfDay: data.timeOfDay || '09:00',
        dayOfWeek: data.dayOfWeek,
        prompt: data.prompt || '',
        tone: data.tone || 'professional',
        targetLanguage: data.targetLanguage || 'en',
        enabled: Boolean(data.enabled),
        nextRunAt: data.nextRunAt ? new Date(data.nextRunAt).getTime() : Date.now(),
        lastRunAt: data.lastRunAt ? new Date(data.lastRunAt).getTime() : undefined,
        lastStatus: data.lastStatus || 'idle',
        runCount: typeof data.runCount === 'number' ? data.runCount : 0,
        createdAt: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt).getTime() : Date.now(),
      };
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
    return [];
  }
}

export async function deleteAutomationScheduleFromFirestore(
  userId: string,
  scheduleId: string
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const safeId = safeDocId(scheduleId);
  const path = `users/${uid}/automationSchedules/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'automationSchedules', safeId));
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}

export async function saveAutomationLogToFirestore(
  userId: string,
  logItem: AutomationRunLogItem
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const logId = safeDocId(logItem.id);
  const path = `users/${uid}/automationLogs/${logId}`;
  try {
    const payload: Record<string, any> = {
      id: logId,
      userId: uid,
      taskTitle: (logItem.taskTitle || 'Automation Run').slice(0, 200),
      category: logItem.category,
      tone: logItem.tone,
      triggerType: logItem.triggerType || 'manual',
      status: logItem.status || 'running',
      statusMessage: (logItem.statusMessage || '').slice(0, 500),
      outputSummary: (logItem.outputSummary || '').slice(0, 4000),
      startedAt: new Date(logItem.startedAt || Date.now()).toISOString(),
    };
    if (logItem.scheduleId) payload.scheduleId = safeDocId(logItem.scheduleId);
    if (logItem.errorMessage) payload.errorMessage = String(logItem.errorMessage).slice(0, 1000);
    if (logItem.modelUsed) payload.modelUsed = String(logItem.modelUsed).slice(0, 80);
    if (typeof logItem.latencyMs === 'number' && logItem.latencyMs >= 0) {
      payload.latencyMs = logItem.latencyMs;
    }
    if (logItem.completedAt) payload.completedAt = new Date(logItem.completedAt).toISOString();

    await setDoc(doc(db, 'users', uid, 'automationLogs', logId), payload);
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}

export async function loadAutomationLogsFromFirestore(
  userId: string
): Promise<AutomationRunLogItem[]> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return [];
  const uid = safeDocId(userId);
  const path = `users/${uid}/automationLogs`;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'automationLogs'), orderBy('startedAt', 'desc'), limit(60))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        userId: uid,
        scheduleId: data.scheduleId,
        taskTitle: data.taskTitle || 'Automation Run',
        category: data.category || 'emails',
        tone: data.tone || 'professional',
        triggerType: data.triggerType || 'manual',
        status: data.status || 'success',
        statusMessage: data.statusMessage || '',
        outputSummary: data.outputSummary || '',
        errorMessage: data.errorMessage,
        modelUsed: data.modelUsed,
        latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : undefined,
        startedAt: data.startedAt ? new Date(data.startedAt).getTime() : Date.now(),
        completedAt: data.completedAt ? new Date(data.completedAt).getTime() : undefined,
      };
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
    return [];
  }
}

export async function deleteAutomationLogFromFirestore(
  userId: string,
  logId: string
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const safeId = safeDocId(logId);
  const path = `users/${uid}/automationLogs/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'automationLogs', safeId));
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}

// ---------------- GLOBAL STREAK LEADERBOARD (PII-ISOLATED REAL-TIME SYNC) ----------------

function logFirestoreErrorQuiet(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const errMsg = error instanceof Error ? error.message : String(error);
  // Log as warning with clear tag so optional background leaderboard sync never trips AI Studio fatal error monitoring
  console.warn(`[Leaderboard notice] ${operationType} on ${path || 'streak_leaderboard'}:`, errMsg);
}

function sanitizeLeaderboardDisplayName(profile: Partial<UserProfile>): string {
  const candidates = [profile.nickname, profile.name, profile.username];
  for (const candidate of candidates) {
    const cleaned = String(candidate || '').trim();
    if (!cleaned) continue;
    // Never publish raw email addresses to the public leaderboard
    if (cleaned.includes('@')) {
      const localPart = cleaned.split('@')[0].trim();
      if (localPart) return localPart.slice(0, 64);
      continue;
    }
    return cleaned.slice(0, 64);
  }
  return 'Aadesh Explorer';
}

function sanitizeLeaderboardAvatarUrl(url?: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed || !trimmed.startsWith('https://') || trimmed.length > 1000) {
    return '';
  }
  return trimmed;
}

export type LeaderboardSyncSkipReason =
  | 'unauthenticated'
  | 'permission_denied'
  | 'missing_user_doc'
  | 'insufficient_streak'
  | 'read_failed'
  | 'write_failed';

export type LeaderboardSyncResult =
  | { ok: true; currentStreak: number; longestStreak: number }
  | { ok: false; reason: LeaderboardSyncSkipReason; error?: string };

export interface LeaderboardEligibilityInput {
  authUid: string | null | undefined;
  profileId: string;
  userDocStatus: 'found' | 'not_found' | 'permission_denied' | 'error';
  userDocData?: Record<string, any> | null;
  profileCurrentStreak?: number;
  profileLongestStreak?: number;
  profileLastActiveDate?: string;
}

/**
 * Pure authorization & sufficiency evaluator for leaderboard writes.
 * Requires:
 *  1. Matching authenticated UID
 *  2. Existing `users/{uid}` document in Firestore (never writes when missing or permission-denied)
 *  3. Sufficient persisted streak activity (`>= 1`) in the user's Firestore document
 */
export function evaluateLeaderboardSyncEligibility(
  input: LeaderboardEligibilityInput
):
  | {
      eligible: true;
      currentStreak: number;
      longestStreak: number;
      lastActiveDate: string;
    }
  | { eligible: false; reason: LeaderboardSyncSkipReason; error: string } {
  if (!input.authUid || input.authUid !== input.profileId) {
    return {
      eligible: false,
      reason: 'unauthenticated',
      error: 'Authenticated UID mismatch for leaderboard sync',
    };
  }
  if (input.userDocStatus === 'permission_denied') {
    return {
      eligible: false,
      reason: 'permission_denied',
      error: 'Firestore denied read access to users/{uid} before leaderboard sync',
    };
  }
  if (input.userDocStatus === 'not_found' || !input.userDocData) {
    return {
      eligible: false,
      reason: 'missing_user_doc',
      error: 'User document users/{uid} does not exist in Firestore yet',
    };
  }
  if (input.userDocStatus === 'error') {
    return {
      eligible: false,
      reason: 'read_failed',
      error: 'Unable to verify users/{uid} document state before leaderboard sync',
    };
  }

  const docCurrentStreak = Math.max(
    0,
    Math.min(
      10000,
      Math.floor(
        Number(
          input.userDocData.currentStreak ??
            input.userDocData.current_streak ??
            input.userDocData.streakDays ??
            0
        ) || 0
      )
    )
  );
  const docLongestStreak = Math.max(
    0,
    Math.min(
      10000,
      Math.floor(
        Number(input.userDocData.longestStreak ?? input.userDocData.longest_streak ?? 0) || 0
      )
    )
  );
  if (Math.max(docCurrentStreak, docLongestStreak) < 1) {
    return {
      eligible: false,
      reason: 'insufficient_streak',
      error: 'Firestore user document must have a streak (>= 1) before publishing to leaderboard',
    };
  }

  const clientCurrentStreak = Math.max(
    0,
    Math.min(10000, Math.floor(Number(input.profileCurrentStreak ?? 0) || 0))
  );
  const effectiveCurrentStreak = Math.max(docCurrentStreak, clientCurrentStreak);
  const effectiveLongestStreak = Math.max(
    effectiveCurrentStreak,
    docLongestStreak,
    Math.min(10000, Math.floor(Number(input.profileLongestStreak ?? 0) || 0))
  );
  const resolvedLastActiveDate = String(
    input.profileLastActiveDate ||
      input.userDocData.lastActiveDate ||
      input.userDocData.last_active_date ||
      ''
  ).slice(0, 20);

  return {
    eligible: true,
    currentStreak: effectiveCurrentStreak,
    longestStreak: effectiveLongestStreak,
    lastActiveDate: resolvedLastActiveDate,
  };
}

/**
 * Publishes or updates the authenticated user's PII-isolated summary document in
 * `/streak_leaderboard/{userId}` after verifying that `users/{userId}` exists in Firestore
 * and has sufficient active streak progress (`currentStreak >= 1`).
 */
export async function syncUserStreakLeaderboardEntry(
  profile: Partial<UserProfile> & { id: string }
): Promise<LeaderboardSyncResult> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== profile.id) {
    return {
      ok: false,
      reason: 'unauthenticated',
      error: 'Authenticated Firebase user required for leaderboard sync',
    };
  }

  const uid = safeDocId(profile.id);
  const userDocRef = doc(db, 'users', uid);
  let userDocStatus: 'found' | 'not_found' | 'permission_denied' | 'error' = 'error';
  let userDocData: Record<string, any> | null = null;
  let userReadErrorMessage = '';

  try {
    let userSnap;
    try {
      userSnap = await getDocFromServer(userDocRef);
    } catch (serverErr: any) {
      if (classifyFirestoreErrorKind(serverErr) === 'unavailable') {
        userSnap = await getDoc(userDocRef);
      } else {
        throw serverErr;
      }
    }
    if (!userSnap.exists()) {
      userDocStatus = 'not_found';
    } else {
      userDocStatus = 'found';
      userDocData = userSnap.data() as Record<string, any>;
    }
  } catch (readErr: any) {
    const kind = classifyFirestoreErrorKind(readErr);
    userReadErrorMessage = String(readErr?.message || readErr || '');
    userDocStatus = kind === 'permission_denied' ? 'permission_denied' : 'error';
  }

  const eligibility = evaluateLeaderboardSyncEligibility({
    authUid: auth.currentUser.uid,
    profileId: profile.id,
    userDocStatus,
    userDocData,
    profileCurrentStreak: profile.currentStreak ?? profile.streakDays ?? 0,
    profileLongestStreak: profile.longestStreak ?? 0,
    profileLastActiveDate: profile.lastActiveDate || '',
  });

  if (!eligibility.eligible) {
    if (eligibility.reason === 'permission_denied') {
      console.warn('[Leaderboard notice] streak_leaderboard write skipped: remote permissions boundary');
    }
    return {
      ok: false,
      reason: eligibility.reason,
      error: userReadErrorMessage || eligibility.error,
    };
  }

  const path = `streak_leaderboard/${uid}`;
  const docRef = doc(db, 'streak_leaderboard', uid);
  const safeLevel = Math.max(1, Math.min(100, computeLevelInfo(profile.xp || 0).level));
  const nowIso = new Date().toISOString();

  const payload = {
    userId: uid,
    displayName: sanitizeLeaderboardDisplayName(profile),
    avatarUrl: sanitizeLeaderboardAvatarUrl(profile.avatarUrl),
    avatarColor: String(profile.avatarColor || '#8b5cf6').slice(0, 24),
    country: String(profile.country || 'Global').slice(0, 80),
    countryFlag: String(profile.countryFlag || '🌐').slice(0, 16),
    currentStreak: eligibility.currentStreak,
    longestStreak: eligibility.longestStreak,
    lastActiveDate: eligibility.lastActiveDate,
    level: safeLevel,
    updatedAt: nowIso,
  };

  try {
    await setDoc(docRef, payload, { merge: true });
    return {
      ok: true,
      currentStreak: eligibility.currentStreak,
      longestStreak: eligibility.longestStreak,
    };
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (classifyFirestoreErrorKind(err) === 'permission_denied') {
      console.warn('[Leaderboard notice] streak_leaderboard write skipped: remote permissions boundary');
      return { ok: false, reason: 'permission_denied', error: msg };
    }
    logFirestoreErrorQuiet(err, OperationType.WRITE, path);
    return { ok: false, reason: 'write_failed', error: msg };
  }
}

export interface GlobalLeaderboardErrorInfo {
  code: string;
  message: string;
  isPermissionError: boolean;
}

/**
 * Subscribes in real time via Firestore `onSnapshot` to the top active streak holders
 * (`currentStreak >= 1`) in `/streak_leaderboard`.
 * Uses a single-field query (`where + orderBy` on `currentStreak`) so no composite index is required.
 */
export function subscribeToGlobalStreakLeaderboard(options: {
  currentUserId?: string;
  maxEntries?: number;
  onData: (entries: RankedLeaderboardEntry[]) => void;
  onError?: (error: GlobalLeaderboardErrorInfo) => void;
}): Unsubscribe {
  const safeMax = Math.max(1, Math.min(25, Math.floor(options.maxEntries ?? 10)));
  if (!db || !auth?.currentUser) {
    options.onData([]);
    return () => {};
  }

  const leaderboardQuery = query(
    collection(db, 'streak_leaderboard'),
    where('currentStreak', '>=', 1),
    orderBy('currentStreak', 'desc'),
    limit(safeMax)
  );

  return onSnapshot(
    leaderboardQuery,
    (snapshot) => {
      const rawEntries: GlobalLeaderboardEntry[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data() || {};
        return {
          userId: String(d.userId || docSnap.id),
          displayName: String(d.displayName || 'Aadesh Explorer').slice(0, 64),
          avatarUrl: typeof d.avatarUrl === 'string' ? d.avatarUrl : undefined,
          avatarColor: typeof d.avatarColor === 'string' ? d.avatarColor : undefined,
          country: typeof d.country === 'string' ? d.country : undefined,
          countryFlag: typeof d.countryFlag === 'string' ? d.countryFlag : undefined,
          currentStreak: Math.max(0, Math.floor(Number(d.currentStreak) || 0)),
          longestStreak: Math.max(0, Math.floor(Number(d.longestStreak) || 0)),
          lastActiveDate: typeof d.lastActiveDate === 'string' ? d.lastActiveDate : undefined,
          level: typeof d.level === 'number' ? d.level : 1,
          updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
        };
      });

      const ranked = rankLeaderboardEntries(rawEntries, options.currentUserId, safeMax);
      options.onData(ranked);
    },
    (err: any) => {
      logFirestoreErrorQuiet(err, OperationType.LIST, 'streak_leaderboard');
      const code = String(err?.code || 'unknown');
      const msg = String(err?.message || 'Unable to load live leaderboard');
      const isPermissionError =
        code.toLowerCase().includes('permission') || msg.toLowerCase().includes('permission');
      options.onError?.({
        code,
        message: msg,
        isPermissionError,
      });
    }
  );
}

/**
 * Subscribes in real time via Firestore `onSnapshot` to the top 10 users ordered by `longestStreak`
 * (`longestStreak >= 1`) in `/streak_leaderboard` (populated by `syncUserStreakLeaderboardEntry`).
 * Uses a single-field query (`where + orderBy` on `longestStreak`) so no composite index is needed.
 */
export function subscribeToLongestStreakLeaderboard(options: {
  currentUserId?: string;
  maxEntries?: number;
  onData: (entries: RankedLeaderboardEntry[]) => void;
  onError?: (error: GlobalLeaderboardErrorInfo) => void;
}): Unsubscribe {
  const safeMax = Math.max(1, Math.min(25, Math.floor(options.maxEntries ?? 10)));
  if (!db || !auth?.currentUser) {
    options.onData([]);
    return () => {};
  }

  const leaderboardQuery = query(
    collection(db, 'streak_leaderboard'),
    where('longestStreak', '>=', 1),
    orderBy('longestStreak', 'desc'),
    limit(safeMax)
  );

  return onSnapshot(
    leaderboardQuery,
    (snapshot) => {
      const rawEntries: GlobalLeaderboardEntry[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data() || {};
        return {
          userId: String(d.userId || docSnap.id),
          displayName: String(d.displayName || 'Aadesh Explorer').slice(0, 64),
          avatarUrl: typeof d.avatarUrl === 'string' ? d.avatarUrl : undefined,
          avatarColor: typeof d.avatarColor === 'string' ? d.avatarColor : undefined,
          country: typeof d.country === 'string' ? d.country : undefined,
          countryFlag: typeof d.countryFlag === 'string' ? d.countryFlag : undefined,
          currentStreak: Math.max(0, Math.floor(Number(d.currentStreak) || 0)),
          longestStreak: Math.max(0, Math.floor(Number(d.longestStreak) || 0)),
          lastActiveDate: typeof d.lastActiveDate === 'string' ? d.lastActiveDate : undefined,
          level: typeof d.level === 'number' ? d.level : 1,
          updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
        };
      });

      const ranked = rankLongestStreakLeaderboardEntries(
        rawEntries,
        options.currentUserId,
        safeMax
      );
      options.onData(ranked);
    },
    (err: any) => {
      logFirestoreErrorQuiet(err, OperationType.LIST, 'streak_leaderboard');
      const code = String(err?.code || 'unknown');
      const msg = String(err?.message || 'Unable to load longest streak leaderboard');
      const isPermissionError =
        code.toLowerCase().includes('permission') || msg.toLowerCase().includes('permission');
      options.onError?.({
        code,
        message: msg,
        isPermissionError,
      });
    }
  );
}

// ---------------- SUGGESTED REPLIES ENGAGEMENT ANALYTICS ----------------

/**
 * Atomically records a user click on a Suggested Reply chip inside
 * `/users/{userId}/suggestionAnalytics/{statId}` using a Firestore SDK v13.2.0 transaction.
 */
export async function recordSuggestedReplyClickInFirestore(
  userId: string,
  suggestionText: string,
  language?: string,
  nowMs: number = Date.now()
): Promise<boolean> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return false;
  const trimmed = String(suggestionText || '').trim().slice(0, 160);
  const normalizedKey = normalizeSuggestionKey(trimmed);
  if (!trimmed || !normalizedKey) return false;

  const uid = safeDocId(userId);
  const statId = buildSuggestionStatId(trimmed);
  const category: SuggestionCategory = classifySuggestionCategory(trimmed);
  const statRef = doc(db, 'users', uid, 'suggestionAnalytics', statId);
  const nowIso = new Date(nowMs).toISOString();

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(statRef);
      if (snap.exists()) {
        const existing = snap.data() || {};
        const prevCount = sanitizeFiniteInt(existing.clickCount, 0, 999999, 0);
        const nextCount = Math.min(1000000, prevCount + 1);
        tx.update(statRef, {
          sampleText: trimmed,
          category,
          ...(language ? { language: String(language).slice(0, 20) } : {}),
          clickCount: nextCount,
          lastClickedAt: nowIso,
        });
      } else {
        tx.set(statRef, {
          id: statId,
          userId: uid,
          normalizedKey,
          sampleText: trimmed,
          category,
          ...(language ? { language: String(language).slice(0, 20) } : {}),
          clickCount: 1,
          lastClickedAt: nowIso,
          createdAt: nowIso,
        });
      }
    });
    return true;
  } catch (err) {
    if (classifyFirestoreErrorKind(err) === 'permission_denied') {
      console.warn('[SuggestionAnalytics notice] write skipped due to remote permissions:', err);
    }
    return false;
  }
}

export async function loadTopSuggestedReplyPatternsFromFirestore(
  userId: string,
  maxItems: number = 25
): Promise<SuggestionAnalyticsItem[]> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return [];
  const uid = safeDocId(userId);
  const safeLimit = sanitizeFiniteInt(maxItems, 1, 50, 25);

  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'suggestionAnalytics'),
        orderBy('clickCount', 'desc'),
        limit(safeLimit)
      )
    );
    return snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: String(data.id || d.id),
        normalizedKey: String(data.normalizedKey || '').slice(0, 120),
        sampleText: String(data.sampleText || '').slice(0, 160),
        category: (data.category as SuggestionCategory) || 'general',
        language: typeof data.language === 'string' ? data.language.slice(0, 20) : undefined,
        clickCount: sanitizeFiniteInt(data.clickCount, 0, 1000000, 0),
        lastClickedAt: data.lastClickedAt ? new Date(data.lastClickedAt).getTime() : Date.now(),
        createdAt: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
      };
    });
  } catch {
    return [];
  }
}


