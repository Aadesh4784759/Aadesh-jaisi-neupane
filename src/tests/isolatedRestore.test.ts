import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyBackupJsonString } from '../utils/backupExport';
import { resolveCollectionPath } from '../utils/backupRestore';
import { validateRestoreBackupPayload } from '../utils/backupValidation';

test('R1. verifyBackupJsonString validates schema version 1.0 and required metadata', () => {
  const validBackup = {
    metadata: {
      projectIdentifier: 'aadesh-ai-global',
      schemaVersion: '1.0',
      backupTimestamp: new Date().toISOString(),
      generator: 'Aadesh AI Secure Backup Center',
      totalDocuments: 5,
    },
    collectionManifest: ['users', 'users/{userId}/tasks'],
    documentCounts: { users: 1, 'users/{userId}/tasks': 1 },
    collections: {
      users: [{ id: 'user_1', userId: 'user_1', displayName: 'Test User' }],
      'users/{userId}/tasks': [{ id: 'task_1', userId: 'user_1', title: 'Complete Audit' }],
    },
  };

  const res = verifyBackupJsonString(JSON.stringify(validBackup));
  assert.equal(res.valid, true);
  assert.equal(res.stats?.schemaVersion, '1.0');
  assert.equal(res.stats?.projectIdentifier, 'aadesh-ai-global');
  assert.equal(res.stats?.totalDocuments, 5);
});

test('R2. verifyBackupJsonString rejects malformed or incompatible backups', () => {
  const invalidProject = {
    metadata: { projectIdentifier: 'wrong-project', schemaVersion: '1.0' },
    collectionManifest: [],
    documentCounts: {},
    collections: {},
  };
  const res1 = verifyBackupJsonString(JSON.stringify(invalidProject));
  assert.equal(res1.valid, false);
  assert.match(res1.errors[0], /projectIdentifier/);

  const invalidVersion = {
    metadata: { projectIdentifier: 'aadesh-ai-global', schemaVersion: '0.5' },
    collectionManifest: [],
    documentCounts: {},
    collections: {},
  };
  const res2 = verifyBackupJsonString(JSON.stringify(invalidVersion));
  assert.equal(res2.valid, false);
  assert.match(res2.errors[0], /schemaVersion/);

  const badJson = '{"metadata": { invalid json';
  const res3 = verifyBackupJsonString(badJson);
  assert.equal(res3.valid, false);
  assert.match(res3.errors[0], /JSON parsing error/);
});

test('R3. resolveCollectionPath correctly maps document IDs and nested parent paths', () => {
  const userRec = { id: 'u1', userId: 'u1', displayName: 'Aadesh' };
  const resolvedUser = resolveCollectionPath('users', userRec);
  assert.deepEqual(resolvedUser, { path: 'users', docId: 'u1' });

  const convRec = { id: 'c1', userId: 'u1', title: 'Chat' };
  const resolvedConv = resolveCollectionPath('users/{userId}/conversations', convRec);
  assert.deepEqual(resolvedConv, { path: 'users/u1/conversations', docId: 'c1' });

  const msgRec = { id: 'm1', userId: 'u1', conversationId: 'c1', content: 'Hello' };
  const resolvedMsg = resolveCollectionPath('users/{userId}/conversations/{convId}/messages', msgRec);
  assert.deepEqual(resolvedMsg, { path: 'users/u1/conversations/c1/messages', docId: 'm1' });

  const taskRec = { id: 't1', userId: 'u1', title: 'Task' };
  const resolvedTask = resolveCollectionPath('users/{userId}/tasks', taskRec);
  assert.deepEqual(resolvedTask, { path: 'users/u1/tasks', docId: 't1' });

  // Missing ID or userId should return null
  const badRec = { userId: 'u1', title: 'No ID' };
  assert.equal(resolveCollectionPath('users/{userId}/tasks', badRec), null);
});

test('R4. validateRestoreBackupPayload validates a pristine valid backup payload', () => {
  const pristineBackup = {
    metadata: {
      projectIdentifier: 'aadesh-ai-global',
      schemaVersion: '1.0',
      backupTimestamp: '2026-11-27T06:00:00.000Z',
      generator: 'Aadesh AI Secure Backup Center',
      totalDocuments: 3,
    },
    collectionManifest: ['users', 'users/{userId}/tasks', 'admin_settings'],
    documentCounts: { users: 1, 'users/{userId}/tasks': 1, admin_settings: 1 },
    collections: {
      users: [
        {
          id: 'u1',
          userId: 'u1',
          displayName: 'Aadesh Jaisi',
          email: 'aadeshjaisi6@gmail.com',
          role: 'admin',
          createdAt: '2026-11-27T00:00:00.000Z',
        },
      ],
      'users/{userId}/tasks': [
        {
          id: 't1',
          userId: 'u1',
          title: 'Review Security Audit',
          completed: false,
          priority: 'high',
          category: 'development',
          createdAt: '2026-11-27T00:00:00.000Z',
          updatedAt: '2026-11-27T00:00:00.000Z',
        },
      ],
      admin_settings: [
        {
          id: 'global',
          platformName: 'Aadesh AI Global Hub',
          maintenanceMode: false,
          announcement: 'All systems operational',
          updatedAt: '2026-11-27T00:00:00.000Z',
        },
      ],
    },
  };

  const result = validateRestoreBackupPayload(pristineBackup);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.stats?.totalDocuments, 3);
});

test('R5. validateRestoreBackupPayload rejects unauthorized collection paths', () => {
  const maliciousBackup = {
    metadata: {
      projectIdentifier: 'aadesh-ai-global',
      schemaVersion: '1.0',
      backupTimestamp: '2026-11-27T06:00:00.000Z',
      totalDocuments: 1,
    },
    collectionManifest: ['users', 'admins'],
    documentCounts: { users: 1, admins: 1 },
    collections: {
      users: [{ id: 'u1', userId: 'u1', displayName: 'User' }],
      admins: [{ id: 'admin1', role: 'superadmin' }],
    },
  };

  const result = validateRestoreBackupPayload(maliciousBackup);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('Unauthorized collection path')));
});

test('R6. validateRestoreBackupPayload rejects sensitive configuration and forbidden keys', () => {
  const sensitiveBackup = {
    metadata: {
      projectIdentifier: 'aadesh-ai-global',
      schemaVersion: '1.0',
      backupTimestamp: '2026-11-27T06:00:00.000Z',
      totalDocuments: 1,
    },
    collectionManifest: ['users'],
    documentCounts: { users: 1 },
    collections: {
      users: [
        {
          id: 'u1',
          userId: 'u1',
          displayName: 'Hacked User',
          groq_api_key: 'gsk_123456789012345678901234',
        },
      ],
    },
  };

  const result = validateRestoreBackupPayload(sensitiveBackup);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('Sensitive configuration or credential field "groq_api_key"')));
});

test('R7. validateRestoreBackupPayload rejects leaked API key values and private keys', () => {
  const leakedKeyBackup = {
    metadata: {
      projectIdentifier: 'aadesh-ai-global',
      schemaVersion: '1.0',
      backupTimestamp: '2026-11-27T06:00:00.000Z',
      totalDocuments: 1,
    },
    collectionManifest: ['users/{userId}/tasks'],
    documentCounts: { 'users/{userId}/tasks': 1 },
    collections: {
      'users/{userId}/tasks': [
        {
          id: 't1',
          userId: 'u1',
          title: 'Deploy',
          notes: 'Here is the key: sk-or-v1-abcdef1234567890abcdef1234567890',
        },
      ],
    },
  };

  const result = validateRestoreBackupPayload(leakedKeyBackup);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('Sensitive API key or private credential pattern detected')));
});

test('R8. validateRestoreBackupPayload rejects privilege escalation attempts', () => {
  const escalationBackup = {
    metadata: {
      projectIdentifier: 'aadesh-ai-global',
      schemaVersion: '1.0',
      backupTimestamp: '2026-11-27T06:00:00.000Z',
      totalDocuments: 1,
    },
    collectionManifest: ['users'],
    documentCounts: { users: 1 },
    collections: {
      users: [
        {
          id: 'user_impostor',
          userId: 'user_impostor',
          displayName: 'Impostor User',
          email: 'sagarjaisi92@gmail.com',
          role: 'admin', // Impostor attempting to gain admin privileges via restore
        },
      ],
    },
  };

  const result = validateRestoreBackupPayload(escalationBackup);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('Unauthorized privilege escalation')));
});

test('R9. validateRestoreBackupPayload rejects unauthorized injected fields in collection documents', () => {
  const injectedFieldsBackup = {
    metadata: {
      projectIdentifier: 'aadesh-ai-global',
      schemaVersion: '1.0',
      backupTimestamp: '2026-11-27T06:00:00.000Z',
      totalDocuments: 1,
    },
    collectionManifest: ['users'],
    documentCounts: { users: 1 },
    collections: {
      users: [
        {
          id: 'u1',
          userId: 'u1',
          displayName: 'Normal User',
          email: 'user@example.com',
          injectedBackdoorConfig: { bypassAllRules: true }, // Unauthorized field
        },
      ],
    },
  };

  const result = validateRestoreBackupPayload(injectedFieldsBackup);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('Unauthorized field "injectedBackdoorConfig" detected')));
});

test('R10. Admin authorization logic strictly restricts restore trigger to aadeshjaisi6@gmail.com and rejects others with 403', () => {
  function evaluateRestoreAuthorization(user?: { email?: string; emailVerified?: boolean } | null): {
    status: number;
    authorized: boolean;
    error?: string;
  } {
    if (!user) {
      return { status: 401, authorized: false, error: 'Authentication required.' };
    }
    const email = (user.email || '').trim().toLowerCase();
    if (email !== 'aadeshjaisi6@gmail.com' || !user.emailVerified) {
      return {
        status: 403,
        authorized: false,
        error: 'Access denied: Only aadeshjaisi6@gmail.com has administrator privileges to trigger database restoration.',
      };
    }
    return { status: 200, authorized: true };
  }

  // 1. sagarjaisi92@gmail.com MUST be rejected with HTTP 403
  const sagarUser = { email: 'sagarjaisi92@gmail.com', emailVerified: true };
  const resSagar = evaluateRestoreAuthorization(sagarUser);
  assert.equal(resSagar.status, 403);
  assert.equal(resSagar.authorized, false);

  // 2. Unverified aadeshjaisi6@gmail.com MUST be rejected with HTTP 403
  const unverifiedAdmin = { email: 'aadeshjaisi6@gmail.com', emailVerified: false };
  const resUnverified = evaluateRestoreAuthorization(unverifiedAdmin);
  assert.equal(resUnverified.status, 403);
  assert.equal(resUnverified.authorized, false);

  // 3. Random user MUST be rejected with HTTP 403
  const randomUser = { email: 'attacker@evil.com', emailVerified: true };
  const resRandom = evaluateRestoreAuthorization(randomUser);
  assert.equal(resRandom.status, 403);
  assert.equal(resRandom.authorized, false);

  // 4. Unauthenticated caller MUST be rejected with HTTP 401
  const resAnon = evaluateRestoreAuthorization(null);
  assert.equal(resAnon.status, 401);
  assert.equal(resAnon.authorized, false);

  // 5. Verified aadeshjaisi6@gmail.com MUST be accepted with HTTP 200
  const validAdmin = { email: 'aadeshjaisi6@gmail.com', emailVerified: true };
  const resAdmin = evaluateRestoreAuthorization(validAdmin);
  assert.equal(resAdmin.status, 200);
  assert.equal(resAdmin.authorized, true);
});
