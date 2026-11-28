import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { app } from '../../server.ts';
import {
  classifyFirebaseAdminError,
  isFirebaseAdminInitialized,
  isValidPemPrivateKey,
  resolveAdminCredentialsFromEnv,
  sanitizeAdminErrorMessage,
} from '../../server/firebaseAdmin.ts';
import handler, { extractSafeStackLocation, sanitizeLogText } from '../../api/index.ts';

const SYNTHETIC_PEM_KEY = [
  '-----BEGIN PRIVATE KEY-----',
  'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDummyTestKeyData1234567890',
  'DummyTestKeyLine2DummyTestKeyLine2DummyTestKeyLine2DummyTestKeyLine2DummyTest',
  '-----END PRIVATE KEY-----',
].join('\\n');

test('Health check /api/health works successfully when optional Admin SDK credentials are absent', async () => {
  const prevJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const prevEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const prevKey = process.env.FIREBASE_PRIVATE_KEY;

  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  delete process.env.FIREBASE_PRIVATE_KEY;

  process.env.AADESH_SKIP_SERVER_LISTEN = '1';

  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://aadesh-ai-global.firebaseapp.com' },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'ok');
    assert.equal(json.backendConnected, true);

    assert.equal(isFirebaseAdminInitialized(), false);
  } finally {
    if (prevJson !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = prevJson;
    if (prevEmail !== undefined) process.env.FIREBASE_CLIENT_EMAIL = prevEmail;
    if (prevKey !== undefined) process.env.FIREBASE_PRIVATE_KEY = prevKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Vercel entry-point handler (api/index.ts) processes /api/index?__route=health rewrite and returns HTTP 200', async () => {
  const prevVercel = process.env.VERCEL;
  process.env.VERCEL = '1';
  process.env.AADESH_SKIP_SERVER_LISTEN = '1';

  const server = http.createServer((req, res) => {
    void handler(req, res);
  });

  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const res = await fetch(`${baseUrl}/api/index?__route=health`, {
      headers: {
        Host: 'localhost',
        Origin: 'https://aadesh-ai-global.firebaseapp.com',
      },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.backendConnected, true);

    const directRes = await fetch(`${baseUrl}/api/health`, {
      headers: {
        Host: 'localhost',
        Origin: 'https://aadesh-ai-global.firebaseapp.com',
      },
    });
    assert.equal(directRes.status, 200);
    const directBody = await directRes.json();
    assert.equal(directBody.status, 'ok');
    assert.equal(directBody.backendConnected, true);

    assert.equal(isFirebaseAdminInitialized(), false);
  } finally {
    if (prevVercel !== undefined) process.env.VERCEL = prevVercel;
    else delete process.env.VERCEL;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('server/firebaseAdmin.ts avoids top-level static firebase-admin imports and jwks-rsa/jose loads cleanly in CJS and ESM', async () => {
  const adminSrc = fs.readFileSync(path.resolve(process.cwd(), 'server/firebaseAdmin.ts'), 'utf-8');
  assert.ok(
    !/^import\s+\{[^}]*\}\s+from\s+['"]firebase-admin\//m.test(adminSrc),
    'server/firebaseAdmin.ts must not have static value imports from firebase-admin/*'
  );
  assert.ok(adminSrc.includes("import('firebase-admin/app')"));
  assert.ok(adminSrc.includes("import('firebase-admin/auth')"));
  assert.ok(adminSrc.includes("import('firebase-admin/firestore')"));

  // Verify CJS require('jwks-rsa') + jose dual CJS/ESM resolution works cleanly
  const req = createRequire(import.meta.url);
  const jwksRsa = req('jwks-rsa');
  assert.equal(typeof jwksRsa, 'function');

  // Verify ESM dynamic import of firebase-admin/auth succeeds without ERR_REQUIRE_ESM
  const authMod = await import('firebase-admin/auth');
  assert.equal(typeof authMod.getAuth, 'function');
});

test('Firebase Admin credential validation prioritizes FIREBASE_SERVICE_ACCOUNT_JSON, ignores blank fallback, and rejects invalid keys cleanly', () => {
  const baseConfig = { projectId: 'aadesh-ai-global', firestoreDatabaseId: 'default' };

  // 1. Valid FIREBASE_SERVICE_ACCOUNT_JSON takes precedence even when FIREBASE_PRIVATE_KEY fallback is invalid
  const validJson = JSON.stringify({
    type: 'service_account',
    project_id: 'aadesh-ai-global',
    client_email: 'firebase-adminsdk-test@aadesh-ai-global.iam.gserviceaccount.com',
    private_key: SYNTHETIC_PEM_KEY.replace(/\\n/g, '\n'),
  });

  const resolvedJson = resolveAdminCredentialsFromEnv(baseConfig, {
    FIREBASE_SERVICE_ACCOUNT_JSON: validJson,
    FIREBASE_CLIENT_EMAIL: 'invalid',
    FIREBASE_PRIVATE_KEY: '00000000000000000000000000000000deadbeef',
  });
  assert.equal(resolvedJson.mode, 'service_account_json');
  assert.equal(resolvedJson.projectId, 'aadesh-ai-global');

  // 2. Invalid FIREBASE_SERVICE_ACCOUNT_JSON throws sanitized ADMIN_SDK_CONFIG_ERROR
  assert.throws(
    () =>
      resolveAdminCredentialsFromEnv(baseConfig, {
        FIREBASE_SERVICE_ACCOUNT_JSON: '{"not_valid_sa": "secret-value-12345"}',
      }),
    (err: any) => {
      assert.equal(err.code, 'ADMIN_SDK_CONFIG_ERROR');
      assert.ok(!err.message.includes('secret-value-12345'));
      const classified = classifyFirebaseAdminError(err);
      assert.equal(classified.status, 503);
      assert.equal(classified.code, 'ADMIN_SDK_CONFIG_ERROR');
      return true;
    }
  );

  // 3. Blank FIREBASE_PRIVATE_KEY fallback is ignored and falls back to ADC
  const resolvedBlank = resolveAdminCredentialsFromEnv(baseConfig, {
    FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-test@aadesh-ai-global.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: '   ',
  });
  assert.equal(resolvedBlank.mode, 'adc');

  // 4. Non-PEM FIREBASE_PRIVATE_KEY (e.g., 40-char Key ID) throws sanitized ADMIN_SDK_CONFIG_ERROR without echoing value
  const fakeKeyId = '00000000000000000000000000000000deadbeef';
  assert.equal(isValidPemPrivateKey(fakeKeyId), false);
  assert.throws(
    () =>
      resolveAdminCredentialsFromEnv(baseConfig, {
        FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-test@aadesh-ai-global.iam.gserviceaccount.com',
        FIREBASE_PRIVATE_KEY: fakeKeyId,
      }),
    (err: any) => {
      assert.equal(err.code, 'ADMIN_SDK_CONFIG_ERROR');
      assert.ok(!err.message.includes(fakeKeyId));
      const classified = classifyFirebaseAdminError(err);
      assert.equal(classified.status, 503);
      assert.equal(classified.code, 'ADMIN_SDK_CONFIG_ERROR');
      return true;
    }
  );

  // 5. Valid individual FIREBASE_CLIENT_EMAIL + escaped PEM FIREBASE_PRIVATE_KEY succeeds
  const resolvedIndividual = resolveAdminCredentialsFromEnv(baseConfig, {
    FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-test@aadesh-ai-global.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: SYNTHETIC_PEM_KEY,
  });
  assert.equal(resolvedIndividual.mode, 'service_account_env');
  if (resolvedIndividual.mode === 'service_account_env') {
    assert.ok(resolvedIndividual.privateKey.includes('\n'));
  }

  // 6. Sanitizer strips any private key blocks from error messages
  const dirtyAdminErr = `Failed parsing "private_key":"secret-pem" and -----BEGIN PRIVATE KEY-----\nSECRET_BYTES_123\n-----END PRIVATE KEY-----`;
  const cleanAdminErr = sanitizeAdminErrorMessage(dirtyAdminErr);
  assert.ok(!cleanAdminErr.includes('SECRET_BYTES_123'));
  assert.ok(!cleanAdminErr.includes('secret-pem'));
  assert.ok(cleanAdminErr.includes('[REDACTED_PRIVATE_KEY]'));
});

test('Sanitized error logger strips API keys, private keys, and tokens from error logs', () => {
  const dirty =
    'Error at key AIzaSyBVfJnRZPMrNU5Fo903yer37jnlQk0uCQo with groq gsk_1234567890123456789012 and Bearer secret-token-abcdef1234567890 and -----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD\n-----END PRIVATE KEY-----';
  const clean = sanitizeLogText(dirty);

  assert.ok(!clean.includes('AIzaSyBVfJnRZPMrNU5Fo903yer37jnlQk0uCQo'));
  assert.ok(!clean.includes('gsk_1234567890123456789012'));
  assert.ok(!clean.includes('secret-token-abcdef1234567890'));
  assert.ok(!clean.includes('MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD'));
  assert.ok(clean.includes('[REDACTED_GEMINI_KEY]'));
  assert.ok(clean.includes('[REDACTED_GROQ_KEY]'));
  assert.ok(clean.includes('[REDACTED_PRIVATE_KEY]'));

  const stack = `Error: Something failed\n    at /app/applet/api/index.ts:45:10\n    at /app/applet/node_modules/express/lib/router/layer.js:95:5`;
  const location = extractSafeStackLocation(stack);
  assert.ok(location.includes('api/index.ts'));
  assert.ok(!location.includes('node_modules'));
});
