import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { setNotificationCallbacks } from '../lib/api';

interface NotificationItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  service?: string | null;
  circuitOpen?: boolean;
}

interface PlexError {
  message: string;
  details?: string;
}

interface BottomToastState {
  type: string;
}

interface RankingCountdownState {
  seconds: number;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  addNotification: (
    message: string,
    type?: 'success' | 'error' | 'info' | 'warning',
    duration?: number,
    service?: string | null,
    circuitOpen?: boolean
  ) => number;
  removeNotification: (id: number) => void;
  plexError: PlexError | null;
  showPlexError: (error: PlexError) => void;
  clearPlexError: () => void;
  bottomToast: BottomToastState | null;
  showVotesCast: () => void;
  rankingCountdown: RankingCountdownState | null;
  showRankingCountdown: (seconds: number, onComplete: () => void) => void;
  executeRankingNow: () => void;
  clearRankingCountdown: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [plexError, setPlexError] = useState<PlexError | null>(null);
  const [bottomToast, setBottomToast] = useState<BottomToastState | null>(null);
  const [rankingCountdown, setRankingCountdown] = useState<RankingCountdownState | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addNotification = useCallback(
    (
      message: string,
      type: 'success' | 'error' | 'info' | 'warning' = 'info',
      duration = 5000,
      service: string | null = null,
      circuitOpen = false
    ) => {
      const id = Date.now();
      setNotifications((prev) => {
        if (prev.some((n) => n.message === message)) {
          return prev;
        }
        return [...prev, { id, message, type, service, circuitOpen }];
      });
      if (duration > 0) {
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.id !== id));
        }, duration);
      }
      return id;
    },
    []
  );

  const removeNotification = useCallback((id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const showPlexError = useCallback((error: PlexError) => {
    setPlexError(error);
  }, []);

  const clearPlexError = useCallback(() => {
    setPlexError(null);
  }, []);

  const showVotesCast = useCallback(() => {
    setBottomToast({ type: 'votes_cast' });
    setTimeout(() => setBottomToast(null), 3000);
  }, []);

  const onCompleteRef = useRef<(() => void) | null>(null);

  const showRankingCountdown = useCallback((seconds: number, onComplete: () => void) => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    onCompleteRef.current = onComplete;
    setRankingCountdown({ seconds });
    countdownRef.current = setInterval(() => {
      setRankingCountdown((prev) => {
        if (!prev || prev.seconds <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
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
    <NotificationContext.Provider
      value={{
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
        clearRankingCountdown,
      }}
    >
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
