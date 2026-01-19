import { useState, useRef, useCallback } from 'react';
import { api } from './api';
import { useNotifications } from '../context/NotificationContext';

function sortByVotes(noms, winnerId = null) {
  return [...noms].sort((a, b) => {
    if (winnerId === a.id) return -1;
    if (winnerId === b.id) return 1;
    return b.voteCount - a.voteCount;
  });
}

function useVotingCore({ showRankingCountdown, clearRankingCountdown, addNotification, showVotesCast }) {
  const pendingRef = useRef(false);
  const latestDataRef = useRef([]);
  const sortedRef = useRef([]);

  const applyNewOrder = useCallback((winnerId = null) => {
    const sorted = sortByVotes(latestDataRef.current, winnerId);
    sortedRef.current = sorted;
    pendingRef.current = false;
    return sorted;
  }, []);

  const processRefreshData = useCallback((newNominations, currentSorted, winnerId, onUpdate) => {
    const newSorted = sortByVotes(newNominations, winnerId);
    latestDataRef.current = newNominations;
    
    const currentOrder = currentSorted.map(n => n.id);
    const newOrder = newSorted.map(n => n.id);
    const orderChanged = currentOrder.length > 0 && currentOrder.some((id, i) => id !== newOrder[i]);
    
    const updatedInCurrentOrder = currentOrder.map(id => newNominations.find(n => n.id === id)).filter(Boolean);
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
  }, [showRankingCountdown, applyNewOrder]);

  const optimisticVote = useCallback((nominations, nominationId, increment) => {
    const updated = nominations.map(nom => 
      nom.id === nominationId 
        ? { ...nom, voteCount: increment ? nom.voteCount + 1 : Math.max(0, nom.voteCount - 1) } 
        : nom
    );
    sortedRef.current = updated;
    return updated;
  }, []);

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
    showVotesCast
  };
}

export function useVoting(nightId, winningMovieId = null) {
  const notifications = useNotifications();
  const core = useVotingCore(notifications);
  
  const [sortedNominations, setSortedNominations] = useState([]);
  const [userRemainingVotes, setUserRemainingVotes] = useState(0);
  const [maxVotesPerUser, setMaxVotesPerUser] = useState(0);
  
  const winnerRef = useRef(winningMovieId);

  const refresh = useCallback(async () => {
    try {
      const votesData = await api.get(`/votes/movie-night/${nightId}`);
      const { sorted } = core.processRefreshData(
        votesData.nominations, 
        core.sortedRef.current, 
        winnerRef.current,
        setSortedNominations
      );
      
      setUserRemainingVotes(votesData.userRemainingVotes);
      setMaxVotesPerUser(votesData.maxVotesPerUser);
      setSortedNominations(sorted);
      
      return votesData;
    } catch (error) {
      console.error('Failed to refresh vote data:', error);
      throw error;
    }
  }, [nightId, core]);

  const vote = useCallback(async (nominationId) => {
    const votesBeforeVote = userRemainingVotes;
    
    setSortedNominations(prev => core.optimisticVote(prev, nominationId, true));
    setUserRemainingVotes(prev => Math.max(0, prev - 1));
    
    try {
      api.post(`/schedules/movie-nights/${nightId}/attendance`, { status: 'attending' });
      await api.post('/votes/vote', { nominationId });
      refresh();
      if (votesBeforeVote === 1) {
        core.showVotesCast();
      }
    } catch (error) {
      console.error('Vote failed:', error);
      core.addNotification(error.message || 'Vote failed', 'error');
      refresh();
    }
  }, [nightId, userRemainingVotes, refresh, core]);

  const unvote = useCallback(async (nominationId) => {
    setSortedNominations(prev => core.optimisticVote(prev, nominationId, false));
    setUserRemainingVotes(prev => prev + 1);
    
    try {
      await api.delete(`/votes/vote/${nominationId}`);
      refresh();
    } catch (error) {
      console.error('Unvote failed:', error);
      core.addNotification(error.message || 'Unvote failed', 'error');
      refresh();
    }
  }, [refresh, core]);

  const initialize = useCallback((votesData, winnerId = null) => {
    winnerRef.current = winnerId;
    const sorted = sortByVotes(votesData.nominations, winnerId);
    core.sortedRef.current = sorted;
    setUserRemainingVotes(votesData.userRemainingVotes);
    setMaxVotesPerUser(votesData.maxVotesPerUser);
    setSortedNominations(sorted);
  }, [core]);

  const setWinner = useCallback((winnerId) => {
    winnerRef.current = winnerId;
    const sorted = sortByVotes(core.sortedRef.current, winnerId);
    core.sortedRef.current = sorted;
    setSortedNominations(sorted);
  }, [core]);

  return {
    sortedNominations,
    userRemainingVotes,
    maxVotesPerUser,
    vote,
    unvote,
    refresh,
    initialize,
    setWinner,
    cancelRerank: core.cancelRerank,
    isPending: core.pendingRef.current
  };
}

export function useMultiVoting() {
  const notifications = useNotifications();
  const { showRankingCountdown, clearRankingCountdown, addNotification, showVotesCast } = notifications;
  
  const [sortedMap, setSortedMap] = useState({});
  const [nightsData, setNightsData] = useState({});
  
  const pendingRef = useRef([]);
  const latestDataRef = useRef({});
  const sortedRef = useRef({});

  const applyNewOrder = useCallback((nightId) => {
    const sorted = sortByVotes(latestDataRef.current[nightId] || []);
    sortedRef.current = { ...sortedRef.current, [nightId]: sorted };
    setSortedMap(prev => ({ ...prev, [nightId]: sorted }));
    pendingRef.current = pendingRef.current.filter(id => id !== nightId);
  }, []);

  const refresh = useCallback(async (nightId) => {
    try {
      const votesData = await api.get(`/votes/movie-night/${nightId}`);
      const newNominations = votesData.nominations;
      const newSorted = sortByVotes(newNominations);
      
      latestDataRef.current[nightId] = newNominations;
      setNightsData(prev => ({
        ...prev,
        [nightId]: { userRemainingVotes: votesData.userRemainingVotes, maxVotesPerUser: votesData.maxVotesPerUser }
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
  }, [showRankingCountdown, applyNewOrder]);

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
      [nightId]: { userRemainingVotes: votesData.userRemainingVotes, maxVotesPerUser: votesData.maxVotesPerUser }
    }));
  }, []);

  const getSorted = useCallback((nightId) => {
    return sortedMap[nightId] || [];
  }, [sortedMap]);

  const getData = useCallback((nightId) => {
    return nightsData[nightId] || { userRemainingVotes: 0, maxVotesPerUser: 0 };
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
