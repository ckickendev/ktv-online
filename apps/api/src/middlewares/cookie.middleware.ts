import { Request, Response, NextFunction } from 'express';

export function cookieParserMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const cookieHeader = req.headers.cookie;
  const cookies: Record<string, string> = {};

  if (cookieHeader) {
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const [rawKey, ...rawVal] = part.trim().split('=');
      if (rawKey && rawVal.length > 0) {
        try {
          cookies[rawKey] = decodeURIComponent(rawVal.join('='));
        } catch {
          cookies[rawKey] = rawVal.join('=');
        }
      }
    }
  }

  req.cookies = cookies;
  next();
}
