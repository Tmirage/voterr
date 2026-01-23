import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db/index.js';
import {
  isMovieNightArchived,
  getUpcomingSqlCondition,
  getArchivedSqlCondition,
} from '../utils/movieNight.js';
import { getNextDateForRecurrence } from '../utils/date.js';
import { requireAuth, requireNonGuest, requireInviteMovieNight } from '../middleware/auth.js';
import { isGroupMember, getPermissions } from '../utils/permissions.js';
import { getBody, type AuthenticatedRequest } from '../types/index.js';

interface ScheduleRow {
  id: number;
  group_id: number;
  name: string;
  day_of_week: number;
  time: string;
  recurrence_type: string;
  advance_count: number;
  created_by: number;
  created_by_name: string;
  created_at: string;
}

interface MovieNightRow {
  id: number;
  group_id: number;
  schedule_id: number | null;
  schedule_name: string | null;
  date: string;
  time: string;
  host_id: number | null;
  host_name: string | null;
  winning_movie_id: number | null;
  winning_movie_title: string | null;
  status: string;
  is_cancelled: number;
  cancel_reason: string | null;
  nomination_count: number;
  group_name?: string;
  group_description?: string;
  group_image_url?: string;
  sharing_enabled?: number;
}

interface AttendanceRow {
  user_id: number;
  username: string;
  avatar_url: string | null;
  status: string;
}

interface MemberRow {
  id: number;
  username: string;
  avatar_url: string | null;
  role: string;
}

interface CountRow {
  count: number;
}

const router = Router();

router.get('/group/:groupId', requireNonGuest, (req: Request, res: Response) => {
  const { groupId } = req.params;
  const authReq = req as AuthenticatedRequest;

  if (!isGroupMember(authReq.session, groupId)) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const schedules = db
    .prepare(
      `
    SELECT s.*, u.username as created_by_name
    FROM schedules s
    LEFT JOIN users u ON s.created_by = u.id
    WHERE s.group_id = ?
    ORDER BY s.day_of_week, s.time
  `
    )
    .all(groupId) as ScheduleRow[];

  res.json(
    schedules.map((s) => ({
      id: s.id,
      groupId: s.group_id,
      name: s.name,
      dayOfWeek: s.day_of_week,
      time: s.time,
      recurrenceType: s.recurrence_type,
      advanceCount: s.advance_count,
      createdBy: s.created_by_name,
      createdAt: s.created_at,
    }))
  );
});

router.post('/', requireNonGuest, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { groupId, name, dayOfWeek, time, recurrenceType, advanceCount, fixedDate } = getBody<{
    groupId?: number;
    name?: string;
    dayOfWeek?: number;
    time?: string;
    recurrenceType?: string;
    advanceCount?: number;
    fixedDate?: string;
  }>(req);

  const validRecurrence = ['weekly', 'biweekly', 'monthly', 'none'].includes(recurrenceType || '')
    ? recurrenceType
    : 'weekly';

  if (!groupId || !name) {
    res.status(400).json({ error: 'groupId and name are required' });
    return;
  }

  if (validRecurrence === 'none' && !fixedDate) {
    res.status(400).json({ error: 'fixedDate is required for one-time events' });
    return;
  }

  if (validRecurrence !== 'none' && dayOfWeek === undefined) {
    res.status(400).json({ error: 'dayOfWeek is required for recurring events' });
    return;
  }

  if (!isGroupMember(authReq.session, groupId)) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const count = Math.max(1, Math.min(advanceCount || 1, 10));
  const effectiveDayOfWeek =
    validRecurrence === 'none' ? new Date(fixedDate!).getDay() : dayOfWeek!;

  const result = db
    .prepare(
      `
    INSERT INTO schedules (group_id, name, day_of_week, time, recurrence_type, advance_count, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      groupId,
      name,
      effectiveDayOfWeek,
      time || '20:00',
      validRecurrence,
      count,
      authReq.session.userId
    );

  if (validRecurrence === 'none') {
    db.prepare(
      `
      INSERT INTO movie_nights (group_id, schedule_id, date, time, status)
      VALUES (?, ?, ?, ?, 'voting')
    `
    ).run(groupId, result.lastInsertRowid, fixedDate, time || '20:00');
  } else {
    for (let i = 0; i < count; i++) {
      const nextDate = getNextDateForRecurrence(dayOfWeek!, validRecurrence!, i);
      db.prepare(
        `
        INSERT INTO movie_nights (group_id, schedule_id, date, time, status)
        VALUES (?, ?, ?, ?, 'voting')
      `
      ).run(groupId, result.lastInsertRowid, nextDate, time || '20:00');
    }
  }

  res.json({
    id: result.lastInsertRowid,
    groupId,
    name,
    dayOfWeek,
    time: time || '20:00',
    recurrenceType: validRecurrence,
    advanceCount: count,
  });
});

router.patch('/:id', requireNonGuest, (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;
  const { name, dayOfWeek, time, recurrenceType, advanceCount } = getBody<{
    name?: string;
    dayOfWeek?: number;
    time?: string;
    recurrenceType?: string;
    advanceCount?: number;
  }>(req);

  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as
    | ScheduleRow
    | undefined;
  if (!schedule) {
    res.status(404).json({ error: 'Schedule not found' });
    return;
  }

  if (!isGroupMember(authReq.session, schedule.group_id)) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const newName = name !== undefined ? name : schedule.name;
  const newDayOfWeek = dayOfWeek !== undefined ? Number(dayOfWeek) : schedule.day_of_week;
  const newTime = time !== undefined ? time : schedule.time;
  const newRecurrenceType =
    recurrenceType !== undefined ? recurrenceType : schedule.recurrence_type;
  const newAdvanceCount =
    advanceCount !== undefined ? Math.max(1, Math.min(advanceCount, 10)) : schedule.advance_count;

  db.prepare(
    `
    UPDATE schedules 
    SET name = ?, day_of_week = ?, time = ?, recurrence_type = ?, advance_count = ?, updated_at = datetime('now')
    WHERE id = ?
  `
  ).run(newName, newDayOfWeek, newTime, newRecurrenceType, newAdvanceCount, id);

  const validDates: string[] = [];
  if (newRecurrenceType !== 'none') {
    for (let i = 0; i < newAdvanceCount; i++) {
      const nextDate = getNextDateForRecurrence(newDayOfWeek, newRecurrenceType, i);
      validDates.push(nextDate);
      const existing = db
        .prepare('SELECT id FROM movie_nights WHERE schedule_id = ? AND date = ?')
        .get(id, nextDate);
      if (!existing) {
        db.prepare(
          `
          INSERT INTO movie_nights (group_id, schedule_id, date, time, status)
          VALUES (?, ?, ?, ?, 'voting')
        `
        ).run(schedule.group_id, id, nextDate, newTime);
      }
    }
  }

  db.prepare(
    `
    DELETE FROM movie_nights 
    WHERE schedule_id = ? 
    AND date >= date('now') 
    AND status = 'voting'
    AND date NOT IN (${validDates.map(() => '?').join(',') || "'-'"})
  `
  ).run(id, ...validDates);

  res.json({
    id: parseInt(String(id)),
    groupId: schedule.group_id,
    name: newName,
    dayOfWeek: newDayOfWeek,
    time: newTime,
    recurrenceType: newRecurrenceType,
    advanceCount: newAdvanceCount,
  });
});

router.delete('/:id', requireNonGuest, (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;

  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as
    | ScheduleRow
    | undefined;
  if (!schedule) {
    res.status(404).json({ error: 'Schedule not found' });
    return;
  }

  if (!isGroupMember(authReq.session, schedule.group_id)) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
  res.json({ success: true });
});

router.get('/movie-nights/group/:groupId', requireNonGuest, (req: Request, res: Response) => {
  const { groupId } = req.params;
  const authReq = req as AuthenticatedRequest;

  if (!isGroupMember(authReq.session, groupId)) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const nights = db
    .prepare(
      `
    SELECT mn.*, 
           s.name as schedule_name,
           u.username as host_name,
           n.title as winning_movie_title,
           (SELECT COUNT(*) FROM nominations WHERE movie_night_id = mn.id) as nomination_count
    FROM movie_nights mn
    LEFT JOIN schedules s ON mn.schedule_id = s.id
    LEFT JOIN users u ON mn.host_id = u.id
    LEFT JOIN nominations n ON mn.winning_movie_id = n.id
    WHERE mn.group_id = ? AND ${getUpcomingSqlCondition('mn')}
    ORDER BY mn.date ASC
    LIMIT 50
  `
    )
    .all(groupId) as MovieNightRow[];

  res.json(
    nights.map((n) => ({
      id: n.id,
      groupId: n.group_id,
      scheduleId: n.schedule_id,
      scheduleName: n.schedule_name,
      date: n.date,
      time: n.time,
      hostId: n.host_id,
      hostName: n.host_name,
      winningMovieId: n.winning_movie_id,
      winningMovieTitle: n.winning_movie_title,
      status: n.status,
      isCancelled: n.is_cancelled === 1,
      cancelReason: n.cancel_reason,
      nominationCount: n.nomination_count,
    }))
  );
});

router.get(
  '/movie-nights/group/:groupId/history',
  requireNonGuest,
  (req: Request, res: Response) => {
    const { groupId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const pageParam = req.query.page;
    const page = typeof pageParam === 'string' ? parseInt(pageParam) || 0 : 0;
    const limit = 5;
    const offset = page * limit;

    if (!isGroupMember(authReq.session, groupId)) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    const totalCount = db
      .prepare(
        `
    SELECT COUNT(*) as count FROM movie_nights mn
    WHERE mn.group_id = ? AND ${getArchivedSqlCondition('mn')}
  `
      )
      .get(groupId) as CountRow;

    const nights = db
      .prepare(
        `
    SELECT mn.*, 
           s.name as schedule_name,
           u.username as host_name,
           n.title as winning_movie_title,
           (SELECT COUNT(*) FROM nominations WHERE movie_night_id = mn.id) as nomination_count
    FROM movie_nights mn
    LEFT JOIN schedules s ON mn.schedule_id = s.id
    LEFT JOIN users u ON mn.host_id = u.id
    LEFT JOIN nominations n ON mn.winning_movie_id = n.id
    WHERE mn.group_id = ? AND ${getArchivedSqlCondition('mn')}
    ORDER BY mn.date DESC
    LIMIT ? OFFSET ?
  `
      )
      .all(groupId, limit, offset) as MovieNightRow[];

    res.json({
      nights: nights.map((n) => ({
        id: n.id,
        groupId: n.group_id,
        scheduleId: n.schedule_id,
        scheduleName: n.schedule_name,
        date: n.date,
        time: n.time,
        hostId: n.host_id,
        hostName: n.host_name,
        winningMovieId: n.winning_movie_id,
        winningMovieTitle: n.winning_movie_title,
        status: n.status,
        isCancelled: n.is_cancelled === 1,
        cancelReason: n.cancel_reason,
        nominationCount: n.nomination_count,
      })),
      hasMore: offset + nights.length < totalCount.count,
      total: totalCount.count,
    });
  }
);

router.get('/movie-nights/:id', requireInviteMovieNight, (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;

  const night = db
    .prepare(
      `
    SELECT mn.*, 
           s.name as schedule_name,
           u.username as host_name,
           g.name as group_name,
           g.description as group_description,
           g.image_url as group_image_url,
           g.sharing_enabled
    FROM movie_nights mn
    LEFT JOIN schedules s ON mn.schedule_id = s.id
    LEFT JOIN users u ON mn.host_id = u.id
    LEFT JOIN groups g ON mn.group_id = g.id
    WHERE mn.id = ?
  `
    )
    .get(id) as MovieNightRow | undefined;

  if (!night) {
    res.status(404).json({ error: 'Movie night not found' });
    return;
  }

  if (!isGroupMember(authReq.session, night.group_id)) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const attendance = db
    .prepare(
      `
    SELECT a.*, u.username, u.avatar_url
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE a.movie_night_id = ?
  `
    )
    .all(id) as AttendanceRow[];

  const members = db
    .prepare(
      `
    SELECT u.id, u.username, u.avatar_url, gm.role
    FROM group_members gm
    JOIN users u ON gm.user_id = u.id
    WHERE gm.group_id = ?
  `
    )
    .all(night.group_id) as MemberRow[];

  const isArchived = isMovieNightArchived(night.date, night.time);
  const permissions = getPermissions(authReq.session, night.group_id, night);

  res.json({
    id: night.id,
    groupId: night.group_id,
    groupName: night.group_name,
    groupDescription: night.group_description,
    groupImageUrl: night.group_image_url,
    scheduleId: night.schedule_id,
    scheduleName: night.schedule_name,
    date: night.date,
    time: night.time,
    hostId: night.host_id,
    hostName: night.host_name,
    winningMovieId: night.winning_movie_id,
    status: night.status,
    isArchived,
    isCancelled: night.is_cancelled === 1,
    cancelReason: night.cancel_reason,
    sharingEnabled: night.sharing_enabled !== 0,
    canManage: permissions.canManage,
    canChangeHost: permissions.canChangeHost,
    canCancel: permissions.canCancel,
    attendance: attendance.map((a) => ({
      userId: a.user_id,
      username: a.username,
      avatarUrl: a.avatar_url,
      status: a.status,
    })),
    members: members.map((m) => ({
      userId: m.id,
      username: m.username,
      avatarUrl: m.avatar_url,
    })),
  });
});

router.patch('/movie-nights/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;
  const { hostId, isCancelled, cancelReason } = getBody<{
    hostId?: number;
    isCancelled?: boolean;
    cancelReason?: string;
  }>(req);

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(id) as
    | MovieNightRow
    | undefined;
  if (!night) {
    res.status(404).json({ error: 'Movie night not found' });
    return;
  }

  const permissions = getPermissions(authReq.session, night.group_id, night);

  if (hostId !== undefined) {
    if (!permissions.canChangeHost) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    db.prepare('UPDATE movie_nights SET host_id = ? WHERE id = ?').run(hostId, id);
  }

  if (isCancelled !== undefined) {
    if (!permissions.canCancel) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    db.prepare(
      `
      UPDATE movie_nights SET is_cancelled = ?, cancel_reason = ? WHERE id = ?
    `
    ).run(isCancelled ? 1 : 0, cancelReason || null, id);
  }

  res.json({ success: true });
});

router.post(
  '/movie-nights/:id/attendance',
  requireInviteMovieNight,
  (req: Request, res: Response) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { status } = getBody<{ status?: string }>(req);

    if (!status || !['attending', 'absent', 'pending'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(id) as
      | MovieNightRow
      | undefined;
    if (!night) {
      res.status(404).json({ error: 'Movie night not found' });
      return;
    }

    db.prepare(
      `
    INSERT INTO attendance (movie_night_id, user_id, status)
    VALUES (?, ?, ?)
    ON CONFLICT(movie_night_id, user_id) DO UPDATE SET status = ?, updated_at = datetime('now')
  `
    ).run(id, authReq.session.userId, status, status);

    res.json({ success: true });
  }
);

router.post('/movie-nights/:id/attendance/:userId', requireAuth, (req: Request, res: Response) => {
  const { id, userId } = req.params;
  const authReq = req as AuthenticatedRequest;
  const { status } = getBody<{ status?: string }>(req);

  if (!status || !['attending', 'absent', 'pending'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(id) as
    | MovieNightRow
    | undefined;
  if (!night) {
    res.status(404).json({ error: 'Movie night not found' });
    return;
  }

  const permissions = getPermissions(authReq.session, night.group_id);
  if (!permissions.canManage) {
    res.status(403).json({ error: 'Only admins can set attendance for other users' });
    return;
  }

  const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!targetUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  db.prepare(
    `
    INSERT INTO attendance (movie_night_id, user_id, status)
    VALUES (?, ?, ?)
    ON CONFLICT(movie_night_id, user_id) DO UPDATE SET status = ?, updated_at = datetime('now')
  `
  ).run(id, userId, status, status);

  res.json({ success: true });
});

export default router;
