import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../../server.ts';

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

    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://aadesh-ai-global.firebaseapp.com' },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'ok');
    assert.equal(json.backendConnected, true);
  } finally {
    if (prevJson !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = prevJson;
    if (prevEmail !== undefined) process.env.FIREBASE_CLIENT_EMAIL = prevEmail;
    if (prevKey !== undefined) process.env.FIREBASE_PRIVATE_KEY = prevKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
