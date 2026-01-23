import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db/index.js';
import { requireNonGuest } from '../middleware/auth.js';
import { getUpcomingSqlCondition, isMovieNightLocked } from '../utils/movieNight.js';
import { getAttendance } from '../utils/attendance.js';
import { buildWatchedCache, enrichNominations, sortAndMarkLeader } from '../utils/nominations.js';
import { ensurePlexServerId } from './movies.js';
import { getPlexToken } from '../services/settings.js';
import { getPermissions } from '../utils/permissions.js';
import type { AuthenticatedRequest } from '../types/index.js';

interface GroupRow {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  max_votes_per_user: number;
  member_count: number;
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
  status: string;
  is_cancelled: number;
  cancel_reason: string | null;
  group_name: string;
  group_description: string | null;
  group_image_url: string | null;
  max_votes_per_user: number;
  sharing_enabled: number;
}

interface NominationRow {
  id: number;
  movie_night_id: number;
  plex_rating_key: string | null;
  tmdb_id: number | null;
  media_type: string;
  title: string;
  year: number | null;
  poster_url: string | null;
  overview: string | null;
  runtime: number | null;
  nominated_by: number;
  nominated_by_name: string;
  created_at: string;
}

interface VoteRow {
  total: number;
}

interface GroupMemberRow {
  id: number;
  username: string;
  avatar_url: string | null;
  plex_id: string | null;
}

interface AttendanceRow {
  user_id: number;
  username: string;
  avatar_url: string | null;
  status: string;
}

interface CountRow {
  count: number;
}

const router = Router();

router.get('/', requireNonGuest, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.session.userId!;

  const groups = db
    .prepare(
      `
    SELECT g.id, g.name, g.description, g.image_url, g.max_votes_per_user,
           COUNT(DISTINCT gm2.user_id) as member_count
    FROM groups g
    JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = ?
    LEFT JOIN group_members gm2 ON g.id = gm2.group_id
    GROUP BY g.id
    ORDER BY g.name
  `
    )
    .all(userId) as GroupRow[];

  const groupIds = groups.map((g) => g.id);
  if (groupIds.length === 0) {
    res.json({ groups: [], movieNights: [] });
    return;
  }

  const placeholders = groupIds.map(() => '?').join(',');
  const movieNights = db
    .prepare(
      `
    SELECT mn.id, mn.group_id, mn.schedule_id, mn.date, mn.time, mn.host_id, 
           mn.winning_movie_id, mn.status, mn.is_cancelled, mn.cancel_reason,
           s.name as schedule_name,
           u.username as host_name,
           g.name as group_name,
           g.description as group_description,
           g.image_url as group_image_url,
           g.max_votes_per_user,
           g.sharing_enabled
    FROM movie_nights mn
    LEFT JOIN schedules s ON mn.schedule_id = s.id
    LEFT JOIN users u ON mn.host_id = u.id
    LEFT JOIN groups g ON mn.group_id = g.id
    WHERE mn.group_id IN (${placeholders}) 
      AND ${getUpcomingSqlCondition('mn')}
    ORDER BY mn.date ASC
    LIMIT 20
  `
    )
    .all(...groupIds) as MovieNightRow[];

  const nightsWithDetails = await Promise.all(
    movieNights.map(async (night) => {
      const { attending: attendingUserIds, absent: absentUserIds } = getAttendance(night.id);

      const nominations = db
        .prepare(
          `
      SELECT n.*, u.username as nominated_by_name
      FROM nominations n
      LEFT JOIN users u ON n.nominated_by = u.id
      WHERE n.movie_night_id = ?
      ORDER BY n.created_at
    `
        )
        .all(night.id) as NominationRow[];

      const userTotalVotes = db
        .prepare(
          `
      SELECT COALESCE(SUM(v.vote_count), 0) as total
      FROM votes v
      JOIN nominations n ON v.nomination_id = n.id
      WHERE n.movie_night_id = ? AND v.user_id = ?
    `
        )
        .get(night.id, userId) as VoteRow;

      const groupMembers = db
        .prepare(
          `
      SELECT u.id, u.username, u.avatar_url, u.plex_id
      FROM users u
      JOIN group_members gm ON u.id = gm.user_id
      WHERE gm.group_id = ?
    `
        )
        .all(night.group_id) as GroupMemberRow[];

      const memberVotingStatus = groupMembers.map((member) => {
        const memberVotes = db
          .prepare(
            `
        SELECT COALESCE(SUM(v.vote_count), 0) as total
        FROM votes v
        JOIN nominations n ON v.nomination_id = n.id
        WHERE n.movie_night_id = ? AND v.user_id = ?
      `
          )
          .get(night.id, member.id) as VoteRow;

        return {
          id: member.id,
          username: member.username,
          avatarUrl: member.avatar_url,
          votesUsed: memberVotes?.total || 0,
          maxVotes: night.max_votes_per_user,
          hasVoted: (memberVotes?.total || 0) > 0,
          votingComplete: (memberVotes?.total || 0) >= night.max_votes_per_user,
        };
      });

      const permissions = getPermissions(authReq.session, night.group_id, night);

      const watchedCache = await buildWatchedCache(nominations, groupMembers);

      const nominationsWithVotes = await enrichNominations(nominations, {
        userId,
        groupMembers,
        watchedCache,
        attendingUserIds,
        absentUserIds,
      });

      const nominationsWithLeader = sortAndMarkLeader(nominationsWithVotes, night.winning_movie_id);

      const winner = night.winning_movie_id
        ? nominationsWithVotes.find((n) => n.id === night.winning_movie_id) || null
        : null;

      const attendance = db
        .prepare(
          `
      SELECT a.*, u.username, u.avatar_url
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.movie_night_id = ?
    `
        )
        .all(night.id) as AttendanceRow[];

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
        sharingEnabled: night.sharing_enabled !== 0,
        winner,
        attendingCount: attendingUserIds.size,
        absentCount: absentUserIds.size,
        attendance: attendance.map((a) => ({
          userId: a.user_id,
          username: a.username,
          avatarUrl: a.avatar_url,
          status: a.status,
        })),
        members: memberVotingStatus.map((m) => ({
          id: m.id,
          username: m.username,
          avatarUrl: m.avatarUrl,
          votesUsed: m.votesUsed,
          maxVotes: m.maxVotes,
          votingComplete: m.votingComplete,
        })),
      };
    })
  );

  const plexServerId = await ensurePlexServerId(getPlexToken());

  res.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      imageUrl: g.image_url,
      maxVotesPerUser: g.max_votes_per_user,
      memberCount: g.member_count,
    })),
    movieNights: nightsWithDetails,
    plexServerId,
  });
});

router.get('/stats', requireNonGuest, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.session.userId!;
  const isAppAdmin = authReq.session.isAppAdmin;

  const groupCount = isAppAdmin
    ? (db.prepare('SELECT COUNT(*) as count FROM groups').get() as CountRow).count
    : (
        db
          .prepare('SELECT COUNT(*) as count FROM group_members WHERE user_id = ?')
          .get(userId) as CountRow
      ).count;

  const groupIds = isAppAdmin
    ? (db.prepare('SELECT id FROM groups').all() as { id: number }[]).map((g) => g.id)
    : (
        db.prepare('SELECT group_id as id FROM group_members WHERE user_id = ?').all(userId) as {
          id: number;
        }[]
      ).map((g) => g.id);

  let movieNightCount = 0;
  if (groupIds.length > 0) {
    const placeholders = groupIds.map(() => '?').join(',');
    movieNightCount = (
      db
        .prepare(
          `
      SELECT COUNT(*) as count FROM movie_nights mn
      WHERE mn.group_id IN (${placeholders}) AND ${getUpcomingSqlCondition('mn')}
    `
        )
        .get(...groupIds) as CountRow
    ).count;
  }

  const userCount = authReq.session.isAppAdmin
    ? (db.prepare('SELECT COUNT(*) as count FROM users').get() as CountRow).count
    : 0;

  res.json({
    groups: groupCount,
    movieNights: movieNightCount,
    users: userCount,
  });
});

export default router;
