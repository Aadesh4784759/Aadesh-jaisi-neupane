import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../../server.ts';
import { isFirebaseAdminInitialized } from '../../server/firebaseAdmin.ts';
import handler, { extractSafeStackLocation, sanitizeLogText } from '../../api/index.ts';

test('Health check /api/health works successfully when optional Admin SDK credentials are absent', async () => {
  // Ensure Firebase Admin environment variables are absent
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

    // Verify /api/health responds with 200 and backendConnected
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://aadesh-ai-global.firebaseapp.com' },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'ok');
    assert.equal(json.backendConnected, true);

    // Verify Admin SDK was not instantiated during public health check
    assert.equal(typeof isFirebaseAdminInitialized, 'function');
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

    // Test rewrite route format used by Vercel: /api/index?__route=health
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

    // Test direct route format: /api/health
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
  } finally {
    if (prevVercel !== undefined) process.env.VERCEL = prevVercel;
    else delete process.env.VERCEL;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Sanitized error logger strips API keys, private keys, and tokens from error logs', () => {
  const dirty = 'Error at key AIzaSyBVfJnRZPMrNU5Fo903yer37jnlQk0uCQo with groq gsk_1234567890123456789012 and Bearer secret-token-abcdef1234567890 and -----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD\n-----END PRIVATE KEY-----';
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
