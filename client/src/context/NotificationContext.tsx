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
  secondsLeft: number;
  onComplete: () => Promise<void> | void;
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
  showRankingCountdown: (onComplete: () => Promise<void> | void) => void;
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
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef<(() => Promise<void> | void) | null>(null);

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

  const clearRankingCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (countdownTimeoutRef.current) {
      clearTimeout(countdownTimeoutRef.current);
      countdownTimeoutRef.current = null;
    }
    onCompleteRef.current = null;
    setRankingCountdown(null);
  }, []);

  const showRankingCountdown = useCallback(
    (onComplete: () => Promise<void> | void) => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (countdownTimeoutRef.current) {
        clearTimeout(countdownTimeoutRef.current);
      }
      onCompleteRef.current = onComplete;
      
      let secondsLeft = 4;
      setRankingCountdown({ secondsLeft, onComplete });

      countdownIntervalRef.current = setInterval(() => {
        secondsLeft -= 1;
        if (secondsLeft < 0) {
          clearInterval(countdownIntervalRef.current!);
          countdownIntervalRef.current = null;
        } else {
          setRankingCountdown({ secondsLeft, onComplete: onCompleteRef.current! });
        }
      }, 1000);

      countdownTimeoutRef.current = setTimeout(async () => {
        countdownTimeoutRef.current = null;
        const callback = onCompleteRef.current;
        onCompleteRef.current = null;
        await callback?.();
        setRankingCountdown({ secondsLeft: -1, onComplete: () => {} });
        setTimeout(() => setRankingCountdown(null), 1500);
      }, 5000);
    },
    []
  );

  useEffect(() => {
    setNotificationCallbacks(addNotification);
    return () => {
      setNotificationCallbacks(null);
      if (countdownTimeoutRef.current) {
        clearTimeout(countdownTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [addNotification]);

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
