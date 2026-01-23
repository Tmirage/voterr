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

interface VotingCoreParams {
  showRankingCountdown: (seconds: number, onComplete: () => void) => void;
  clearRankingCountdown: () => void;
  addNotification: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => number;
  showVotesCast: () => void;
}

function useVotingCore({
  showRankingCountdown,
  clearRankingCountdown,
  addNotification,
  showVotesCast,
}: VotingCoreParams) {
  const pendingRef = useRef(false);
  const latestDataRef = useRef<Nomination[]>([]);
  const sortedRef = useRef<Nomination[]>([]);

  const applyNewOrder = useCallback((winnerId: number | null = null) => {
    const sorted = sortByVotes(latestDataRef.current, winnerId);
    sortedRef.current = sorted;
    pendingRef.current = false;
    return sorted;
  }, []);

  const processRefreshData = useCallback(
    (
      newNominations: Nomination[],
      currentSorted: Nomination[],
      winnerId: number | null,
      onUpdate: (sorted: Nomination[]) => void
    ) => {
      const newSorted = sortByVotes(newNominations, winnerId);
      latestDataRef.current = newNominations;

      const currentOrder = currentSorted.map((n) => n.id);
      const newOrder = newSorted.map((n) => n.id);
      const orderChanged =
        currentOrder.length > 0 && currentOrder.some((id, i) => id !== newOrder[i]);

      const updatedInCurrentOrder = currentOrder
        .map((id) => newNominations.find((n) => n.id === id))
        .filter((n): n is Nomination => Boolean(n));
      const newState = updatedInCurrentOrder.length ? updatedInCurrentOrder : newSorted;
      sortedRef.current = newState;

      if (orderChanged) {
        pendingRef.current = true;
        setTimeout(() => {
          showRankingCountdown(5, () => {
            const sorted = applyNewOrder(winnerId);
            onUpdate(sorted);
          });
        }, 0);
        return { sorted: newState, orderChanged: true };
      }

      if (!pendingRef.current) {
        sortedRef.current = newSorted;
        return { sorted: newSorted, orderChanged: false };
      }

      return { sorted: newState, orderChanged: false };
    },
    [showRankingCountdown, applyNewOrder]
  );

  const optimisticVote = useCallback(
    (nominations: Nomination[], nominationId: number, increment: boolean) => {
      const updated = nominations.map((nom) => {
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
      sortedRef.current = updated;
      return updated;
    },
    []
  );

  const cancelRerank = useCallback(() => {
    clearRankingCountdown();
    pendingRef.current = false;
  }, [clearRankingCountdown]);

  return {
    pendingRef,
    sortedRef,
    processRefreshData,
    optimisticVote,
    cancelRerank,
    addNotification,
    showVotesCast,
  };
}

export function useVoting(nightId: number, winningMovieId: number | null = null) {
  const notifications = useNotifications();
  const core = useVotingCore(notifications);

  const [sortedNominations, setSortedNominations] = useState<Nomination[]>([]);
  const [userRemainingVotes, setUserRemainingVotes] = useState(0);
  const [maxVotesPerUser, setMaxVotesPerUser] = useState(0);
  const [plexServerId, setPlexServerId] = useState<string | null>(null);

  const winnerRef = useRef(winningMovieId);

  const refresh = useCallback(async () => {
    try {
      const votesData = await api.get<VotesData>(`/votes/movie-night/${nightId}`);
      const { sorted } = core.processRefreshData(
        votesData.nominations,
        core.sortedRef.current,
        winnerRef.current,
        setSortedNominations
      );

      setUserRemainingVotes(votesData.userRemainingVotes);
      setMaxVotesPerUser(votesData.maxVotesPerUser);
      setSortedNominations(sorted);
      if (votesData.plexServerId) setPlexServerId(votesData.plexServerId);

      return votesData;
    } catch (error) {
      console.error('Failed to refresh vote data:', error);
      throw error;
    }
  }, [nightId, core]);

  const vote = useCallback(
    (nominationId: number) => {
      const votesBeforeVote = userRemainingVotes;

      setSortedNominations((prev) => core.optimisticVote(prev, nominationId, true));
      setUserRemainingVotes((prev) => Math.max(0, prev - 1));

      if (votesBeforeVote === 1) {
        core.showVotesCast();
      }

      api
        .post(`/schedules/movie-nights/${nightId}/attendance`, { status: 'attending' })
        .catch(() => {});
      api
        .post('/votes/vote', { nominationId })
        .then(() => refresh())
        .catch((error: Error) => {
          console.error('Vote failed:', error);
          core.addNotification(error.message || 'Vote failed', 'error');
          refresh();
        });
    },
    [nightId, userRemainingVotes, refresh, core]
  );

  const unvote = useCallback(
    (nominationId: number) => {
      setSortedNominations((prev) => core.optimisticVote(prev, nominationId, false));
      setUserRemainingVotes((prev) => prev + 1);

      api
        .delete(`/votes/vote/${nominationId}`)
        .then(() => refresh())
        .catch((error: Error) => {
          console.error('Unvote failed:', error);
          core.addNotification(error.message || 'Unvote failed', 'error');
          refresh();
        });
    },
    [refresh, core]
  );

  const initialize = useCallback(
    (votesData: VotesData, winnerId: number | null = null) => {
      winnerRef.current = winnerId;
      const sorted = sortByVotes(votesData.nominations, winnerId);
      core.sortedRef.current = sorted;
      setUserRemainingVotes(votesData.userRemainingVotes);
      setMaxVotesPerUser(votesData.maxVotesPerUser);
      setSortedNominations(sorted);
      if (votesData.plexServerId) setPlexServerId(votesData.plexServerId);
    },
    [core]
  );

  const setWinner = useCallback(
    (winnerId: number) => {
      winnerRef.current = winnerId;
      const sorted = sortByVotes(core.sortedRef.current, winnerId);
      core.sortedRef.current = sorted;
      setSortedNominations(sorted);
    },
    [core]
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
    cancelRerank: core.cancelRerank,
    isPending: core.pendingRef.current,
  };
}

export function useMultiVoting() {
  const notifications = useNotifications();
  const { showRankingCountdown, clearRankingCountdown, addNotification, showVotesCast } =
    notifications;

  const [sortedMap, setSortedMap] = useState<Record<number, Nomination[]>>({});
  const [nightsData, setNightsData] = useState<Record<number, NightData>>({});

  const pendingRef = useRef<number[]>([]);
  const latestDataRef = useRef<Record<number, Nomination[]>>({});
  const sortedRef = useRef<Record<number, Nomination[]>>({});

  const applyNewOrder = useCallback((nightId: number) => {
    const sorted = sortByVotes(latestDataRef.current[nightId] || []);
    sortedRef.current = { ...sortedRef.current, [nightId]: sorted };
    setSortedMap((prev) => ({ ...prev, [nightId]: sorted }));
    pendingRef.current = pendingRef.current.filter((id) => id !== nightId);
  }, []);

  const refresh = useCallback(
    async (nightId: number) => {
      try {
        const votesData = await api.get<VotesData>(`/votes/movie-night/${nightId}`);
        const newNominations = votesData.nominations;
        const newSorted = sortByVotes(newNominations);

        latestDataRef.current[nightId] = newNominations;
        setNightsData((prev) => ({
          ...prev,
          [nightId]: {
            userRemainingVotes: votesData.userRemainingVotes,
            maxVotesPerUser: votesData.maxVotesPerUser,
          },
        }));

        const currentOrder = (sortedRef.current[nightId] || []).map((n) => n.id);
        const newOrder = newSorted.map((n) => n.id);
        const orderChanged =
          currentOrder.length > 0 && currentOrder.some((id, i) => id !== newOrder[i]);

        const updatedInCurrentOrder = currentOrder
          .map((id) => newNominations.find((n) => n.id === id))
          .filter((n): n is Nomination => Boolean(n));
        const newState = updatedInCurrentOrder.length ? updatedInCurrentOrder : newSorted;
        sortedRef.current = { ...sortedRef.current, [nightId]: newState };
        setSortedMap((prev) => ({ ...prev, [nightId]: newState }));

        if (orderChanged) {
          if (!pendingRef.current.includes(nightId)) {
            pendingRef.current.push(nightId);
          }
          setTimeout(() => {
            showRankingCountdown(5, () => applyNewOrder(nightId));
          }, 0);
        } else if (!pendingRef.current.includes(nightId)) {
          sortedRef.current = { ...sortedRef.current, [nightId]: newSorted };
          setSortedMap((prev) => ({ ...prev, [nightId]: newSorted }));
        }

        return votesData;
      } catch (err: unknown) {
        console.error('Failed to refresh vote data:', err);
      }
    },
    [showRankingCountdown, applyNewOrder]
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
        sortedRef.current = { ...sortedRef.current, [nightId]: updated };
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

      api
        .post(`/schedules/movie-nights/${nightId}/attendance`, { status: 'attending' })
        .catch(() => {});
      api
        .post('/votes/vote', { nominationId })
        .then(() => refresh(nightId))
        .catch((error: Error) => {
          console.error('Vote failed:', error);
          addNotification(error.message || 'Vote failed', 'error');
          refresh(nightId);
        });
    },
    [nightsData, refresh, addNotification, showVotesCast]
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
        sortedRef.current = { ...sortedRef.current, [nightId]: updated };
        return { ...prev, [nightId]: updated };
      });
      setNightsData((prev) => ({
        ...prev,
        [nightId]: {
          ...prev[nightId],
          userRemainingVotes: (prev[nightId]?.userRemainingVotes || 0) + 1,
        },
      }));

      api
        .delete(`/votes/vote/${nominationId}`)
        .then(() => refresh(nightId))
        .catch((error: Error) => {
          console.error('Unvote failed:', error);
          addNotification(error.message || 'Unvote failed', 'error');
          refresh(nightId);
        });
    },
    [refresh, addNotification]
  );

  const initialize = useCallback((nightId: number, votesData: VotesData) => {
    const sorted = sortByVotes(votesData.nominations);
    latestDataRef.current[nightId] = votesData.nominations;
    sortedRef.current = { ...sortedRef.current, [nightId]: sorted };
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

  const cancelRerank = useCallback(() => {
    clearRankingCountdown();
    pendingRef.current = [];
  }, [clearRankingCountdown]);

  return {
    vote,
    unvote,
    refresh,
    initialize,
    getSorted,
    getData,
    cancelRerank,
  };
}
