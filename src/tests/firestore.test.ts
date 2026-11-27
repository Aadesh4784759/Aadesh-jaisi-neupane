import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { executeDailyStreakTransactionCore, StreakTransactionAdapter } from '../utils/firebase';
import { NEPAL_TIMEZONE } from '../utils/gamification';

interface MockAuthContext {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  creationTime?: string;
}

class MockFirestorePermissionError extends Error {
  code = 'permission-denied';
  constructor(message = 'Missing or insufficient permissions.') {
    super(message);
    this.name = 'FirebaseError';
  }
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, idx) => deepEqual(v, b[idx]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => keysB.includes(k) && deepEqual(a[k], b[k]));
  }
  return false;
}

function getAffectedKeys(incoming: Record<string, any>, existing: Record<string, any>): Set<string> {
  const keys = new Set<string>([...Object.keys(incoming), ...Object.keys(existing)]);
  const affected = new Set<string>();
  for (const key of keys) {
    const inHas = Object.prototype.hasOwnProperty.call(incoming, key);
    const exHas = Object.prototype.hasOwnProperty.call(existing, key);
    if (inHas !== exHas || !deepEqual(incoming[key], existing[key])) {
      affected.add(key);
    }
  }
  return affected;
}

function isValidIdRule(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

function isNumInRange(val: unknown, min: number, max: number): boolean {
  return typeof val === 'number' && Number.isFinite(val) && val >= min && val <= max;
}

function isStrInRange(val: unknown, min: number, max: number): boolean {
  return typeof val === 'string' && val.length >= min && val.length <= max;
}

const STREAK_ALLOWED_AFFECTED_KEYS = new Set([
  'userId',
  'displayName',
  'streakDays',
  'currentStreak',
  'longestStreak',
  'lastActiveDate',
  'timezone',
  'recoveryCount',
  'recoveryMonth',
  'streakBeforeBreak',
  'streakBrokenDate',
  'xp',
  'level',
  'levelTitle',
  'streakGoalDays',
  'recoveredDates',
  'updatedAt',
  'lastActiveAt',
]);

const USER_CREATE_ALLOWED_KEYS = new Set([
  'userId',
  'displayName',
  'nickname',
  'age',
  'onboardingCompleted',
  'memoryConsent',
  'username',
  'email',
  'photoURL',
  'preferredLanguage',
  'preferredTheme',
  'aiProvider',
  'aiModel',
  'openRouterModel',
  'termsAccepted',
  'termsAcceptedAt',
  'country',
  'countryCode',
  'countryFlag',
  'timezone',
  'countryDetectionMethod',
  'isManualCountry',
  'streakDays',
  'currentStreak',
  'longestStreak',
  'lastActiveDate',
  'recoveryCount',
  'recoveryMonth',
  'streakBeforeBreak',
  'streakBrokenDate',
  'xp',
  'level',
  'levelTitle',
  'streakGoalDays',
  'recoveredDates',
  'status',
  'role',
  'provider',
  'messageCount',
  'conversationCount',
  'createdAt',
  'updatedAt',
  'lastActiveAt',
]);

const USER_OWNER_UPDATE_ALLOWED_KEYS = new Set([
  'userId',
  'displayName',
  'nickname',
  'age',
  'onboardingCompleted',
  'memoryConsent',
  'username',
  'email',
  'photoURL',
  'preferredLanguage',
  'preferredTheme',
  'aiProvider',
  'aiModel',
  'openRouterModel',
  'termsAccepted',
  'termsAcceptedAt',
  'country',
  'countryCode',
  'countryFlag',
  'timezone',
  'countryDetectionMethod',
  'isManualCountry',
  'streakDays',
  'currentStreak',
  'longestStreak',
  'lastActiveDate',
  'recoveryCount',
  'recoveryMonth',
  'streakBeforeBreak',
  'streakBrokenDate',
  'xp',
  'level',
  'levelTitle',
  'streakGoalDays',
  'recoveredDates',
  'provider',
  'messageCount',
  'conversationCount',
  'updatedAt',
  'lastActiveAt',
]);

/**
 * Evaluates current /firestore.rules logic for `/users/{userId}` creates & updates.
 */
function evaluateUserCreateRules(
  auth: MockAuthContext | null,
  userId: string,
  incoming: Record<string, any>
): boolean {
  if (!isValidIdRule(userId)) return false;
  if (!auth || auth.uid !== userId) return false;
  const keys = Object.keys(incoming);
  if (!['userId', 'displayName', 'createdAt'].every((reqKey) => keys.includes(reqKey))) return false;
  if (!keys.every((k) => USER_CREATE_ALLOWED_KEYS.has(k))) return false;
  if (incoming.userId !== userId) return false;
  if (!isStrInRange(incoming.displayName, 1, 100)) return false;
  if (!isStrInRange(incoming.createdAt, 0, 50)) return false;

  const isAdmin =
    Boolean(auth.emailVerified) && String(auth.email || '').toLowerCase() === 'aadeshjaisi6@gmail.com';
  if ('role' in incoming && incoming.role !== 'user' && !isAdmin) return false;
  if ('status' in incoming && incoming.status !== 'active' && !isAdmin) return false;
  if ('aiProvider' in incoming && !['gemini', 'groq', 'openrouter'].includes(incoming.aiProvider)) return false;
  if ('aiModel' in incoming && !isStrInRange(incoming.aiModel, 0, 120)) return false;
  if ('openRouterModel' in incoming && !isStrInRange(incoming.openRouterModel, 0, 120)) return false;
  if ('recoveryCount' in incoming && !isNumInRange(incoming.recoveryCount, 0, 5)) return false;
  if ('level' in incoming && !isNumInRange(incoming.level, 1, 100)) return false;
  if ('streakGoalDays' in incoming && !isNumInRange(incoming.streakGoalDays, 1, 365)) return false;
  return true;
}

function evaluateIsValidUserStreakUpdateCurrent(
  incoming: Record<string, any>,
  existing: Record<string, any>,
  userId: string
): boolean {
  const affected = getAffectedKeys(incoming, existing);
  for (const key of affected) {
    if (!STREAK_ALLOWED_AFFECTED_KEYS.has(key)) return false;
  }
  if (affected.has('userId') && incoming.userId !== userId) return false;
  if (affected.has('displayName') && !isStrInRange(incoming.displayName, 1, 100)) return false;
  if (affected.has('streakDays') && !isNumInRange(incoming.streakDays, 0, 10000)) return false;
  if (affected.has('currentStreak') && !isNumInRange(incoming.currentStreak, 0, 10000)) return false;
  if (affected.has('longestStreak') && !isNumInRange(incoming.longestStreak, 0, 10000)) return false;
  if (affected.has('lastActiveDate') && !isStrInRange(incoming.lastActiveDate, 0, 20)) return false;
  if (affected.has('timezone') && !isStrInRange(incoming.timezone, 0, 64)) return false;
  if (affected.has('recoveryCount') && !isNumInRange(incoming.recoveryCount, 0, 5)) return false;
  if (affected.has('recoveryMonth') && !isStrInRange(incoming.recoveryMonth, 0, 16)) return false;
  if (affected.has('streakBeforeBreak') && !isNumInRange(incoming.streakBeforeBreak, 0, 10000)) return false;
  if (affected.has('streakBrokenDate') && !isStrInRange(incoming.streakBrokenDate, 0, 20)) return false;
  if (affected.has('xp') && !isNumInRange(incoming.xp, 0, 10000000)) return false;
  if (affected.has('level') && !isNumInRange(incoming.level, 1, 100)) return false;
  if (affected.has('levelTitle') && !isStrInRange(incoming.levelTitle, 0, 40)) return false;
  if (affected.has('streakGoalDays') && !isNumInRange(incoming.streakGoalDays, 1, 365)) return false;
  if (affected.has('recoveredDates') && (!Array.isArray(incoming.recoveredDates) || incoming.recoveredDates.length > 120)) {
    return false;
  }
  if (affected.has('updatedAt') && !isStrInRange(incoming.updatedAt, 0, 50)) return false;
  if (affected.has('lastActiveAt') && !isStrInRange(incoming.lastActiveAt, 0, 50)) return false;
  return true;
}

/**
 * Simulates the OLD buggy rule logic to prove why legacy untouched fields caused permission-denied before the fix.
 */
function evaluateIsValidUserStreakUpdateLegacyBuggy(
  incoming: Record<string, any>,
  existing: Record<string, any>,
  userId: string
): boolean {
  const affected = getAffectedKeys(incoming, existing);
  for (const key of affected) {
    if (!STREAK_ALLOWED_AFFECTED_KEYS.has(key)) return false;
  }
  const checkUntouchedOrNull = (key: string, validator: (val: any) => boolean) =>
    !(key in incoming) || (!affected.has(key) && incoming[key] === null) || validator(incoming[key]);

  return (
    (!(userId && 'userId' in incoming) ||
      (!affected.has('userId') && (incoming.userId === null || incoming.userId === '')) ||
      incoming.userId === userId) &&
    checkUntouchedOrNull('level', (v) => isNumInRange(v, 1, 100)) &&
    checkUntouchedOrNull('streakGoalDays', (v) => isNumInRange(v, 1, 365)) &&
    checkUntouchedOrNull('recoveryCount', (v) => isNumInRange(v, 0, 5)) &&
    checkUntouchedOrNull('updatedAt', (v) => isStrInRange(v, 0, 50))
  );
}

function evaluateIsValidUserUpdateDoc(
  incoming: Record<string, any>,
  existing: Record<string, any>,
  userId: string
): boolean {
  const affected = getAffectedKeys(incoming, existing);
  if (
    'userId' in incoming &&
    !(!affected.has('userId') && (incoming.userId === null || incoming.userId === '')) &&
    incoming.userId !== userId
  ) {
    return false;
  }
  if (affected.has('displayName') && !isStrInRange(incoming.displayName, 1, 100)) return false;
  if (
    'createdAt' in incoming &&
    !isStrInRange(incoming.createdAt, 0, 50) &&
    !(incoming.createdAt instanceof Date)
  ) {
    return false;
  }
  if (affected.has('aiProvider') && !['gemini', 'groq', 'openrouter'].includes(incoming.aiProvider)) {
    return false;
  }
  if (affected.has('aiModel') && !isStrInRange(incoming.aiModel, 0, 120)) return false;
  if (affected.has('openRouterModel') && !isStrInRange(incoming.openRouterModel, 0, 120)) return false;
  if (affected.has('level') && !isNumInRange(incoming.level, 1, 100)) return false;
  if (affected.has('streakGoalDays') && !isNumInRange(incoming.streakGoalDays, 1, 365)) return false;
  if (affected.has('recoveryCount') && !isNumInRange(incoming.recoveryCount, 0, 5)) return false;
  return true;
}

function evaluateUserUpdateRules(
  auth: MockAuthContext | null,
  userId: string,
  incoming: Record<string, any>,
  existing: Record<string, any>,
  mode: 'current' | 'legacy_buggy' = 'current'
): boolean {
  if (!isValidIdRule(userId) || !auth) return false;
  const isAdmin =
    Boolean(auth.emailVerified) && String(auth.email || '').toLowerCase() === 'aadeshjaisi6@gmail.com';
  const createdAtImmutable =
    !('createdAt' in incoming) || !('createdAt' in existing) || deepEqual(incoming.createdAt, existing.createdAt);

  if (isAdmin) {
    return evaluateIsValidUserUpdateDoc(incoming, existing, userId) && createdAtImmutable;
  }

  if (auth.uid !== userId) return false;
  const roleOk =
    !('role' in incoming) ||
    (!('role' in existing) && incoming.role === 'user') ||
    incoming.role === existing.role;
  const statusOk =
    !('status' in incoming) ||
    (!('status' in existing) && incoming.status === 'active') ||
    incoming.status === existing.status;
  const userIdOk =
    !('userId' in incoming) ||
    !('userId' in existing) ||
    existing.userId === null ||
    existing.userId === '' ||
    incoming.userId === existing.userId ||
    incoming.userId === userId;

  if (!roleOk || !statusOk || !createdAtImmutable || !userIdOk) return false;

  if (mode === 'legacy_buggy') {
    const legacyStreakOk = evaluateIsValidUserStreakUpdateLegacyBuggy(incoming, existing, userId);
    const affected = getAffectedKeys(incoming, existing);
    const allAllowed = [...affected].every((k) => USER_OWNER_UPDATE_ALLOWED_KEYS.has(k));
    const legacyUpdateDocOk =
      (!('level' in incoming) || isNumInRange(incoming.level, 1, 100)) &&
      (!('streakGoalDays' in incoming) || isNumInRange(incoming.streakGoalDays, 1, 365)) &&
      (!('recoveryCount' in incoming) || isNumInRange(incoming.recoveryCount, 0, 5));
    return legacyStreakOk || (legacyUpdateDocOk && allAllowed);
  }

  const affected = getAffectedKeys(incoming, existing);
  const allOwnerAllowed = [...affected].every((k) => USER_OWNER_UPDATE_ALLOWED_KEYS.has(k));
  return (
    evaluateIsValidUserStreakUpdateCurrent(incoming, existing, userId) ||
    (evaluateIsValidUserUpdateDoc(incoming, existing, userId) && allOwnerAllowed)
  );
}

function createMockUsersCollectionHarness(initialDocs: Record<string, Record<string, any>> = {}, mode: 'current' | 'legacy_buggy' = 'current') {
  const store = new Map<string, Record<string, any>>();
  for (const [id, data] of Object.entries(initialDocs)) {
    store.set(id, structuredClone(data));
  }

  const createAdapter = (auth: MockAuthContext | null, targetDocId: string): StreakTransactionAdapter => ({
    userId: targetDocId,
    authEmail: auth?.email ?? null,
    authEmailVerified: Boolean(auth?.emailVerified),
    authDisplayName: auth?.displayName ?? null,
    authCreationTime: auth?.creationTime ?? null,
    runTx: async (executor) => {
      const snapData = store.get(targetDocId);
      const pendingOps: Array<() => void> = [];
      const result = await executor({
        getDoc: async () => {
          if (!auth || (auth.uid !== targetDocId && !(auth.emailVerified && auth.email?.toLowerCase() === 'aadeshjaisi6@gmail.com'))) {
            throw new MockFirestorePermissionError();
          }
          return {
            exists: Boolean(snapData),
            data: snapData ? structuredClone(snapData) : {},
          };
        },
        updateDoc: (patch) => {
          if (!snapData) throw new Error('NOT_FOUND');
          const merged = { ...snapData, ...patch };
          if (!evaluateUserUpdateRules(auth, targetDocId, merged, snapData, mode)) {
            throw new MockFirestorePermissionError();
          }
          pendingOps.push(() => store.set(targetDocId, structuredClone(merged)));
        },
        setDoc: (docData) => {
          if (!evaluateUserCreateRules(auth, targetDocId, docData)) {
            throw new MockFirestorePermissionError();
          }
          pendingOps.push(() => store.set(targetDocId, structuredClone(docData)));
        },
      });
      for (const applyOp of pendingOps) applyOp();
      return result;
    },
    fallbackSetDoc: async (docData) => {
      if (!evaluateUserCreateRules(auth, targetDocId, docData)) {
        throw new MockFirestorePermissionError();
      }
      store.set(targetDocId, structuredClone(docData));
    },
    fallbackUpdateDoc: async (patch) => {
      const existing = store.get(targetDocId);
      if (!existing) throw new Error('NOT_FOUND');
      const merged = { ...existing, ...patch };
      if (!evaluateUserUpdateRules(auth, targetDocId, merged, existing, mode)) {
        throw new MockFirestorePermissionError();
      }
      store.set(targetDocId, structuredClone(merged));
    },
  });

  return { store, createAdapter };
}

test('F1. Authenticated owner creates initial users/{userId} doc atomically via recordDailyStreakActivityInFirestoreSafe logic', async () => {
  const uid = 'user_alpha_123';
  const harness = createMockUsersCollectionHarness();
  const nowMs = new Date('2026-11-25T09:30:00+05:45').getTime();

  const res = await executeDailyStreakTransactionCore(
    harness.createAdapter(
      { uid, email: 'alpha@example.com', emailVerified: true, displayName: 'Alpha User' },
      uid
    ),
    NEPAL_TIMEZONE,
    nowMs,
    { displayName: 'Alpha User', provider: 'google' }
  );

  assert.equal(res.ok, true);
  assert.equal(res.result.nextState.currentStreak, 1);
  assert.equal(res.result.nextState.lastActiveDate, '2026-11-25');
  const saved = harness.store.get(uid)!;
  assert.equal(saved.userId, uid);
  assert.equal(saved.role, 'user');
  assert.equal(saved.status, 'active');
  assert.equal(saved.currentStreak, 1);
});

test('F2. Reproduces why legacy untouched fields caused permission-denied before fix AND proves current firestore.rules passes', async () => {
  const uid = 'legacy_user_789';
  const legacyDoc = {
    // Missing userId, blank displayName, untouched legacy out-of-range fields
    displayName: '   ',
    email: 'legacy@example.com',
    role: 'user',
    status: 'active',
    level: 0, // < 1 in legacy document
    streakGoalDays: 0, // < 1 in legacy document
    recoveryCount: 6, // > 5 in legacy document
    createdAt: new Date('2025-01-01T00:00:00Z'), // Legacy Timestamp/Date object
    streakDays: 3,
    currentStreak: 3,
    longestStreak: 5,
    lastActiveDate: '2026-11-24',
    timezone: NEPAL_TIMEZONE,
  };

  const nowMs = new Date('2026-11-25T10:00:00+05:45').getTime();

  // Confirm old buggy rule rejected untouched legacy fields with permission-denied
  const legacyBuggyHarness = createMockUsersCollectionHarness({ [uid]: legacyDoc }, 'legacy_buggy');
  const oldFailure = await executeDailyStreakTransactionCore(
    legacyBuggyHarness.createAdapter(
      { uid, email: 'legacy@example.com', emailVerified: true, displayName: 'Legacy Owner' },
      uid
    ),
    NEPAL_TIMEZONE,
    nowMs
  );
  assert.equal(oldFailure.ok, false);
  if (!oldFailure.ok) {
    assert.equal(oldFailure.errorCode, 'permission_denied');
  }

  // Confirm fixed current rule succeeds, backfills userId & displayName, increments streak 3 -> 4, and preserves createdAt/role/status
  const fixedHarness = createMockUsersCollectionHarness({ [uid]: legacyDoc }, 'current');
  const fixedRes = await executeDailyStreakTransactionCore(
    fixedHarness.createAdapter(
      { uid, email: 'legacy@example.com', emailVerified: true, displayName: 'Legacy Owner' },
      uid
    ),
    NEPAL_TIMEZONE,
    nowMs
  );
  assert.equal(fixedRes.ok, true);
  if (fixedRes.ok) {
    assert.equal(fixedRes.result.streakIncreased, true);
    assert.equal(fixedRes.result.nextState.currentStreak, 4);
    assert.equal(fixedRes.result.nextState.longestStreak, 5);
  }
  const updated = fixedHarness.store.get(uid)!;
  assert.equal(updated.userId, uid);
  assert.equal(updated.displayName, 'Legacy Owner');
  assert.equal(updated.role, 'user');
  assert.equal(updated.status, 'active');
  assert.equal(updated.streakDays, 4);
  assert.equal(updated.currentStreak, 4);
});

test('F3. Same-day repeat streak transaction is idempotent and writes zero duplicate increments', async () => {
  const uid = 'user_same_day';
  const nowMs = new Date('2026-11-25T11:00:00+05:45').getTime();
  const harness = createMockUsersCollectionHarness({
    [uid]: {
      userId: uid,
      displayName: 'Sagar',
      role: 'user',
      status: 'active',
      createdAt: '2026-11-01T00:00:00.000Z',
      streakDays: 4,
      currentStreak: 4,
      longestStreak: 6,
      lastActiveDate: '2026-11-25',
      timezone: NEPAL_TIMEZONE,
      recoveryCount: 0,
      recoveryMonth: '2026-11',
      streakBeforeBreak: 0,
      streakBrokenDate: '',
    },
  });

  const res = await executeDailyStreakTransactionCore(
    harness.createAdapter({ uid, email: 'sagar@example.com', emailVerified: true }, uid),
    NEPAL_TIMEZONE,
    nowMs
  );

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.result.streakIncreased, false);
    assert.equal(res.result.nextState.currentStreak, 4);
  }
});

test('F4. Unauthorized user cannot read or update another users/{userId} document', async () => {
  const targetUid = 'victim_uid';
  const attackerUid = 'attacker_uid';
  const harness = createMockUsersCollectionHarness({
    [targetUid]: {
      userId: targetUid,
      displayName: 'Target User',
      role: 'user',
      status: 'active',
      createdAt: '2026-11-01T00:00:00.000Z',
      currentStreak: 3,
      longestStreak: 3,
      lastActiveDate: '2026-11-24',
      timezone: NEPAL_TIMEZONE,
    },
  });

  const res = await executeDailyStreakTransactionCore(
    harness.createAdapter({ uid: attackerUid, email: 'attacker@example.com', emailVerified: true }, targetUid),
    NEPAL_TIMEZONE,
    new Date('2026-11-25T10:00:00+05:45').getTime()
  );

  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.errorCode, 'permission_denied');
  }
  assert.equal(harness.store.get(targetUid)!.currentStreak, 3);
});

test('F5. Owner cannot escalate role, mutate account status, alter createdAt, or write unknown fields via streak update', () => {
  const uid = 'regular_user_001';
  const auth: MockAuthContext = { uid, email: 'user@example.com', emailVerified: true };
  const existing = {
    userId: uid,
    displayName: 'Regular User',
    role: 'user',
    status: 'active',
    createdAt: '2026-11-01T00:00:00.000Z',
    currentStreak: 2,
    streakDays: 2,
  };

  // Escalating role -> rejected
  assert.equal(
    evaluateUserUpdateRules(auth, uid, { ...existing, role: 'admin', currentStreak: 3 }, existing),
    false
  );
  // Mutating status -> rejected
  assert.equal(
    evaluateUserUpdateRules(auth, uid, { ...existing, status: 'suspended', currentStreak: 3 }, existing),
    false
  );
  // Tampering createdAt -> rejected
  assert.equal(
    evaluateUserUpdateRules(auth, uid, { ...existing, createdAt: '2020-01-01T00:00:00.000Z', currentStreak: 3 }, existing),
    false
  );
  // Writing undeclared nested streakActivity object -> rejected
  assert.equal(
    evaluateUserUpdateRules(auth, uid, { ...existing, streakActivity: { count: 99 } }, existing),
    false
  );
  // Valid AI provider selection persistence by owner -> allowed
  assert.equal(
    evaluateUserUpdateRules(
      auth,
      uid,
      { ...existing, aiProvider: 'openrouter', aiModel: 'openrouter/free', openRouterModel: 'openrouter/free' },
      existing
    ),
    true
  );
  // Invalid AI provider id -> rejected
  assert.equal(
    evaluateUserUpdateRules(auth, uid, { ...existing, aiProvider: 'unknown_provider' }, existing),
    false
  );
});

test('F6. Real firestore.rules file enforces affected-only field validation in isValidUserStreakUpdate and never uses allow if true', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.equal(/allow\s+(read|write)\s*:\s*if\s+true\b/i.test(rulesText), false);
  assert.ok(rulesText.includes('function isValidUserStreakUpdate(data, existingData, userId)'));
  assert.ok(rulesText.includes("(!('level' in affected) || (data.level is number && data.level >= 1 && data.level <= 100))"));
  assert.ok(rulesText.includes("(!('recoveryCount' in affected) || (data.recoveryCount is number && data.recoveryCount >= 0 && data.recoveryCount <= 5))"));
});

test('F7. Security audit: Firestore rules enforce non-negative bounds, restrict admin strictly to aadeshjaisi6@gmail.com, and sync /admins blueprint', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const blueprint = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8'));

  // Only aadeshjaisi6@gmail.com is allowlisted in admin email helper; sagarjaisi92@gmail.com must never appear as admin
  assert.ok(rulesText.includes("request.auth.token.email.lower() == 'aadeshjaisi6@gmail.com'"));
  assert.equal(rulesText.includes('sagarjaisi92@gmail.com'), false);

  // Verified non-negative numeric bounds on user/subcollection fields
  assert.ok(rulesText.includes('data.messageCount is number && data.messageCount >= 0 && data.messageCount <= 1000000'));
  assert.ok(rulesText.includes('data.conversationCount is number && data.conversationCount >= 0 && data.conversationCount <= 100000'));
  assert.ok(rulesText.includes('data.reminderMinutes is number && data.reminderMinutes >= 0 && data.reminderMinutes <= 10080'));
  assert.ok(rulesText.includes('data.durationSeconds is number && data.durationSeconds >= 0 && data.durationSeconds <= 86400'));
  assert.ok(rulesText.includes('data.latencyMs is number && data.latencyMs >= 0 && data.latencyMs <= 600000'));

  // Blueprint includes AdminAllowlist and /admins/{adminUid}
  assert.ok(blueprint?.entities?.AdminAllowlist);
  assert.ok(blueprint?.firestore?.['/admins/{adminUid}']);
});

test('F8. Power Memory rules & blueprint support 9 categories, bounded keywords, and strict UID isolation', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const blueprint = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8'));

  const expectedCategories = [
    'identity',
    'preference',
    'goal',
    'project',
    'interest',
    'comedy',
    'instruction',
    'fact',
    'conversation',
  ];

  for (const cat of expectedCategories) {
    assert.ok(rulesText.includes(`'${cat}'`), `firestore.rules missing category ${cat}`);
    assert.ok(
      blueprint?.entities?.AIMemory?.properties?.category?.enum?.includes(cat),
      `firebase-blueprint.json missing category ${cat}`
    );
  }

  assert.ok(rulesText.includes('function isValidMemoryDoc(data, userId, memoryId)'));
  assert.ok(rulesText.includes('data.keywords.size() <= 12'));
  assert.ok(rulesText.includes('incoming().createdAt == existing().createdAt'));
  assert.ok(rulesText.includes('match /memories/{memoryId}'));
  assert.ok(rulesText.includes('allow get: if isValidId(userId) && isValidId(memoryId) && (isOwner(userId) || isAdmin());'));
  assert.ok(rulesText.includes('allow delete: if isValidId(userId) && isValidId(memoryId) && (isOwner(userId) || isAdmin());'));
});

