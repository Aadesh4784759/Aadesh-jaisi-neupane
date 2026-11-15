import type { IncomingMessage, ServerResponse } from 'http';
import type { Request, Response } from 'express';
import app from '../server';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const rawUrl = req.url || '/';
  try {
    const parsedUrl = new URL(rawUrl, 'http://localhost');
    if (parsedUrl.searchParams.has('__route')) {
      const route = (parsedUrl.searchParams.get('__route') || '').replace(/^\/+/, '');
      parsedUrl.searchParams.delete('__route');
      const remainingQuery = parsedUrl.searchParams.toString();
      req.url = `/api${route ? `/${route}` : ''}${remainingQuery ? `?${remainingQuery}` : ''}`;
    } else if (parsedUrl.pathname === '/api/index') {
      const remainingQuery = parsedUrl.searchParams.toString();
      req.url = `/api${remainingQuery ? `?${remainingQuery}` : ''}`;
    }
  } catch {
    // Keep original req.url if URL parsing fails
  }

  return app(req as Request, res as Response);
}
