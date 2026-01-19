import db from '../db/index.js';
import { hasUserWatchedMovie } from '../services/tautulli.js';
import { getProxiedImageUrl } from '../services/imageCache.js';

export async function buildWatchedCache(nominations, groupMembers) {
  const watchedCache = new Map();
  const promises = [];
  
  for (const n of nominations) {
    for (const member of groupMembers) {
      if (member.plex_id && n.plex_rating_key) {
        const key = `${member.plex_id}-${n.plex_rating_key}`;
        if (!watchedCache.has(key)) {
          watchedCache.set(key, null);
          promises.push(
            hasUserWatchedMovie(member.plex_id, n.plex_rating_key, n.title)
              .then(watched => watchedCache.set(key, watched))
              .catch(() => watchedCache.set(key, false))
          );
        }
      }
    }
  }
  
  await Promise.all(promises);
  return watchedCache;
}

export function enrichNominations(nominations, { userId, groupMembers, watchedCache, attendingUserIds, absentUserIds }) {
  return nominations.map((n) => {
    const allVotes = db.prepare(`
      SELECT v.*, u.username, u.avatar_url
      FROM votes v
      JOIN users u ON v.user_id = u.id
      WHERE v.nomination_id = ?
    `).all(n.id);

    const votes = allVotes.filter(v => 
      !absentUserIds.has(v.user_id) && 
      (attendingUserIds.size === 0 || attendingUserIds.has(v.user_id))
    );
    const userVote = allVotes.find(v => v.user_id === userId);

    const watchedBy = [];
    for (const member of groupMembers) {
      if (member.plex_id && n.plex_rating_key) {
        const key = `${member.plex_id}-${n.plex_rating_key}`;
        if (watchedCache.get(key)) {
          watchedBy.push({ userId: member.id, username: member.username, avatarUrl: member.avatar_url });
        }
      }
    }

    const blocks = db.prepare(`
      SELECT nb.*, u.username, u.avatar_url
      FROM nomination_blocks nb
      JOIN users u ON nb.user_id = u.id
      WHERE nb.nomination_id = ?
    `).all(n.id);

    return {
      id: n.id,
      ratingKey: n.plex_rating_key,
      tmdbId: n.tmdb_id,
      mediaType: n.media_type || 'plex',
      title: n.title,
      year: n.year,
      posterUrl: n.poster_url ? getProxiedImageUrl(n.poster_url) : null,
      overview: n.overview,
      runtime: n.runtime,
      nominatedBy: { id: n.nominated_by, username: n.nominated_by_name },
      createdAt: n.created_at,
      votes: votes.map(v => ({
        userId: v.user_id,
        username: v.username,
        avatarUrl: v.avatar_url,
        voteCount: v.vote_count
      })),
      voteCount: votes.reduce((sum, v) => sum + v.vote_count, 0),
      watchedBy,
      blockedBy: blocks.map(b => ({ userId: b.user_id, username: b.username, avatarUrl: b.avatar_url })),
      isBlocked: blocks.length > 0,
      userHasBlocked: blocks.some(b => b.user_id === userId),
      userHasVoted: !!userVote,
      userVoteCount: userVote?.vote_count || 0
    };
  });
}

export function sortAndMarkLeader(nominations, winningMovieId) {
  const sorted = [...nominations].sort((a, b) => {
    if (winningMovieId === a.id) return -1;
    if (winningMovieId === b.id) return 1;
    return b.voteCount - a.voteCount;
  });

  const topVoteCount = sorted[0]?.voteCount || 0;
  return sorted.map(n => ({
    ...n,
    isLeading: topVoteCount > 0 && n.voteCount === topVoteCount && !winningMovieId
  }));
}
