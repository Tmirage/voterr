import { isAppAdmin, UserRole, getUserRole } from '../utils/permissions.js';

export function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!isAppAdmin(req.session)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function requireMember(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const role = getUserRole(req.session);
  if (role === UserRole.GUEST) {
    return res.status(403).json({ error: 'Plex login required' });
  }
  next();
}

export function requireNonGuest(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.session.isLocalInvite) {
    return res.status(403).json({ error: 'Access limited to your invited movie night' });
  }
  next();
}

export function requireNonGuestOrInvite(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function requireInviteMovieNight(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!req.session.isLocalInvite) {
    return next();
  }
  const movieNightId = parseInt(req.params.id || req.params.movieNightId || req.body.movieNightId);
  if (movieNightId && movieNightId !== req.session.localInviteMovieNightId) {
    return res.status(403).json({ error: 'Access limited to your invited movie night' });
  }
  next();
}

