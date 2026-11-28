import type { IncomingMessage, ServerResponse } from 'http';
import type { Request, Response } from 'express';

// Helper to sanitize error messages so no keys, tokens, or secrets are ever exposed
export function sanitizeLogText(text: unknown): string {
  const str = String(text ?? '');
  return str
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/gsk_[a-zA-Z0-9]{20,}/g, '[REDACTED_GROQ_KEY]')
    .replace(/sk-or-[a-zA-Z0-9-]{20,}/g, '[REDACTED_OPENROUTER_KEY]')
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/bearer\s+[a-zA-Z0-9_.-]{20,}/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/"private_key"\s*:\s*"[^"]+"/g, '"private_key": "[REDACTED]"')
    .replace(/\\n/g, ' ')
    .trim();
}

export function extractSafeStackLocation(stack?: string): string {
  if (!stack) return 'unknown';
  const lines = stack.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && !line.includes('node_modules') && !line.includes('node:internal')) {
      return sanitizeLogText(line);
    }
  }
  return sanitizeLogText(lines[1] || 'unknown');
}

let appInstance: any = null;
let moduleInitError: {
  name: string;
  message: string;
  stackLocation: string;
} | null = null;

export async function getOrLoadApp(): Promise<any> {
  if (appInstance) return appInstance;
  if (moduleInitError) {
    const err = new Error(moduleInitError.message);
    err.name = moduleInitError.name;
    throw err;
  }

  try {
    let mod: any;
    try {
      mod = await import('../server.js');
    } catch {
      // Fallback for direct TypeScript or alternate bundling layouts
      mod = await import('../server.ts');
    }
    appInstance = mod.default || mod.app || mod;
    return appInstance;
  } catch (err: any) {
    const errorName = err?.name || 'InitializationError';
    const safeMessage = sanitizeLogText(err?.message || err || 'Unknown module initialization error');
    const stackLocation = extractSafeStackLocation(err?.stack);

    moduleInitError = {
      name: errorName,
      message: safeMessage,
      stackLocation,
    };

    console.error(
      JSON.stringify({
        event: 'SERVERLESS_MODULE_INIT_FAILED',
        errorName,
        message: safeMessage,
        stackLocation,
        timestamp: new Date().toISOString(),
      })
    );
    throw err;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rawUrl = req.url || '/';
  let safeRoute = rawUrl;
  try {
    const parsedUrl = new URL(rawUrl, 'http://localhost');
    if (parsedUrl.searchParams.has('__route')) {
      const route = (parsedUrl.searchParams.get('__route') || '').replace(/^\/+/, '');
      parsedUrl.searchParams.delete('__route');
      const remainingQuery = parsedUrl.searchParams.toString();
      if (route && route !== 'index') {
        req.url = `/api/${route}${remainingQuery ? `?${remainingQuery}` : ''}`;
      } else {
        req.url = `/api${remainingQuery ? `?${remainingQuery}` : ''}`;
      }
    } else if (parsedUrl.pathname === '/api/index') {
      const remainingQuery = parsedUrl.searchParams.toString();
      req.url = `/api${remainingQuery ? `?${remainingQuery}` : ''}`;
    }
    safeRoute = req.url || rawUrl;
  } catch {
    // Keep original req.url
  }

  // Pre-parsed body flag for express.json()
  const reqAny = req as IncomingMessage & { body?: unknown; _body?: boolean };
  if (reqAny.body !== undefined && !reqAny._body) {
    reqAny._body = true;
  }

  try {
    const expressApp = await getOrLoadApp();

    return await new Promise<void>((resolve, reject) => {
      expressApp(req as Request, res as Response, (err?: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
      res.on('finish', () => resolve());
      res.on('close', () => resolve());
    });
  } catch (err: any) {
    const errorName = err?.name || 'HandlerExecutionError';
    const safeMessage = sanitizeLogText(err?.message || err || 'Internal Server Error');
    const stackLocation = extractSafeStackLocation(err?.stack);

    console.error(
      JSON.stringify({
        event: 'SERVERLESS_REQUEST_ERROR',
        errorName,
        message: safeMessage,
        stackLocation,
        route: safeRoute,
        method: req.method || 'GET',
        timestamp: new Date().toISOString(),
      })
    );

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: false,
          status: 'error',
          error: safeMessage,
          code: errorName,
          route: safeRoute,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }
}
