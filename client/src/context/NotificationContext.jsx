import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { setNotificationCallbacks } from '../lib/api';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [plexError, setPlexError] = useState(null);
  const [bottomToast, setBottomToast] = useState(null);
  const [rankingCountdown, setRankingCountdown] = useState(null);
  const countdownRef = useRef(null);

  const addNotification = useCallback((message, type = 'info', duration = 5000, service = null, circuitOpen = false) => {
    const id = Date.now();
    setNotifications(prev => {
      if (prev.some(n => n.message === message)) {
        return prev;
      }
      return [...prev, { id, message, type, service, circuitOpen }];
    });
    if (duration > 0) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const showPlexError = useCallback((error) => {
    setPlexError(error);
  }, []);

  const clearPlexError = useCallback(() => {
    setPlexError(null);
  }, []);

  const showVotesCast = useCallback(() => {
    setBottomToast({ type: 'votes_cast' });
    setTimeout(() => setBottomToast(null), 3000);
  }, []);

  const onCompleteRef = useRef(null);
  
  const showRankingCountdown = useCallback((seconds, onComplete) => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    onCompleteRef.current = onComplete;
    setRankingCountdown({ seconds });
    countdownRef.current = setInterval(() => {
      setRankingCountdown(prev => {
        if (!prev || prev.seconds <= 1) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
          setTimeout(() => {
            if (onCompleteRef.current) {
              onCompleteRef.current();
              onCompleteRef.current = null;
            }
          }, 0);
          return null;
        }
        return { ...prev, seconds: prev.seconds - 1 };
      });
    }, 1000);
  }, []);

  const executeRankingNow = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setRankingCountdown(null);
    if (onCompleteRef.current) {
      onCompleteRef.current();
      onCompleteRef.current = null;
    }
  }, []);

  const clearRankingCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    onCompleteRef.current = null;
    setRankingCountdown(null);
  }, []);

  useEffect(() => {
    setNotificationCallbacks(addNotification, showPlexError);
    return () => setNotificationCallbacks(null, null);
  }, [addNotification, showPlexError]);

  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ 
      notifications, 
      addNotification, 
      removeNotification,
      plexError,
      showPlexError,
      clearPlexError,
      bottomToast,
      showVotesCast,
      rankingCountdown,
      showRankingCountdown,
      executeRankingNow,
      clearRankingCountdown
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}
