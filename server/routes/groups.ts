import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomInt } from 'crypto';
import db from '../db/index.js';
import { requireNonGuest } from '../middleware/auth.js';
import { getUpcomingSqlCondition } from '../utils/movieNight.js';
import { isGroupMember, isGroupAdmin } from '../utils/permissions.js';
import { getBody, type AuthenticatedRequest } from '../types/index.js';

interface GroupRow {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  max_votes_per_user: number;
  sharing_enabled: number;
  invite_pin: string | null;
  member_count: number;
  created_by: number;
  created_by_name: string;
  created_at: string;
}

interface MovieNightRow {
  id: number;
  date: string;
  time: string;
  status: string;
}

interface MemberRow {
  id: number;
  username: string;
  avatar_url: string | null;
  is_local: number;
  role: string;
  joined_at: string;
}

const router = Router();

function generateRandomPin(): string {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

router.get('/', requireNonGuest, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const isAppAdmin = authReq.session.isAppAdmin;

  const groups = db
    .prepare(
      `
    SELECT g.*, 
           COUNT(DISTINCT gm.user_id) as member_count,
           u.username as created_by_name
    FROM groups g
    LEFT JOIN group_members gm ON g.id = gm.group_id
    LEFT JOIN users u ON g.created_by = u.id
    ${isAppAdmin ? '' : 'WHERE g.id IN (SELECT group_id FROM group_members WHERE user_id = ?)'}
    GROUP BY g.id
    ORDER BY g.name
  `
    )
    .all(...(isAppAdmin ? [] : [authReq.session.userId])) as GroupRow[];

  const result = groups.map((g) => {
    const upcomingNight = db
      .prepare(
        `
      SELECT id, date, time, status
      FROM movie_nights mn
      WHERE mn.group_id = ? AND mn.is_cancelled = 0 AND ${getUpcomingSqlCondition('mn')}
      ORDER BY mn.date ASC
      LIMIT 1
    `
      )
      .get(g.id) as MovieNightRow | undefined;

    return {
      id: g.id,
      name: g.name,
      description: g.description,
      imageUrl: g.image_url,
      maxVotesPerUser: g.max_votes_per_user,
      memberCount: g.member_count,
      createdBy: g.created_by_name,
      createdAt: g.created_at,
      upcomingNight: upcomingNight
        ? {
            id: upcomingNight.id,
            date: upcomingNight.date,
            time: upcomingNight.time,
            status: upcomingNight.status,
          }
        : null,
    };
  });

  res.json(result);
});

router.get('/:id', requireNonGuest, (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as GroupRow | undefined;
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  if (!authReq.session.isAppAdmin && !isGroupMember(authReq.session, id)) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const members = db
    .prepare(
      `
    SELECT u.id, u.username, u.avatar_url, u.is_local, gm.role, gm.joined_at
    FROM group_members gm
    JOIN users u ON gm.user_id = u.id
    WHERE gm.group_id = ?
    ORDER BY u.username
  `
    )
    .all(id) as MemberRow[];

  const isAdmin = isGroupAdmin(authReq.session, id);

  res.json({
    id: group.id,
    name: group.name,
    description: group.description,
    imageUrl: group.image_url,
    maxVotesPerUser: group.max_votes_per_user,
    sharingEnabled: group.sharing_enabled !== 0,
    hasInvitePin: !!group.invite_pin,
    invitePin: isAdmin ? group.invite_pin : undefined,
    createdAt: group.created_at,
    members: members.map((m) => ({
      id: m.id,
      username: m.username,
      avatarUrl: m.avatar_url,
      isLocal: m.is_local === 1,
      role: m.role,
      joinedAt: m.joined_at,
    })),
  });
});

router.post('/', requireNonGuest, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { name, description } = getBody<{ name?: string; description?: string }>(req);

  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }

  if (name.trim().length > 35) {
    res.status(400).json({ error: 'Name must be 35 characters or less' });
    return;
  }

  const pin = generateRandomPin();

  const result = db
    .prepare(
      `
    INSERT INTO groups (name, description, created_by, invite_pin)
    VALUES (?, ?, ?, ?)
  `
    )
    .run(name, description, authReq.session.userId, pin);

  db.prepare(
    `
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (?, ?, 'admin')
  `
  ).run(result.lastInsertRowid, authReq.session.userId);

  res.json({
    id: result.lastInsertRowid,
    name,
    description,
  });
});

router.post('/:id/members', requireNonGuest, (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;
  const { userIds } = getBody<{ userIds?: number[] }>(req);

  if (!Array.isArray(userIds) || userIds.length === 0) {
    res.status(400).json({ error: 'userIds array is required' });
    return;
  }

  if (!isGroupAdmin(authReq.session, id)) {
    res.status(403).json({ error: 'Only group admins can add members' });
    return;
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO group_members (group_id, user_id, role)
    VALUES (?, ?, 'member')
  `);

  for (const userId of userIds) {
    insert.run(id, userId);
  }

  res.json({ success: true });
});

router.delete('/:id/members/:userId', requireNonGuest, (req: Request, res: Response) => {
  const { id, userId } = req.params;
  const authReq = req as AuthenticatedRequest;

  const isSelf = parseInt(String(userId)) === authReq.session.userId;

  if (!isGroupAdmin(authReq.session, id) && !isSelf) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(id, userId);
  res.json({ success: true });
});

router.patch('/:id', requireNonGuest, (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;
  const { name, description, imageUrl, maxVotesPerUser, sharingEnabled, invitePin } = getBody<{
    name?: string;
    description?: string;
    imageUrl?: string;
    maxVotesPerUser?: number;
    sharingEnabled?: boolean;
    invitePin?: string;
  }>(req);

  if (!isGroupAdmin(authReq.session, id)) {
    res.status(403).json({ error: 'Only group admins can update the group' });
    return;
  }

  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }

  if (name.trim().length > 35) {
    res.status(400).json({ error: 'Name must be 35 characters or less' });
    return;
  }

  if (invitePin !== undefined && invitePin !== null && invitePin !== '') {
    if (!/^\d{6}$/.test(invitePin)) {
      res.status(400).json({ error: 'PIN must be exactly 6 digits' });
      return;
    }
  }

  const votes = maxVotesPerUser !== undefined ? Math.max(1, Math.min(10, maxVotesPerUser)) : null;
  const sharing = sharingEnabled !== undefined ? (sharingEnabled ? 1 : 0) : null;
  const pin = invitePin !== undefined ? invitePin || null : undefined;

  db.prepare(
    `
    UPDATE groups SET 
      name = ?, 
      description = ?, 
      image_url = ?
      ${votes !== null ? ', max_votes_per_user = ?' : ''}
      ${sharing !== null ? ', sharing_enabled = ?' : ''}
      ${pin !== undefined ? ', invite_pin = ?' : ''}
    WHERE id = ?
  `
  ).run(
    name.trim(),
    description || null,
    imageUrl || null,
    ...(votes !== null ? [votes] : []),
    ...(sharing !== null ? [sharing] : []),
    ...(pin !== undefined ? [pin] : []),
    id
  );
  res.json({ success: true });
});

router.delete('/:id', requireNonGuest, (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;

  if (!isGroupAdmin(authReq.session, id)) {
    res.status(403).json({ error: 'Only group admins can delete the group' });
    return;
  }

  const deleteGroup = db.transaction(() => {
    const movieNights = db.prepare('SELECT id FROM movie_nights WHERE group_id = ?').all(id) as {
      id: number;
    }[];
    const movieNightIds = movieNights.map((mn) => mn.id);

    if (movieNightIds.length > 0) {
      const placeholders = movieNightIds.map(() => '?').join(',');
      db.prepare(
        `DELETE FROM votes WHERE nomination_id IN (SELECT id FROM nominations WHERE movie_night_id IN (${placeholders}))`
      ).run(...movieNightIds);
      db.prepare(`DELETE FROM nominations WHERE movie_night_id IN (${placeholders})`).run(
        ...movieNightIds
      );
      db.prepare(`DELETE FROM attendance WHERE movie_night_id IN (${placeholders})`).run(
        ...movieNightIds
      );
      db.prepare(`DELETE FROM guest_invites WHERE movie_night_id IN (${placeholders})`).run(
        ...movieNightIds
      );
      db.prepare(`DELETE FROM movie_nights WHERE group_id = ?`).run(id);
    }

    db.prepare('DELETE FROM schedules WHERE group_id = ?').run(id);
    db.prepare('DELETE FROM group_members WHERE group_id = ?').run(id);
    db.prepare('DELETE FROM groups WHERE id = ?').run(id);
  });

  deleteGroup();
  res.json({ success: true });
});

export default router;
