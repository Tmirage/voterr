import { useState, useRef, useCallback } from 'react';
import { api } from './api';
import { useNotifications } from '../context/NotificationContext';

export function useVoting(nightId, winningMovieId = null) {
  const { showRankingCountdown, clearRankingCountdown, addNotification, showVotesCast } = useNotifications();
  
  const [sortedNominations, setSortedNominations] = useState([]);
  const [userRemainingVotes, setUserRemainingVotes] = useState(0);
  const [maxVotesPerUser, setMaxVotesPerUser] = useState(3);
  
  const pendingRef = useRef(false);
  const latestDataRef = useRef([]);
  const winnerRef = useRef(winningMovieId);
  const sortedRef = useRef([]);

  const sortByVotes = useCallback((noms, winnerId = winnerRef.current) => {
    return [...noms].sort((a, b) => {
      if (winnerId === a.id) return -1;
      if (winnerId === b.id) return 1;
      return b.voteCount - a.voteCount;
    });
  }, []);

  const applyNewOrder = useCallback(() => {
    const sorted = sortByVotes(latestDataRef.current);
    sortedRef.current = sorted;
    setSortedNominations(sorted);
    pendingRef.current = false;
  }, [sortByVotes]);

  const refresh = useCallback(async () => {
    try {
      const votesData = await api.get(`/votes/movie-night/${nightId}`);
      const newNominations = votesData.nominations;
      const newSorted = sortByVotes(newNominations);
      
      latestDataRef.current = newNominations;
      setUserRemainingVotes(votesData.userRemainingVotes);
      setMaxVotesPerUser(votesData.maxVotesPerUser || 3);
      
      const currentOrder = sortedRef.current.map(n => n.id);
      const newOrder = newSorted.map(n => n.id);
      const orderChanged = currentOrder.length > 0 && currentOrder.some((id, i) => id !== newOrder[i]);
      
      const updatedInCurrentOrder = currentOrder.map(id => newNominations.find(n => n.id === id)).filter(Boolean);
      const newState = updatedInCurrentOrder.length ? updatedInCurrentOrder : newSorted;
      sortedRef.current = newState;
      setSortedNominations(newState);
      
      if (orderChanged) {
        pendingRef.current = true;
        setTimeout(() => {
          showRankingCountdown(5, applyNewOrder);
        }, 0);
      } else if (!pendingRef.current) {
        sortedRef.current = newSorted;
        setSortedNominations(newSorted);
      }
      
      return votesData;
    } catch (error) {
      console.error('Failed to refresh vote data:', error);
      throw error;
    }
  }, [nightId, sortByVotes, showRankingCountdown, applyNewOrder]);

  const vote = useCallback(async (nominationId) => {
    const votesBeforeVote = userRemainingVotes;
    
    setSortedNominations(prev => {
      const updated = prev.map(nom => 
        nom.id === nominationId ? { ...nom, voteCount: nom.voteCount + 1 } : nom
      );
      sortedRef.current = updated;
      return updated;
    });
    setUserRemainingVotes(prev => Math.max(0, prev - 1));
    
    try {
      api.post(`/schedules/movie-nights/${nightId}/attendance`, { status: 'attending' });
      await api.post('/votes/vote', { nominationId });
      refresh();
      if (votesBeforeVote === 1) {
        showVotesCast();
      }
    } catch (error) {
      console.error('Vote failed:', error);
      addNotification(error.message || 'Vote failed', 'error');
      refresh();
    }
  }, [nightId, userRemainingVotes, refresh, addNotification, showVotesCast]);

  const unvote = useCallback(async (nominationId) => {
    setSortedNominations(prev => {
      const updated = prev.map(nom => 
        nom.id === nominationId ? { ...nom, voteCount: Math.max(0, nom.voteCount - 1) } : nom
      );
      sortedRef.current = updated;
      return updated;
    });
    setUserRemainingVotes(prev => prev + 1);
    
    try {
      await api.delete(`/votes/vote/${nominationId}`);
      refresh();
    } catch (error) {
      console.error('Unvote failed:', error);
      addNotification(error.message || 'Unvote failed', 'error');
      refresh();
    }
  }, [nightId, refresh, addNotification]);

  const initialize = useCallback((votesData, winnerId = null) => {
    winnerRef.current = winnerId;
    latestDataRef.current = votesData.nominations;
    const sorted = sortByVotes(votesData.nominations, winnerId);
    sortedRef.current = sorted;
    setUserRemainingVotes(votesData.userRemainingVotes);
    setMaxVotesPerUser(votesData.maxVotesPerUser || 3);
    setSortedNominations(sorted);
  }, [sortByVotes]);

  const setWinner = useCallback((winnerId) => {
    winnerRef.current = winnerId;
    const sorted = sortByVotes(sortedRef.current, winnerId);
    sortedRef.current = sorted;
    setSortedNominations(sorted);
  }, [sortByVotes]);

  const cancelRerank = useCallback(() => {
    clearRankingCountdown();
    pendingRef.current = false;
  }, [clearRankingCountdown]);

  return {
    sortedNominations,
    userRemainingVotes,
    maxVotesPerUser,
    vote,
    unvote,
    refresh,
    initialize,
    setWinner,
    cancelRerank,
    isPending: pendingRef.current
  };
}

export function useMultiVoting() {
  const { showRankingCountdown, clearRankingCountdown, addNotification, showVotesCast } = useNotifications();
  
  const [sortedMap, setSortedMap] = useState({});
  const [nightsData, setNightsData] = useState({});
  
  const pendingRef = useRef([]);
  const latestDataRef = useRef({});
  const sortedRef = useRef({});

  const sortByVotes = useCallback((noms) => {
    return [...noms].sort((a, b) => b.voteCount - a.voteCount);
  }, []);

  const applyNewOrder = useCallback((nightId) => {
    const sorted = sortByVotes(latestDataRef.current[nightId] || []);
    sortedRef.current = { ...sortedRef.current, [nightId]: sorted };
    setSortedMap(prev => ({ ...prev, [nightId]: sorted }));
    pendingRef.current = pendingRef.current.filter(id => id !== nightId);
  }, [sortByVotes]);

  const refresh = useCallback(async (nightId) => {
    try {
      const votesData = await api.get(`/votes/movie-night/${nightId}`);
      const newNominations = votesData.nominations;
      const newSorted = sortByVotes(newNominations);
      
      latestDataRef.current[nightId] = newNominations;
      setNightsData(prev => ({
        ...prev,
        [nightId]: { userRemainingVotes: votesData.userRemainingVotes, maxVotesPerUser: votesData.maxVotesPerUser || 3 }
      }));
      
      const currentOrder = (sortedRef.current[nightId] || []).map(n => n.id);
      const newOrder = newSorted.map(n => n.id);
      const orderChanged = currentOrder.length > 0 && currentOrder.some((id, i) => id !== newOrder[i]);
      
      const updatedInCurrentOrder = currentOrder.map(id => newNominations.find(n => n.id === id)).filter(Boolean);
      const newState = updatedInCurrentOrder.length ? updatedInCurrentOrder : newSorted;
      sortedRef.current = { ...sortedRef.current, [nightId]: newState };
      setSortedMap(prev => ({ ...prev, [nightId]: newState }));
      
      if (orderChanged) {
        if (!pendingRef.current.includes(nightId)) {
          pendingRef.current.push(nightId);
        }
        setTimeout(() => {
          showRankingCountdown(5, () => applyNewOrder(nightId));
        }, 0);
      } else if (!pendingRef.current.includes(nightId)) {
        sortedRef.current = { ...sortedRef.current, [nightId]: newSorted };
        setSortedMap(prev => ({ ...prev, [nightId]: newSorted }));
      }
      
      return votesData;
    } catch (error) {
      console.error('Failed to refresh vote data:', error);
    }
  }, [sortByVotes, showRankingCountdown, applyNewOrder]);

  const vote = useCallback(async (nominationId, nightId) => {
    const votesBeforeVote = nightsData[nightId]?.userRemainingVotes || 0;
    
    setSortedMap(prev => {
      const updated = (prev[nightId] || []).map(nom => 
        nom.id === nominationId ? { ...nom, voteCount: nom.voteCount + 1 } : nom
      );
      sortedRef.current = { ...sortedRef.current, [nightId]: updated };
      return { ...prev, [nightId]: updated };
    });
    setNightsData(prev => ({
      ...prev,
      [nightId]: { ...prev[nightId], userRemainingVotes: Math.max(0, (prev[nightId]?.userRemainingVotes || 1) - 1) }
    }));
    
    try {
      api.post(`/schedules/movie-nights/${nightId}/attendance`, { status: 'attending' });
      await api.post('/votes/vote', { nominationId });
      refresh(nightId);
      if (votesBeforeVote === 1) {
        showVotesCast();
      }
    } catch (error) {
      console.error('Vote failed:', error);
      addNotification(error.message || 'Vote failed', 'error');
      refresh(nightId);
    }
  }, [nightsData, refresh, addNotification, showVotesCast]);

  const unvote = useCallback(async (nominationId, nightId) => {
    setSortedMap(prev => {
      const updated = (prev[nightId] || []).map(nom => 
        nom.id === nominationId ? { ...nom, voteCount: Math.max(0, nom.voteCount - 1) } : nom
      );
      sortedRef.current = { ...sortedRef.current, [nightId]: updated };
      return { ...prev, [nightId]: updated };
    });
    setNightsData(prev => ({
      ...prev,
      [nightId]: { ...prev[nightId], userRemainingVotes: (prev[nightId]?.userRemainingVotes || 0) + 1 }
    }));
    
    try {
      await api.delete(`/votes/vote/${nominationId}`);
      refresh(nightId);
    } catch (error) {
      console.error('Unvote failed:', error);
      addNotification(error.message || 'Unvote failed', 'error');
      refresh(nightId);
    }
  }, [refresh, addNotification]);

  const initialize = useCallback((nightId, votesData) => {
    const sorted = sortByVotes(votesData.nominations);
    latestDataRef.current[nightId] = votesData.nominations;
    sortedRef.current = { ...sortedRef.current, [nightId]: sorted };
    setSortedMap(prev => ({ ...prev, [nightId]: sorted }));
    setNightsData(prev => ({
      ...prev,
      [nightId]: { userRemainingVotes: votesData.userRemainingVotes, maxVotesPerUser: votesData.maxVotesPerUser || 3 }
    }));
  }, [sortByVotes]);

  const getSorted = useCallback((nightId) => {
    return sortedMap[nightId] || [];
  }, [sortedMap]);

  const getData = useCallback((nightId) => {
    return nightsData[nightId] || { userRemainingVotes: 0, maxVotesPerUser: 3 };
  }, [nightsData]);

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
    cancelRerank
  };
}
