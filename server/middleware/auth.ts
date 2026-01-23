import type { Request, Response, NextFunction } from 'express';
import { isAppAdmin } from '../utils/permissions.js';
import { isSetupComplete } from '../services/settings.js';
import { getBody, type AuthenticatedRequest } from '../types/index.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!isAppAdmin(authReq.session)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function requireAdminOrSetup(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!isSetupComplete() && authReq.session.setupPlexToken) {
    next();
    return;
  }
  if (!authReq.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!isAppAdmin(authReq.session)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function requireNonGuest(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (authReq.session.isLocalInvite) {
    res.status(403).json({ error: 'Access limited to your invited movie night' });
    return;
  }
  next();
}

export function requireNonGuestOrInvite(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

export function requireInviteMovieNight(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!authReq.session.isLocalInvite) {
    next();
    return;
  }
  const body = getBody<{ movieNightId?: string }>(req);
  const paramId = typeof req.params.id === 'string' ? req.params.id : '';
  const paramMovieNightId =
    typeof req.params.movieNightId === 'string' ? req.params.movieNightId : '';
  const movieNightId = parseInt(paramId || paramMovieNightId || body?.movieNightId || '');
  if (movieNightId && movieNightId !== authReq.session.localInviteMovieNightId) {
    res.status(403).json({ error: 'Access limited to your invited movie night' });
    return;
  }
  next();
}
