import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildUserActivityTimeline,
  formatOwnerTimestamps,
  OWNER_COUNTRY_PRESETS,
  OwnerManagedUser,
  SOLE_OWNER_EMAIL,
  validateAndComputeOwnerStreakUpdate,
  validateOwnerProfilePatch,
} from '../utils/ownerAdmin';

const ROOT_DIR = process.cwd();

function makeSampleUser(overrides: Partial<OwnerManagedUser> = {}): OwnerManagedUser {
  return {
    uid: 'user-uid-123',
    userId: 'user-uid-123',
    email: 'sagarjaisi92@gmail.com',
    emailVerified: true,
    displayName: 'Sagar Jaisi',
    username: 'sagarj',
    nickname: 'Sagar',
    country: 'Nepal',
    countryCode: 'NP',
    countryFlag: '🇳🇵',
    timezone: 'Asia/Kathmandu',
    createdAt: '2026-10-01T06:00:00.000Z',
    lastLoginAt: '2026-11-27T14:30:00.000Z',
    lastActiveAt: '2026-11-27T15:00:00.000Z',
    status: 'active',
    disabled: false,
    role: 'user',
    provider: 'google.com',
    preferredLanguage: 'en',
    aiProvider: 'gemini',
    aiResponseLanguage: 'ne',
    messageCount: 12,
    conversationCount: 3,
    currentStreak: 4,
    longestStreak: 12,
    lastActiveDate: '2026-11-27',
    recoveryCount: 1,
    recoveredDates: ['2026-11-15'],
    xp: 320,
    level: 4,
    authSynced: true,
    hasFirestoreProfile: true,
    ...overrides,
  };
}

test('O1. Sole owner constant matches aadeshjaisi6@gmail.com and rejects UID/role/secret/self-suspension in profile patch', () => {
  assert.equal(SOLE_OWNER_EMAIL, 'aadeshjaisi6@gmail.com');

  const sample = makeSampleUser();

  const uidEdit = validateOwnerProfilePatch(
    { uid: 'forged-uid', displayName: 'Test', reason: 'Testing UID rejection' },
    sample
  );
  assert.equal(uidEdit.ok, false);

  const roleEscalation = validateOwnerProfilePatch(
    { role: 'admin', displayName: 'Test', reason: 'Testing role escalation rejection' },
    sample
  );
  assert.equal(roleEscalation.ok, false);

  const missingReason = validateOwnerProfilePatch(
    { nickname: 'Sage', reason: 'no' },
    sample
  );
  assert.equal(missingReason.ok, false);

  const unsafePhoto = validateOwnerProfilePatch(
    { photoURL: 'javascript:alert(1)', reason: 'Unsafe photo URL check' },
    sample
  );
  assert.equal(unsafePhoto.ok, false);

  const secretLeak = validateOwnerProfilePatch(
    { username: 'AIzaSyTestSecretKeyValue12345', reason: 'Secret pattern test' },
    sample
  );
  assert.equal(secretLeak.ok, false);

  const ownerSelfSuspend = validateOwnerProfilePatch(
    { status: 'suspended', reason: 'Try suspending sole owner' },
    makeSampleUser({ uid: 'owner-uid', email: 'aadeshjaisi6@gmail.com', role: 'admin' })
  );
  assert.equal(ownerSelfSuspend.ok, false);
});

test('O2. validateOwnerProfilePatch builds atomic Firestore, Auth, leaderboard, and audit snapshots', () => {
  const sample = makeSampleUser();
  const res = validateOwnerProfilePatch(
    {
      displayName: 'Sagar N.',
      username: 'sagar_np',
      nickname: 'Sag',
      country: 'Japan',
      countryCode: 'JP',
      countryFlag: '🇯🇵',
      timezone: 'Asia/Tokyo',
      aiProvider: 'groq',
      status: 'suspended',
      reason: 'Owner test update with country move and status audit',
    },
    sample
  );

  assert.equal(res.ok, true);
  assert.equal(res.auditAction, 'status_change');
  assert.equal(res.firestorePatch?.displayName, 'Sagar N.');
  assert.equal(res.firestorePatch?.timezone, 'Asia/Tokyo');
  assert.equal(res.firestorePatch?.aiProvider, 'groq');
  assert.equal(res.authPatch?.displayName, 'Sagar N.');
  assert.equal(res.authPatch?.disabled, true);
  assert.equal(res.leaderboardPatch?.countryFlag, '🇯🇵');
  assert.equal(res.beforeSnapshot?.status, 'active');
  assert.equal(res.afterSnapshot?.status, 'suspended');
});

test('O3. validateAndComputeOwnerStreakUpdate supports setting Streak=100, Asia/Kathmandu, and Reset to 0', () => {
  const sample = makeSampleUser({ currentStreak: 4, longestStreak: 12, recoveryCount: 1 });

  const set100 = validateAndComputeOwnerStreakUpdate(
    {
      currentStreak: 100,
      lastActiveDate: '2026-11-28',
      recoveryCount: 2,
      timezone: 'Asia/Kathmandu',
      reason: 'Restore verified 100-day milestone after migration',
    },
    sample
  );

  assert.equal(set100.ok, true);
  assert.equal(set100.firestorePatch?.currentStreak, 100);
  assert.equal(set100.firestorePatch?.streakDays, 100);
  assert.equal(set100.firestorePatch?.longestStreak, 100);
  assert.equal(set100.leaderboardPatch?.currentStreak, 100);
  assert.equal(set100.afterSnapshot?.timezone, 'Asia/Kathmandu');

  const resetZero = validateAndComputeOwnerStreakUpdate(
    {
      resetToZero: true,
      longestStreak: 100,
      reason: 'Abuse check reset streak to zero',
    },
    { ...sample, currentStreak: 100, longestStreak: 100 }
  );

  assert.equal(resetZero.ok, true);
  assert.equal(resetZero.firestorePatch?.currentStreak, 0);
  assert.equal(resetZero.firestorePatch?.streakDays, 0);
  assert.equal(resetZero.firestorePatch?.longestStreak, 100);

  const badDate = validateAndComputeOwnerStreakUpdate(
    { lastActiveDate: '28-11-2026', reason: 'Invalid date format check' },
    sample
  );
  assert.equal(badDate.ok, false);

  const badRecovery = validateAndComputeOwnerStreakUpdate(
    { recoveryCount: 9, reason: 'Over max recovery check' },
    sample
  );
  assert.equal(badRecovery.ok, false);
});

test('O4. Timeline & timezone formatting clearly distinguish unavailable Auth login timestamps and render UTC + local time', () => {
  const noLoginUser = makeSampleUser({ lastLoginAt: null, authSynced: false });
  const timeline = buildUserActivityTimeline({
    user: noLoginUser,
    conversations: [{ id: 'c1', title: 'Nepali Study Chat', updatedAt: '2026-11-26T09:00:00.000Z', messageCount: 6 }],
    analyticsEvents: [{ id: 'e1', eventType: 'chat', language: 'ne', timestamp: '2026-11-27T10:00:00.000Z' }],
    auditLogs: [
      {
        id: 'a1',
        timestamp: '2026-11-28T01:00:00.000Z',
        actorUid: 'owner-uid',
        actorEmail: SOLE_OWNER_EMAIL,
        targetUid: noLoginUser.uid,
        action: 'streak_update',
        reason: 'Manual verification',
      },
    ],
  });

  const unavailableLogin = timeline.find((e) => e.id.startsWith('login-unavailable-'));
  assert.ok(unavailableLogin);
  assert.equal(unavailableLogin.dataAvailability, 'unavailable');
  assert.ok(timeline.some((e) => e.type === 'streak'));
  assert.ok(timeline.some((e) => e.type === 'conversation'));
  assert.ok(timeline.some((e) => e.type === 'message'));

  const fmt = formatOwnerTimestamps('2026-11-28T06:00:00.000Z', 'Asia/Kathmandu');
  assert.equal(fmt.available, true);
  assert.ok(fmt.utc.endsWith('UTC'));
  assert.ok(fmt.local.includes('2026'));

  const emptyFmt = formatOwnerTimestamps(null, 'Asia/Kathmandu');
  assert.equal(emptyFmt.available, false);
  assert.equal(emptyFmt.local, 'Unavailable');

  assert.ok(OWNER_COUNTRY_PRESETS.some((p) => p.country === 'Nepal' && p.timezone === 'Asia/Kathmandu'));
});

test('O5. Server routes enforce requireAadeshAdmin and frontend never imports firebase-admin or exposes instance metadata', () => {
  const serverSource = fs.readFileSync(path.join(ROOT_DIR, 'server.ts'), 'utf-8');
  const firebaseAdminServerSource = fs.readFileSync(
    path.join(ROOT_DIR, 'server/firebaseAdmin.ts'),
    'utf-8'
  );

  const expectedRoutes = [
    "/api/admin/owner/users', requireAadeshAdmin",
    "/api/admin/owner/users/:uid', requireAadeshAdmin",
    "'/api/admin/owner/users/:uid/profile',\n  requireAadeshAdmin",
    "'/api/admin/owner/users/:uid/streak',\n  requireAadeshAdmin",
    "'/api/admin/owner/users/:uid/conversations',\n  requireAadeshAdmin",
    "'/api/admin/owner/users/:uid/conversations/:convId/messages',\n  requireAadeshAdmin",
    "/api/admin/owner/audit-logs', requireAadeshAdmin",
  ];

  for (const snippet of expectedRoutes) {
    assert.ok(
      serverSource.includes(snippet),
      `Expected protected Owner route signature not found in server.ts: ${snippet}`
    );
  }

  assert.ok(serverSource.includes("email !== 'aadeshjaisi6@gmail.com'"));
  assert.ok(!serverSource.includes('metadata.google.internal'));
  assert.ok(!firebaseAdminServerSource.includes('metadata.google.internal'));

  // Verify no frontend file imports firebase-admin or server/firebaseAdmin
  const srcFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) srcFiles.push(full);
    }
  };
  walk(path.join(ROOT_DIR, 'src'));

  for (const file of srcFiles) {
    if (file.endsWith('ownerAdmin.test.ts')) continue;
    const content = fs.readFileSync(file, 'utf-8');
    assert.ok(!content.includes('firebase-admin'), `Client file must not reference firebase-admin: ${file}`);
    assert.ok(!content.includes('server/firebaseAdmin'), `Client file must not import server/firebaseAdmin: ${file}`);
    assert.ok(!content.includes('metadata.google.internal'), `Client file must not reference metadata URL: ${file}`);
  }
});

test('O6. firestore.rules and firebase-blueprint.json enforce immutable owner_audit_logs and sole owner isAdmin', () => {
  const rules = fs.readFileSync(path.join(ROOT_DIR, 'firestore.rules'), 'utf-8');
  const blueprint = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'firebase-blueprint.json'), 'utf-8'));

  assert.ok(rules.includes("request.auth.token.email.lower() == 'aadeshjaisi6@gmail.com'"));
  assert.ok(rules.includes('match /owner_audit_logs/{logId}'));
  assert.ok(rules.includes('allow get, list: if isAdmin();'));
  assert.ok(rules.includes('allow update, delete: if false;'));
  assert.ok(rules.includes('isValidOwnerAuditLogDoc(incoming(), logId)'));

  assert.ok(blueprint.entities.OwnerAuditLog);
  assert.ok(blueprint.firestore['/owner_audit_logs/{logId}']);
  assert.ok(blueprint.entities.ChatMessage.properties.provider);
  assert.ok(blueprint.entities.ChatMessage.properties.modelUsed);
});
