import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';
import db from '../db/index.js';
import { requireAuth, requireNonGuest } from '../middleware/auth.js';
import { getProxiedImageUrl } from '../services/imageCache.js';
import { isGroupMember, isGroupAdmin } from '../utils/permissions.js';
import { logger } from '../services/logger.js';
import { getBody, type AuthenticatedRequest } from '../types/index.js';

interface InviteRow {
  id: number;
  token: string;
  movie_night_id: number;
  created_by: number;
  expires_at: string | null;
  created_at: string;
  group_id?: number;
  sharing_enabled?: number;
  created_by_name?: string;
}

interface MovieNightRow {
  id: number;
  group_id: number;
  date: string;
  time: string;
  status: string;
  is_cancelled: number;
  cancel_reason: string | null;
  sharing_enabled: number;
}

interface InviteValidateRow extends InviteRow {
  date: string;
  time: string;
  status: string;
  is_cancelled: number;
  cancel_reason: string | null;
  group_name: string;
  group_description: string | null;
  group_image_url: string | null;
  max_votes_per_user: number;
  invite_pin: string | null;
}

interface LocalUserRow {
  id: number;
  username: string;
  avatar_url: string | null;
}

interface NominationRow {
  id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  vote_count: number;
}

interface VoteTotalRow {
  total: number;
}

interface RateLimitEntry {
  failures: number;
  windowStart: number;
  lockedUntil?: number;
}

const router = Router();

const pinFailMap = new Map<string, RateLimitEntry>();
const PIN_FAIL_LIMIT = 5;
const PIN_LOCKOUT_WINDOW = 60000;

function checkPinRateLimit(ip: string): { allowed: boolean; remainingSeconds?: number } {
  const now = Date.now();
  const entry = pinFailMap.get(ip);

  if (!entry) return { allowed: true };

  if (entry.lockedUntil && now < entry.lockedUntil) {
    return { allowed: false, remainingSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
  }

  if (entry.lockedUntil && now >= entry.lockedUntil) {
    pinFailMap.delete(ip);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordPinFailure(ip: string): void {
  const now = Date.now();
  let entry = pinFailMap.get(ip);

  if (!entry || (entry.lockedUntil && now >= entry.lockedUntil)) {
    entry = { failures: 1, windowStart: now };
  } else if (now - entry.windowStart > PIN_LOCKOUT_WINDOW) {
    entry = { failures: 1, windowStart: now };
  } else {
    entry.failures++;
  }

  if (entry.failures >= PIN_FAIL_LIMIT) {
    entry.lockedUntil = now + PIN_LOCKOUT_WINDOW;
  }

  pinFailMap.set(ip, entry);
}

function clearPinFailures(ip: string): void {
  pinFailMap.delete(ip);
}

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || 'unknown';
  const check = checkPinRateLimit(ip);

  if (!check.allowed) {
    logger.warn(
      'invites',
      'Rate limit exceeded',
      { ip, remainingSeconds: check.remainingSeconds },
      req
    );
    res
      .status(429)
      .json({ error: `Too many attempts. Try again in ${check.remainingSeconds} seconds.` });
    return;
  }

  next();
}

setInterval(() => {
  const now = Date.now();
  pinFailMap.forEach((entry: RateLimitEntry, ip: string) => {
    if (entry.lockedUntil && now > entry.lockedUntil) pinFailMap.delete(ip);
  });
}, 300000);

const tokenValidateMap = new Map<string, { count: number; resetAt: number }>();
const TOKEN_VALIDATE_LIMIT = 20;
const TOKEN_VALIDATE_WINDOW = 60000;

function tokenValidateRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || 'unknown';
  const now = Date.now();

  if (!tokenValidateMap.has(ip)) {
    tokenValidateMap.set(ip, { count: 1, resetAt: now + TOKEN_VALIDATE_WINDOW });
    next();
    return;
  }

  const entry = tokenValidateMap.get(ip)!;
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + TOKEN_VALIDATE_WINDOW;
    next();
    return;
  }

  entry.count++;
  if (entry.count > TOKEN_VALIDATE_LIMIT) {
    logger.warn('invites', 'Token validation rate limit exceeded', { ip }, req);
    res.status(429).json({ error: 'Too many requests. Try again later.' });
    return;
  }

  next();
}

setInterval(() => {
  const now = Date.now();
  tokenValidateMap.forEach((entry: { count: number; resetAt: number }, ip: string) => {
    if (now > entry.resetAt) tokenValidateMap.delete(ip);
  });
}, 300000);

router.post('/create', requireNonGuest, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { movieNightId, expiresInHours } = getBody<{
    movieNightId?: number;
    expiresInHours?: number;
  }>(req);

  if (!movieNightId) {
    res.status(400).json({ error: 'movieNightId is required' });
    return;
  }

  const night = db
    .prepare(
      'SELECT mn.*, g.sharing_enabled FROM movie_nights mn JOIN groups g ON mn.group_id = g.id WHERE mn.id = ?'
    )
    .get(movieNightId) as (MovieNightRow & { sharing_enabled: number }) | undefined;
  if (!night) {
    res.status(404).json({ error: 'Movie night not found' });
    return;
  }

  if (!isGroupMember(authReq.session, night.group_id)) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  if (night.sharing_enabled === 0) {
    res.status(403).json({ error: 'Sharing is disabled for this group' });
    return;
  }

  const existingInvite = db
    .prepare(
      `
    SELECT * FROM guest_invites 
    WHERE movie_night_id = ? 
    AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY created_at DESC
    LIMIT 1
  `
    )
    .get(movieNightId) as InviteRow | undefined;

  if (existingInvite) {
    res.json({
      id: existingInvite.id,
      token: existingInvite.token,
      url: `/join/${existingInvite.token}`,
      expiresAt: existingInvite.expires_at,
    });
    return;
  }

  const token = nanoid(32);

  let expiresAt: string | null = null;
  if (expiresInHours) {
    const expires = new Date();
    expires.setHours(expires.getHours() + expiresInHours);
    expiresAt = expires.toISOString();
  }

  const result = db
    .prepare(
      `
    INSERT INTO guest_invites (token, movie_night_id, created_by, expires_at)
    VALUES (?, ?, ?, ?)
  `
    )
    .run(token, movieNightId, authReq.session.userId, expiresAt);

  res.json({
    id: result.lastInsertRowid,
    token,
    url: `/join/${token}`,
    expiresAt,
  });
});

router.post('/refresh/:id', requireNonGuest, (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;

  const invite = db
    .prepare(
      `
    SELECT gi.*, mn.group_id, g.sharing_enabled
    FROM guest_invites gi
    JOIN movie_nights mn ON gi.movie_night_id = mn.id
    JOIN groups g ON mn.group_id = g.id
    WHERE gi.id = ?
  `
    )
    .get(id) as (InviteRow & { group_id: number; sharing_enabled: number }) | undefined;

  if (!invite) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }

  if (
    !isGroupAdmin(authReq.session, invite.group_id) &&
    invite.created_by !== authReq.session.userId
  ) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  if (invite.sharing_enabled === 0) {
    res.status(403).json({ error: 'Sharing is disabled for this group' });
    return;
  }

  const newToken = nanoid(32);

  db.prepare('UPDATE guest_invites SET token = ? WHERE id = ?').run(newToken, id);

  res.json({
    id: invite.id,
    token: newToken,
    url: `/join/${newToken}`,
    expiresAt: invite.expires_at,
  });
});

router.get('/validate/:token', tokenValidateRateLimit, rateLimit, (req: Request, res: Response) => {
  const { token } = req.params;
  const pin = typeof req.query.pin === 'string' ? req.query.pin : undefined;

  const invite = db
    .prepare(
      `
    SELECT gi.*, mn.date, mn.time, mn.status, mn.is_cancelled, mn.cancel_reason, mn.group_id, g.name as group_name, g.description as group_description, g.image_url as group_image_url, g.max_votes_per_user, g.sharing_enabled, g.invite_pin
    FROM guest_invites gi
    JOIN movie_nights mn ON gi.movie_night_id = mn.id
    JOIN groups g ON mn.group_id = g.id
    WHERE gi.token = ?
  `
    )
    .get(token) as InviteValidateRow | undefined;

  if (invite && invite.sharing_enabled === 0) {
    res.status(403).json({ error: 'Sharing is disabled for this group' });
    return;
  }

  if (!invite) {
    res.status(404).json({ error: 'Invalid invite link' });
    return;
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    res.status(410).json({ error: 'Invite link has expired' });
    return;
  }

  const nightDateTime = new Date(`${invite.date}T${invite.time || '23:59'}:00`);
  if (nightDateTime < new Date()) {
    res.status(410).json({ error: 'This movie night has already passed' });
    return;
  }

  if (invite.status !== 'voting') {
    res.status(400).json({ error: 'Voting is closed for this movie night' });
    return;
  }

  if (invite.invite_pin) {
    if (!pin) {
      res.json({
        requiresPin: true,
        groupName: invite.group_name,
        groupImageUrl: invite.group_image_url,
      });
      return;
    }
    if (pin !== invite.invite_pin) {
      const ip = req.ip || 'unknown';
      recordPinFailure(ip);
      const tokenStr = typeof token === 'string' ? token : '';
      logger.warn(
        'invites',
        'Invalid PIN attempt',
        { token: tokenStr.substring(0, 8) + '...', groupName: invite.group_name },
        req
      );
      res.status(401).json({ error: 'Invalid PIN' });
      return;
    }
    clearPinFailures(req.ip || 'unknown');
  }

  const localUsers = db
    .prepare(
      `
    SELECT u.id, u.username, u.avatar_url 
    FROM users u
    JOIN group_members gm ON u.id = gm.user_id
    WHERE u.is_local = 1 AND gm.group_id = ?
  `
    )
    .all(invite.group_id) as LocalUserRow[];

  const maxVotes = invite.max_votes_per_user;
  const localUsersWithVotes = localUsers.map((u) => {
    const userTotalVotes = db
      .prepare(
        `
      SELECT COALESCE(SUM(v.vote_count), 0) as total
      FROM votes v
      JOIN nominations n ON v.nomination_id = n.id
      WHERE n.movie_night_id = ? AND v.user_id = ?
    `
      )
      .get(invite.movie_night_id, u.id) as VoteTotalRow;

    return {
      id: u.id,
      username: u.username,
      avatarUrl: u.avatar_url,
      votesRemaining: maxVotes - (userTotalVotes?.total || 0),
    };
  });

  const topNominations = db
    .prepare(
      `
    SELECT n.id, n.title, n.year, n.poster_url,
           COALESCE(SUM(v.vote_count), 0) as vote_count
    FROM nominations n
    LEFT JOIN votes v ON n.id = v.nomination_id
    WHERE n.movie_night_id = ?
    GROUP BY n.id
    ORDER BY vote_count DESC
    LIMIT 3
  `
    )
    .all(invite.movie_night_id) as NominationRow[];

  res.json({
    valid: true,
    movieNightId: invite.movie_night_id,
    date: invite.date,
    time: invite.time,
    groupName: invite.group_name,
    groupDescription: invite.group_description,
    groupImageUrl: invite.group_image_url,
    maxVotesPerUser: maxVotes,
    isCancelled: invite.is_cancelled === 1,
    cancelReason: invite.cancel_reason,
    localUsers: localUsersWithVotes,
    topNominations: topNominations.map((n) => ({
      id: n.id,
      title: n.title,
      year: n.year,
      posterUrl: n.poster_url ? getProxiedImageUrl(n.poster_url) : null,
      voteCount: n.vote_count,
    })),
  });
});

router.post('/local-join', rateLimit, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { token, userId } = getBody<{ token?: string; userId?: number }>(req);

  if (!token || !userId) {
    res.status(400).json({ error: 'token and userId are required' });
    return;
  }

  const invite = db
    .prepare(
      `
    SELECT gi.*, mn.group_id
    FROM guest_invites gi
    JOIN movie_nights mn ON gi.movie_night_id = mn.id
    WHERE gi.token = ?
  `
    )
    .get(token) as (InviteRow & { group_id: number }) | undefined;

  if (!invite) {
    res.status(404).json({ error: 'Invalid invite link' });
    return;
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    res.status(410).json({ error: 'Invite link has expired' });
    return;
  }

  const user = db
    .prepare(
      `
    SELECT u.id, u.username, u.avatar_url, u.is_local 
    FROM users u
    JOIN group_members gm ON u.id = gm.user_id
    WHERE u.id = ? AND u.is_local = 1 AND gm.group_id = ?
  `
    )
    .get(userId, invite.group_id) as (LocalUserRow & { is_local: number }) | undefined;

  if (!user) {
    res.status(403).json({ error: 'User is not a member of this group' });
    return;
  }

  authReq.session.userId = userId;
  authReq.session.isLocalInvite = true;
  authReq.session.localInviteMovieNightId = invite.movie_night_id;

  logger.info(
    'invites',
    'Local user joined via invite',
    { username: user.username, movieNightId: invite.movie_night_id },
    req
  );

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatar_url,
      isLocal: true,
      isLocalInvite: true,
      localInviteMovieNightId: invite.movie_night_id,
    },
    movieNightId: invite.movie_night_id,
  });
});

router.post('/plex-join', requireAuth, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { token } = getBody<{ token?: string }>(req);

  if (!token) {
    res.status(400).json({ error: 'token is required' });
    return;
  }

  const invite = db
    .prepare(
      `
    SELECT gi.*, mn.group_id
    FROM guest_invites gi
    JOIN movie_nights mn ON gi.movie_night_id = mn.id
    WHERE gi.token = ?
  `
    )
    .get(token) as (InviteRow & { group_id: number }) | undefined;

  if (!invite) {
    res.status(404).json({ error: 'Invalid invite link' });
    return;
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    res.status(410).json({ error: 'Invite link has expired' });
    return;
  }

  if (!isGroupMember(authReq.session, invite.group_id)) {
    db.prepare(
      `
      INSERT OR IGNORE INTO group_members (group_id, user_id, role)
      VALUES (?, ?, 'member')
    `
    ).run(invite.group_id, authReq.session.userId);
  }

  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(authReq.session.userId) as
    | { username: string }
    | undefined;
  logger.info(
    'invites',
    'Plex user joined via invite',
    { username: user?.username, movieNightId: invite.movie_night_id },
    req
  );

  res.json({
    success: true,
    movieNightId: invite.movie_night_id,
  });
});

router.get('/movie-night/:movieNightId', requireNonGuest, (req: Request, res: Response) => {
  const { movieNightId } = req.params;
  const authReq = req as AuthenticatedRequest;

  const night = db.prepare('SELECT group_id FROM movie_nights WHERE id = ?').get(movieNightId) as
    | { group_id: number }
    | undefined;
  if (!night) {
    res.status(404).json({ error: 'Movie night not found' });
    return;
  }

  if (!isGroupAdmin(authReq.session, night.group_id)) {
    res.status(403).json({ error: 'Only admins can view invites' });
    return;
  }

  const invites = db
    .prepare(
      `
    SELECT gi.*, u.username as created_by_name
    FROM guest_invites gi
    LEFT JOIN users u ON gi.created_by = u.id
    WHERE gi.movie_night_id = ?
    ORDER BY gi.created_at DESC
  `
    )
    .all(movieNightId) as (InviteRow & { created_by_name: string })[];

  res.json(
    invites.map((i) => ({
      id: i.id,
      token: i.token,
      url: `/join/${i.token}`,
      createdBy: i.created_by_name,
      expiresAt: i.expires_at,
      createdAt: i.created_at,
    }))
  );
});

router.delete('/:id', requireNonGuest, (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;

  const invite = db
    .prepare(
      `
    SELECT gi.*, mn.group_id
    FROM guest_invites gi
    JOIN movie_nights mn ON gi.movie_night_id = mn.id
    WHERE gi.id = ?
  `
    )
    .get(id) as (InviteRow & { group_id: number }) | undefined;

  if (!invite) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }

  const isCreator = invite.created_by === authReq.session.userId;

  if (!isGroupAdmin(authReq.session, invite.group_id) && !isCreator) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  db.prepare('DELETE FROM guest_invites WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
