import { Router } from 'express';
import db from '../db/index.js';
import { requireNonGuest } from '../middleware/auth.js';
import { getUpcomingSqlCondition, isMovieNightLocked } from '../utils/movieNight.js';
import { getAttendance } from '../utils/attendance.js';
import { buildWatchedCache, enrichNominations, sortAndMarkLeader } from '../utils/nominations.js';
import { getTautulliWarning, collectServiceWarnings } from '../utils/serviceWarnings.js';
import { ensurePlexServerId } from './movies.js';
import { getPlexToken } from '../services/settings.js';
import { getPermissions } from '../utils/permissions.js';

const router = Router();

router.get('/', requireNonGuest, async (req, res) => {
  const userId = req.session.userId;

  const groups = db.prepare(`
    SELECT g.id, g.name, g.description, g.image_url, g.max_votes_per_user,
           COUNT(DISTINCT gm2.user_id) as member_count
    FROM groups g
    JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = ?
    LEFT JOIN group_members gm2 ON g.id = gm2.group_id
    GROUP BY g.id
    ORDER BY g.name
  `).all(userId);

  const groupIds = groups.map(g => g.id);
  if (groupIds.length === 0) {
    return res.json({ groups: [], movieNights: [] });
  }

  const placeholders = groupIds.map(() => '?').join(',');
  const movieNights = db.prepare(`
    SELECT mn.id, mn.group_id, mn.schedule_id, mn.date, mn.time, mn.host_id, 
           mn.winning_movie_id, mn.status, mn.is_cancelled, mn.cancel_reason,
           s.name as schedule_name,
           u.username as host_name,
           g.name as group_name,
           g.description as group_description,
           g.image_url as group_image_url,
           g.max_votes_per_user
    FROM movie_nights mn
    LEFT JOIN schedules s ON mn.schedule_id = s.id
    LEFT JOIN users u ON mn.host_id = u.id
    LEFT JOIN groups g ON mn.group_id = g.id
    WHERE mn.group_id IN (${placeholders}) 
      AND ${getUpcomingSqlCondition('mn')}
    ORDER BY mn.date ASC
    LIMIT 20
  `).all(...groupIds);

  const nightsWithDetails = await Promise.all(movieNights.map(async (night) => {
    const { attending: attendingUserIds, absent: absentUserIds } = getAttendance(night.id);

    const nominations = db.prepare(`
      SELECT n.*, u.username as nominated_by_name
      FROM nominations n
      LEFT JOIN users u ON n.nominated_by = u.id
      WHERE n.movie_night_id = ?
      ORDER BY n.created_at
    `).all(night.id);

    const userTotalVotes = db.prepare(`
      SELECT COALESCE(SUM(v.vote_count), 0) as total
      FROM votes v
      JOIN nominations n ON v.nomination_id = n.id
      WHERE n.movie_night_id = ? AND v.user_id = ?
    `).get(night.id, userId);

    const groupMembers = db.prepare(`
      SELECT u.id, u.username, u.avatar_url, u.plex_id
      FROM users u
      JOIN group_members gm ON u.id = gm.user_id
      WHERE gm.group_id = ?
    `).all(night.group_id);

    const memberVotingStatus = groupMembers.map(member => {
      const memberVotes = db.prepare(`
        SELECT COALESCE(SUM(v.vote_count), 0) as total
        FROM votes v
        JOIN nominations n ON v.nomination_id = n.id
        WHERE n.movie_night_id = ? AND v.user_id = ?
      `).get(night.id, member.id);
      
      return {
        id: member.id,
        username: member.username,
        avatarUrl: member.avatar_url,
        votesUsed: memberVotes?.total || 0,
        maxVotes: night.max_votes_per_user,
        hasVoted: (memberVotes?.total || 0) > 0,
        votingComplete: (memberVotes?.total || 0) >= night.max_votes_per_user
      };
    });

    const permissions = getPermissions(req.session, night.group_id, night);

    const watchedCache = await buildWatchedCache(nominations, groupMembers);

    const nominationsWithVotes = enrichNominations(nominations, {
      userId,
      groupMembers,
      watchedCache,
      attendingUserIds,
      absentUserIds
    });

    const nominationsWithLeader = sortAndMarkLeader(nominationsWithVotes, night.winning_movie_id);

    const winner = night.winning_movie_id 
      ? nominationsWithVotes.find(n => n.id === night.winning_movie_id) || null
      : null;

    const attendance = db.prepare(`
      SELECT a.*, u.username, u.avatar_url
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.movie_night_id = ?
    `).all(night.id);

    const isLocked = isMovieNightLocked(night);
    const canVote = night.status === 'voting' && !isLocked;
    const canNominate = night.status === 'voting' && !isLocked;

    return {
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
      isCancelled: night.is_cancelled === 1,
      cancelReason: night.cancel_reason,
      canManage: permissions.canManage,
      canChangeHost: permissions.canChangeHost,
      canCancel: permissions.canCancel,
      isLocked,
      canVote,
      canNominate,
      nominations: nominationsWithLeader,
      userRemainingVotes: night.max_votes_per_user - (userTotalVotes?.total || 0),
      maxVotesPerUser: night.max_votes_per_user,
      winner,
      attendingCount: attendingUserIds.size,
      absentCount: absentUserIds.size,
      attendance: attendance.map(a => ({
        userId: a.user_id,
        username: a.username,
        avatarUrl: a.avatar_url,
        status: a.status
      })),
      members: groupMembers.map(m => ({
        userId: m.id,
        username: m.username,
        avatarUrl: m.avatar_url
      })),
      memberVotingStatus
    };
  }));

  const _serviceWarnings = collectServiceWarnings(getTautulliWarning);
  const plexServerId = await ensurePlexServerId(getPlexToken());

  res.json({
    groups: groups.map(g => ({
      id: g.id,
      name: g.name,
      description: g.description,
      imageUrl: g.image_url,
      maxVotesPerUser: g.max_votes_per_user,
      memberCount: g.member_count
    })),
    movieNights: nightsWithDetails,
    plexServerId,
    ...(_serviceWarnings.length > 0 ? { _serviceWarnings } : {})
  });
});

router.get('/stats', requireNonGuest, (req, res) => {
  const userId = req.session.userId;
  const isAppAdmin = req.session.isAppAdmin;

  const groupCount = isAppAdmin
    ? db.prepare('SELECT COUNT(*) as count FROM groups').get().count
    : db.prepare('SELECT COUNT(*) as count FROM group_members WHERE user_id = ?').get(userId).count;

  const groupIds = isAppAdmin
    ? db.prepare('SELECT id FROM groups').all().map(g => g.id)
    : db.prepare('SELECT group_id as id FROM group_members WHERE user_id = ?').all(userId).map(g => g.id);

  let movieNightCount = 0;
  if (groupIds.length > 0) {
    const placeholders = groupIds.map(() => '?').join(',');
    movieNightCount = db.prepare(`
      SELECT COUNT(*) as count FROM movie_nights mn
      WHERE mn.group_id IN (${placeholders}) AND ${getUpcomingSqlCondition('mn')}
    `).get(...groupIds).count;
  }

  const userCount = req.session.isAppAdmin
    ? db.prepare('SELECT COUNT(*) as count FROM users').get().count
    : 0;

  res.json({
    groups: groupCount,
    movieNights: movieNightCount,
    users: userCount
  });
});

export default router;
