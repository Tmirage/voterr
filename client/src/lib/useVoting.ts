import { useState, useRef, useCallback } from 'react';
import { api } from './api';
import { useNotifications } from '../context/NotificationContext';

export interface Nomination {
  id: number;
  voteCount: number;
  userVoteCount?: number;
  userHasVoted?: boolean;
  [key: string]: unknown;
}

export interface VotesData {
  nominations: Nomination[];
  userRemainingVotes: number;
  maxVotesPerUser: number;
  plexServerId?: string;
}

interface NightData {
  userRemainingVotes: number;
  maxVotesPerUser: number;
}

function sortByVotes(noms: Nomination[], winnerId: number | null = null): Nomination[] {
  return [...noms].sort((a, b) => {
    if (winnerId === a.id) return -1;
    if (winnerId === b.id) return 1;
    return b.voteCount - a.voteCount;
  });
}

export function useVoting(nightId: number, winningMovieId: number | null = null) {
  const { addNotification, showVotesCast, showRankingCountdown, clearRankingCountdown } = useNotifications();

  const [sortedNominations, setSortedNominations] = useState<Nomination[]>([]);
  const [userRemainingVotes, setUserRemainingVotes] = useState(0);
  const [maxVotesPerUser, setMaxVotesPerUser] = useState(0);
  const [plexServerId, setPlexServerId] = useState<string | null>(null);

  const winnerRef = useRef(winningMovieId);

  const refresh = useCallback(async () => {
    try {
      const votesData = await api.get<VotesData>(`/votes/movie-night/${nightId}`);
      const sorted = sortByVotes(votesData.nominations, winnerRef.current);

      setUserRemainingVotes(votesData.userRemainingVotes);
      setMaxVotesPerUser(votesData.maxVotesPerUser);
      setSortedNominations(sorted);
      if (votesData.plexServerId) setPlexServerId(votesData.plexServerId);

      return votesData;
    } catch (error) {
      console.error('Failed to refresh vote data:', error);
      throw error;
    }
  }, [nightId]);

  const optimisticVote = useCallback(
    (nominations: Nomination[], nominationId: number, increment: boolean) => {
      return nominations.map((nom) => {
        if (nom.id === nominationId) {
          if (increment) {
            return {
              ...nom,
              voteCount: nom.voteCount + 1,
              userVoteCount: (nom.userVoteCount || 0) + 1,
              userHasVoted: true,
            };
          } else {
            const newUserVoteCount = Math.max(0, (nom.userVoteCount || 1) - 1);
            return {
              ...nom,
              voteCount: Math.max(0, nom.voteCount - 1),
              userVoteCount: newUserVoteCount,
              userHasVoted: newUserVoteCount > 0,
            };
          }
        }
        return nom;
      });
    },
    []
  );

  const startCountdown = useCallback(() => {
    showRankingCountdown(async () => {
      await refresh();
    });
  }, [showRankingCountdown, refresh]);

  const vote = useCallback(
    (nominationId: number) => {
      const votesBeforeVote = userRemainingVotes;

      setSortedNominations((prev) => optimisticVote(prev, nominationId, true));
      setUserRemainingVotes((prev) => Math.max(0, prev - 1));

      if (votesBeforeVote === 1) {
        showVotesCast();
      }

      startCountdown();

      api
        .post(`/schedules/movie-nights/${nightId}/attendance`, { status: 'attending' })
        .catch(() => {});
      api
        .post('/votes/vote', { nominationId })
        .catch((error: Error) => {
          console.error('Vote failed:', error);
          addNotification(error.message || 'Vote failed', 'error');
          clearRankingCountdown();
          refresh();
        });
    },
    [nightId, userRemainingVotes, refresh, optimisticVote, addNotification, showVotesCast, startCountdown, clearRankingCountdown]
  );

  const unvote = useCallback(
    (nominationId: number) => {
      setSortedNominations((prev) => optimisticVote(prev, nominationId, false));
      setUserRemainingVotes((prev) => prev + 1);

      startCountdown();

      api
        .delete(`/votes/vote/${nominationId}`)
        .catch((error: Error) => {
          console.error('Unvote failed:', error);
          addNotification(error.message || 'Unvote failed', 'error');
          clearRankingCountdown();
          refresh();
        });
    },
    [refresh, optimisticVote, addNotification, startCountdown, clearRankingCountdown]
  );

  const initialize = useCallback(
    (votesData: VotesData, winnerId: number | null = null) => {
      winnerRef.current = winnerId;
      const sorted = sortByVotes(votesData.nominations, winnerId);
      setUserRemainingVotes(votesData.userRemainingVotes);
      setMaxVotesPerUser(votesData.maxVotesPerUser);
      setSortedNominations(sorted);
      if (votesData.plexServerId) setPlexServerId(votesData.plexServerId);
    },
    []
  );

  const setWinner = useCallback(
    (winnerId: number) => {
      winnerRef.current = winnerId;
      setSortedNominations((prev) => sortByVotes(prev, winnerId));
    },
    []
  );

  return {
    sortedNominations,
    userRemainingVotes,
    maxVotesPerUser,
    plexServerId,
    vote,
    unvote,
    refresh,
    initialize,
    setWinner,
  };
}

export function useMultiVoting() {
  const { addNotification, showVotesCast, showRankingCountdown, clearRankingCountdown } = useNotifications();
  const pendingRefreshRef = useRef<Set<number>>(new Set());

  const [sortedMap, setSortedMap] = useState<Record<number, Nomination[]>>({});
  const [nightsData, setNightsData] = useState<Record<number, NightData>>({});

  const refresh = useCallback(async (nightId: number) => {
    try {
      const votesData = await api.get<VotesData>(`/votes/movie-night/${nightId}`);
      const sorted = sortByVotes(votesData.nominations);

      setNightsData((prev) => ({
        ...prev,
        [nightId]: {
          userRemainingVotes: votesData.userRemainingVotes,
          maxVotesPerUser: votesData.maxVotesPerUser,
        },
      }));
      setSortedMap((prev) => ({ ...prev, [nightId]: sorted }));

      return votesData;
    } catch (err: unknown) {
      console.error('Failed to refresh vote data:', err);
    }
  }, []);

  const startCountdown = useCallback(
    (nightId: number) => {
      pendingRefreshRef.current.add(nightId);
      showRankingCountdown(async () => {
        const ids = Array.from(pendingRefreshRef.current);
        pendingRefreshRef.current.clear();
        await Promise.all(ids.map((id) => refresh(id)));
      });
    },
    [showRankingCountdown, refresh]
  );

  const vote = useCallback(
    (nominationId: number, nightId: number) => {
      const votesBeforeVote = nightsData[nightId]?.userRemainingVotes || 0;

      setSortedMap((prev) => {
        const updated = (prev[nightId] || []).map((nom) =>
          nom.id === nominationId
            ? {
                ...nom,
                voteCount: nom.voteCount + 1,
                userVoteCount: (nom.userVoteCount || 0) + 1,
                userHasVoted: true,
              }
            : nom
        );
        return { ...prev, [nightId]: updated };
      });
      setNightsData((prev) => ({
        ...prev,
        [nightId]: {
          ...prev[nightId],
          userRemainingVotes: Math.max(0, (prev[nightId]?.userRemainingVotes || 1) - 1),
        },
      }));

      if (votesBeforeVote === 1) {
        showVotesCast();
      }

      startCountdown(nightId);

      api
        .post(`/schedules/movie-nights/${nightId}/attendance`, { status: 'attending' })
        .catch(() => {});
      api
        .post('/votes/vote', { nominationId })
        .catch((error: Error) => {
          console.error('Vote failed:', error);
          addNotification(error.message || 'Vote failed', 'error');
          clearRankingCountdown();
          refresh(nightId);
        });
    },
    [nightsData, refresh, addNotification, showVotesCast, startCountdown, clearRankingCountdown]
  );

  const unvote = useCallback(
    (nominationId: number, nightId: number) => {
      setSortedMap((prev) => {
        const updated = (prev[nightId] || []).map((nom) => {
          if (nom.id === nominationId) {
            const newUserVoteCount = Math.max(0, (nom.userVoteCount || 1) - 1);
            return {
              ...nom,
              voteCount: Math.max(0, nom.voteCount - 1),
              userVoteCount: newUserVoteCount,
              userHasVoted: newUserVoteCount > 0,
            };
          }
          return nom;
        });
        return { ...prev, [nightId]: updated };
      });
      setNightsData((prev) => ({
        ...prev,
        [nightId]: {
          ...prev[nightId],
          userRemainingVotes: (prev[nightId]?.userRemainingVotes || 0) + 1,
        },
      }));

      startCountdown(nightId);

      api
        .delete(`/votes/vote/${nominationId}`)
        .catch((error: Error) => {
          console.error('Unvote failed:', error);
          addNotification(error.message || 'Unvote failed', 'error');
          clearRankingCountdown();
          refresh(nightId);
        });
    },
    [refresh, addNotification, startCountdown, clearRankingCountdown]
  );

  const initialize = useCallback((nightId: number, votesData: VotesData) => {
    const sorted = sortByVotes(votesData.nominations);
    setSortedMap((prev) => ({ ...prev, [nightId]: sorted }));
    setNightsData((prev) => ({
      ...prev,
      [nightId]: {
        userRemainingVotes: votesData.userRemainingVotes,
        maxVotesPerUser: votesData.maxVotesPerUser,
      },
    }));
  }, []);

  const getSorted = useCallback(
    (nightId: number) => {
      return sortedMap[nightId] || [];
    },
    [sortedMap]
  );

  const getData = useCallback(
    (nightId: number) => {
      return nightsData[nightId] || { userRemainingVotes: 0, maxVotesPerUser: 0 };
    },
    [nightsData]
  );

  return {
    vote,
    unvote,
    refresh,
    initialize,
    getSorted,
    getData,
  };
}
