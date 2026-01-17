import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireNonGuest, requireInviteMovieNight } from '../middleware/auth.js';

const router = Router();

router.get('/group/:groupId', requireNonGuest, (req, res) => {
  const { groupId } = req.params;

  const isMember = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, req.session.userId);

  if (!isMember) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const schedules = db.prepare(`
    SELECT s.*, u.username as created_by_name
    FROM schedules s
    LEFT JOIN users u ON s.created_by = u.id
    WHERE s.group_id = ?
    ORDER BY s.day_of_week, s.time
  `).all(groupId);

  res.json(schedules.map(s => ({
    id: s.id,
    groupId: s.group_id,
    name: s.name,
    dayOfWeek: s.day_of_week,
    time: s.time,
    recurrenceType: s.recurrence_type || 'weekly',
    advanceCount: s.advance_count || 1,
    createdBy: s.created_by_name,
    createdAt: s.created_at
  })));
});

router.post('/', requireNonGuest, (req, res) => {
  const { groupId, name, dayOfWeek, time, recurrenceType, advanceCount, fixedDate } = req.body;

  const validRecurrence = ['weekly', 'biweekly', 'monthly', 'none'].includes(recurrenceType) ? recurrenceType : 'weekly';

  if (!groupId || !name) {
    return res.status(400).json({ error: 'groupId and name are required' });
  }

  if (validRecurrence === 'none' && !fixedDate) {
    return res.status(400).json({ error: 'fixedDate is required for one-time events' });
  }

  if (validRecurrence !== 'none' && dayOfWeek === undefined) {
    return res.status(400).json({ error: 'dayOfWeek is required for recurring events' });
  }

  const isMember = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, req.session.userId);

  if (!isMember) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const count = Math.max(1, Math.min(advanceCount || 1, 10));
  const effectiveDayOfWeek = validRecurrence === 'none' ? new Date(fixedDate).getDay() : dayOfWeek;

  const result = db.prepare(`
    INSERT INTO schedules (group_id, name, day_of_week, time, recurrence_type, advance_count, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(groupId, name, effectiveDayOfWeek, time || '20:00', validRecurrence, count, req.session.userId);

  if (validRecurrence === 'none') {
    db.prepare(`
      INSERT INTO movie_nights (group_id, schedule_id, date, time, status)
      VALUES (?, ?, ?, ?, 'voting')
    `).run(groupId, result.lastInsertRowid, fixedDate, time || '20:00');
  } else {
    for (let i = 0; i < count; i++) {
      const nextDate = getNextDateForRecurrence(dayOfWeek, validRecurrence, i);
      db.prepare(`
        INSERT INTO movie_nights (group_id, schedule_id, date, time, status)
        VALUES (?, ?, ?, ?, 'voting')
      `).run(groupId, result.lastInsertRowid, nextDate, time || '20:00');
    }
  }

  res.json({
    id: result.lastInsertRowid,
    groupId,
    name,
    dayOfWeek,
    time: time || '20:00',
    recurrenceType: validRecurrence,
    advanceCount: count
  });
});

router.patch('/:id', requireNonGuest, (req, res) => {
  const { id } = req.params;
  const { name, dayOfWeek, time, recurrenceType, advanceCount } = req.body;

  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  if (!schedule) {
    return res.status(404).json({ error: 'Schedule not found' });
  }

  const isMember = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(schedule.group_id, req.session.userId);

  if (!isMember) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const newName = name !== undefined ? name : schedule.name;
  const newDayOfWeek = dayOfWeek !== undefined ? Number(dayOfWeek) : schedule.day_of_week;
  const newTime = time !== undefined ? time : schedule.time;
  const newRecurrenceType = recurrenceType !== undefined ? recurrenceType : (schedule.recurrence_type || 'weekly');
  const newAdvanceCount = advanceCount !== undefined ? Math.max(1, Math.min(advanceCount, 10)) : (schedule.advance_count || 1);

  db.prepare(`
    UPDATE schedules 
    SET name = ?, day_of_week = ?, time = ?, recurrence_type = ?, advance_count = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(newName, newDayOfWeek, newTime, newRecurrenceType, newAdvanceCount, id);

  const validDates = [];
  if (newRecurrenceType !== 'none') {
    for (let i = 0; i < newAdvanceCount; i++) {
      const nextDate = getNextDateForRecurrence(newDayOfWeek, newRecurrenceType, i);
      validDates.push(nextDate);
      const existing = db.prepare('SELECT id FROM movie_nights WHERE schedule_id = ? AND date = ?').get(id, nextDate);
      if (!existing) {
        db.prepare(`
          INSERT INTO movie_nights (group_id, schedule_id, date, time, status)
          VALUES (?, ?, ?, ?, 'voting')
        `).run(schedule.group_id, id, nextDate, newTime);
      }
    }
  }

  db.prepare(`
    DELETE FROM movie_nights 
    WHERE schedule_id = ? 
    AND date >= date('now') 
    AND status = 'voting'
    AND date NOT IN (${validDates.map(() => '?').join(',') || "'-'"})
  `).run(id, ...validDates);

  res.json({
    id: parseInt(id),
    groupId: schedule.group_id,
    name: newName,
    dayOfWeek: newDayOfWeek,
    time: newTime,
    recurrenceType: newRecurrenceType,
    advanceCount: newAdvanceCount
  });
});

router.delete('/:id', requireNonGuest, (req, res) => {
  const { id } = req.params;

  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  if (!schedule) {
    return res.status(404).json({ error: 'Schedule not found' });
  }

  const isMember = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(schedule.group_id, req.session.userId);

  if (!isMember) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
  res.json({ success: true });
});

router.get('/movie-nights/group/:groupId', requireNonGuest, (req, res) => {
  const { groupId } = req.params;

  const isMember = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, req.session.userId);

  if (!isMember) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const nights = db.prepare(`
    SELECT mn.*, 
           s.name as schedule_name,
           u.username as host_name,
           n.title as winning_movie_title,
           (SELECT COUNT(*) FROM nominations WHERE movie_night_id = mn.id) as nomination_count
    FROM movie_nights mn
    LEFT JOIN schedules s ON mn.schedule_id = s.id
    LEFT JOIN users u ON mn.host_id = u.id
    LEFT JOIN nominations n ON mn.winning_movie_id = n.id
    WHERE mn.group_id = ?
    AND mn.date >= date('now')
    ORDER BY mn.date ASC
    LIMIT 50
  `).all(groupId);

  res.json(nights.map(n => ({
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
    nominationCount: n.nomination_count
  })));
});

router.get('/movie-nights/group/:groupId/history', requireNonGuest, (req, res) => {
  const { groupId } = req.params;
  const page = parseInt(req.query.page) || 0;
  const limit = 5;
  const offset = page * limit;

  const isMember = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, req.session.userId);

  if (!isMember) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const nights = db.prepare(`
    SELECT mn.*, 
           s.name as schedule_name,
           u.username as host_name,
           n.title as winning_movie_title,
           (SELECT COUNT(*) FROM nominations WHERE movie_night_id = mn.id) as nomination_count
    FROM movie_nights mn
    LEFT JOIN schedules s ON mn.schedule_id = s.id
    LEFT JOIN users u ON mn.host_id = u.id
    LEFT JOIN nominations n ON mn.winning_movie_id = n.id
    WHERE mn.group_id = ?
    AND mn.date < date('now')
    ORDER BY mn.date DESC
    LIMIT ? OFFSET ?
  `).all(groupId, limit, offset);

  const totalCount = db.prepare(`
    SELECT COUNT(*) as count FROM movie_nights 
    WHERE group_id = ? AND date < date('now')
  `).get(groupId);

  res.json({
    nights: nights.map(n => ({
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
      nominationCount: n.nomination_count
    })),
    hasMore: offset + nights.length < totalCount.count,
    total: totalCount.count
  });
});

router.get('/movie-nights/:id', requireInviteMovieNight, (req, res) => {
  const { id } = req.params;

  const night = db.prepare(`
    SELECT mn.*, 
           s.name as schedule_name,
           u.username as host_name,
           g.name as group_name,
           g.description as group_description,
           g.image_url as group_image_url
    FROM movie_nights mn
    LEFT JOIN schedules s ON mn.schedule_id = s.id
    LEFT JOIN users u ON mn.host_id = u.id
    LEFT JOIN groups g ON mn.group_id = g.id
    WHERE mn.id = ?
  `).get(id);

  if (!night) {
    return res.status(404).json({ error: 'Movie night not found' });
  }

  const isMember = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(night.group_id, req.session.userId);

  if (!isMember) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const attendance = db.prepare(`
    SELECT a.*, u.username, u.avatar_url
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE a.movie_night_id = ?
  `).all(id);

  const members = db.prepare(`
    SELECT u.id, u.username, u.avatar_url
    FROM group_members gm
    JOIN users u ON gm.user_id = u.id
    WHERE gm.group_id = ?
  `).all(night.group_id);

  const nightDateTime = new Date(`${night.date}T${night.time || '23:59'}:00`);
  const isLocked = nightDateTime < new Date();

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
    isLocked,
    isCancelled: night.is_cancelled === 1,
    cancelReason: night.cancel_reason,
    attendance: attendance.map(a => ({
      userId: a.user_id,
      username: a.username,
      avatarUrl: a.avatar_url,
      status: a.status
    })),
    members: members.map(m => ({
      userId: m.id,
      username: m.username,
      avatarUrl: m.avatar_url
    }))
  });
});

router.patch('/movie-nights/:id', requireNonGuest, (req, res) => {
  const { id } = req.params;
  const { hostId, isCancelled, cancelReason } = req.body;

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(id);
  if (!night) {
    return res.status(404).json({ error: 'Movie night not found' });
  }

  const isMember = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(night.group_id, req.session.userId);

  if (!isMember) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  if (hostId !== undefined) {
    db.prepare('UPDATE movie_nights SET host_id = ? WHERE id = ?').run(hostId, id);
  }

  if (isCancelled !== undefined) {
    db.prepare(`
      UPDATE movie_nights SET is_cancelled = ?, cancel_reason = ? WHERE id = ?
    `).run(isCancelled ? 1 : 0, cancelReason || null, id);
  }

  res.json({ success: true });
});

router.post('/movie-nights/:id/attendance', requireInviteMovieNight, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['attending', 'absent', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(id);
  if (!night) {
    return res.status(404).json({ error: 'Movie night not found' });
  }

  db.prepare(`
    INSERT INTO attendance (movie_night_id, user_id, status)
    VALUES (?, ?, ?)
    ON CONFLICT(movie_night_id, user_id) DO UPDATE SET status = ?, updated_at = datetime('now')
  `).run(id, req.session.userId, status, status);

  res.json({ success: true });
});

function getNextDateForRecurrence(dayOfWeek, recurrenceType, instanceOffset = 0) {
  const today = new Date();
  const currentDay = today.getDay();
  const targetDay = Number(dayOfWeek);
  let daysUntil = targetDay - currentDay;
  
  if (daysUntil <= 0) {
    daysUntil += 7;
  }

  const nextDate = new Date(today);
  nextDate.setDate(today.getDate() + daysUntil);

  if (recurrenceType === 'weekly') {
    nextDate.setDate(nextDate.getDate() + (instanceOffset * 7));
  } else if (recurrenceType === 'biweekly') {
    nextDate.setDate(nextDate.getDate() + (instanceOffset * 14));
  } else if (recurrenceType === 'monthly') {
    nextDate.setMonth(nextDate.getMonth() + instanceOffset);
  }
  
  const year = nextDate.getFullYear();
  const month = String(nextDate.getMonth() + 1).padStart(2, '0');
  const day = String(nextDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default router;
