import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getBody, type AuthenticatedRequest } from '../types/index.js';

export function generateCsrfToken(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.session.csrfToken) {
    authReq.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return authReq.session.csrfToken;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const authReq = req as AuthenticatedRequest;
  const body = getBody<Record<string, unknown>>(req);
  const token = req.headers['x-csrf-token'] || body?._csrf;

  if (!token || token !== authReq.session.csrfToken) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next();
}
