import db from '../db/index.js';
import { hasUserWatchedMovie } from '../services/tautulli.js';
import { getProxiedImageUrl } from '../services/imageCache.js';
import { searchOverseerrMovieRating, getOverseerrMovieByTmdbId } from '../services/overseerr.js';

interface Nomination {
  id: number;
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

interface GroupMember {
  id: number;
  plex_id: string | null;
  username: string;
  avatar_url: string | null;
}

interface VoteRow {
  user_id: number;
  username: string;
  avatar_url: string | null;
  vote_count: number;
}

interface BlockRow {
  user_id: number;
  username: string;
  avatar_url: string | null;
}

interface EnrichOptions {
  userId: number;
  groupMembers: GroupMember[];
  watchedCache: Map<string, boolean | null>;
  attendingUserIds: Set<number>;
  absentUserIds: Set<number>;
}

interface EnrichedNomination {
  id: number;
  ratingKey: string | null;
  tmdbId: number | null;
  mediaType: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  overview: string | null;
  runtime: number | null;
  voteAverage: number | null;
  nominatedBy: { id: number; username: string };
  createdAt: string;
  votes: Array<{ userId: number; username: string; avatarUrl: string | null; voteCount: number }>;
  voteCount: number;
  watchedBy: Array<{ userId: number; username: string; avatarUrl: string | null }>;
  blockedBy: Array<{ userId: number; username: string; avatarUrl: string | null }>;
  isBlocked: boolean;
  userHasBlocked: boolean;
  userHasVoted: boolean;
  userVoteCount: number;
  isLeading?: boolean;
}

export async function buildWatchedCache(
  nominations: Nomination[],
  groupMembers: GroupMember[]
): Promise<Map<string, boolean | null>> {
  const watchedCache = new Map<string, boolean | null>();
  const promises: Promise<void>[] = [];

  for (const n of nominations) {
    for (const member of groupMembers) {
      if (member.plex_id && n.plex_rating_key) {
        const key = `${member.plex_id}-${n.plex_rating_key}`;
        if (!watchedCache.has(key)) {
          watchedCache.set(key, null);
          promises.push(
            hasUserWatchedMovie(member.plex_id, n.plex_rating_key, n.title)
              .then((watched) => {
                watchedCache.set(key, watched);
              })
              .catch(() => {
                watchedCache.set(key, false);
              })
          );
        }
      }
    }
  }

  await Promise.all(promises);
  return watchedCache;
}

export async function enrichNominations(
  nominations: Nomination[],
  options: EnrichOptions
): Promise<EnrichedNomination[]> {
  const { userId, groupMembers, watchedCache, attendingUserIds, absentUserIds } = options;

  const enrichedNominations = await Promise.all(
    nominations.map(async (n) => {
      const allVotes = db
        .prepare(
          `
      SELECT v.*, u.username, u.avatar_url
      FROM votes v
      JOIN users u ON v.user_id = u.id
      WHERE v.nomination_id = ?
    `
        )
        .all(n.id) as VoteRow[];

      const votes = allVotes.filter(
        (v) =>
          !absentUserIds.has(v.user_id) &&
          (attendingUserIds.size === 0 || attendingUserIds.has(v.user_id))
      );
      const userVote = allVotes.find((v) => v.user_id === userId);

      const watchedBy: Array<{ userId: number; username: string; avatarUrl: string | null }> = [];
      for (const member of groupMembers) {
        if (member.plex_id && n.plex_rating_key) {
          const key = `${member.plex_id}-${n.plex_rating_key}`;
          if (watchedCache.get(key)) {
            watchedBy.push({
              userId: member.id,
              username: member.username,
              avatarUrl: member.avatar_url,
            });
          }
        }
      }

      const blocks = db
        .prepare(
          `
      SELECT nb.*, u.username, u.avatar_url
      FROM nomination_blocks nb
      JOIN users u ON nb.user_id = u.id
      WHERE nb.nomination_id = ?
    `
        )
        .all(n.id) as BlockRow[];

      let voteAverage: number | null = null;
      try {
        if (n.tmdb_id) {
          const rating = await getOverseerrMovieByTmdbId(n.tmdb_id);
          voteAverage = rating?.voteAverage ?? null;
        } else if (n.title) {
          const rating = await searchOverseerrMovieRating(n.title, n.year ?? undefined);
          voteAverage = rating?.voteAverage ?? null;
        }
      } catch {
        // Ignore rating fetch errors
      }

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
        voteAverage,
        nominatedBy: { id: n.nominated_by, username: n.nominated_by_name },
        createdAt: n.created_at,
        votes: votes.map((v) => ({
          userId: v.user_id,
          username: v.username,
          avatarUrl: v.avatar_url,
          voteCount: v.vote_count,
        })),
        voteCount: votes.reduce((sum, v) => sum + v.vote_count, 0),
        watchedBy,
        blockedBy: blocks.map((b) => ({
          userId: b.user_id,
          username: b.username,
          avatarUrl: b.avatar_url,
        })),
        isBlocked: blocks.length > 0,
        userHasBlocked: blocks.some((b) => b.user_id === userId),
        userHasVoted: !!userVote,
        userVoteCount: userVote?.vote_count || 0,
      };
    })
  );

  return enrichedNominations;
}

export function sortAndMarkLeader(
  nominations: EnrichedNomination[],
  winningMovieId: number | null
): EnrichedNomination[] {
  const sorted = [...nominations].sort((a, b) => {
    if (winningMovieId === a.id) return -1;
    if (winningMovieId === b.id) return 1;
    return b.voteCount - a.voteCount;
  });

  const topVoteCount = sorted[0]?.voteCount || 0;
  return sorted.map((n) => ({
    ...n,
    isLeading: topVoteCount > 0 && n.voteCount === topVoteCount && !winningMovieId,
  }));
}
