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
  if (!req.session.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function requireNonGuest(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  // Local users via invite are blocked from admin-only routes
  if (req.session.isLocalInvite) {
    return res.status(403).json({ error: 'Access limited to your invited movie night' });
  }
  next();
}

export function requireNonGuestOrInvite(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  // Local invite users can access these routes (for nominating)
  next();
}

export function requireInviteMovieNight(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  // Full users can access any movie night
  if (!req.session.isLocalInvite) {
    return next();
  }
  // Local invite users can only access their specific movie night
  const movieNightId = parseInt(req.params.id || req.params.movieNightId || req.body.movieNightId);
  if (movieNightId && movieNightId !== req.session.localInviteMovieNightId) {
    return res.status(403).json({ error: 'Access limited to your invited movie night' });
  }
  next();
}

