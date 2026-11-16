import type { IncomingMessage, ServerResponse } from 'http';
import type { Request, Response } from 'express';
import app from '../server.js';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const rawUrl = req.url || '/';
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
  } catch {
    // Keep original req.url if URL parsing fails
  }

  // If Vercel runtime pre-parsed req.body, mark _body so express.json() skips re-reading an ended stream
  const reqAny = req as IncomingMessage & { body?: unknown; _body?: boolean };
  if (reqAny.body !== undefined && !reqAny._body) {
    reqAny._body = true;
  }

  return app(req as Request, res as Response);
}
