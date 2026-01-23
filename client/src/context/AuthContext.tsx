import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api } from '../lib/api';

interface User {
  id: number;
  username: string;
  email: string;
  avatarUrl: string;
  isAdmin: boolean;
  isAppAdmin: boolean;
  isLocal: boolean;
  isLocalInvite?: boolean;
  localInviteMovieNightId?: number;
  plexId: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  setupComplete: boolean;
  setSetupComplete: (value: boolean) => void;
  loginWithPlex: (forwardUrl?: string | null) => Promise<{ authUrl: string; pinId: number }>;
  checkPlexAuth: () => Promise<{ authenticated: boolean; user?: User }>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState(false);

  useEffect(() => {
    checkSetupAndAuth();
  }, []);

  async function checkSetupAndAuth() {
    try {
      const setupStatus = await api.get<{ setupComplete: boolean }>('/setup/status');
      setSetupComplete(setupStatus.setupComplete);

      if (setupStatus.setupComplete) {
        const authData = await api.get<{ authenticated: boolean; user?: User }>('/auth/me');
        if (authData.authenticated && authData.user) {
          setUser(authData.user);
        }
      }
    } catch (err: unknown) {
      console.error('Setup/Auth check failed:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loginWithPlex(
    forwardUrl: string | null = null
  ): Promise<{ authUrl: string; pinId: number }> {
    const url = forwardUrl
      ? `/auth/plex?forwardUrl=${encodeURIComponent(forwardUrl)}`
      : '/auth/plex';
    const data = await api.get<{ authUrl: string; pinId: number }>(url);
    return data;
  }

  async function checkPlexAuth(): Promise<{ authenticated: boolean; user?: User }> {
    const data = await api.get<{ authenticated: boolean; user?: User }>('/auth/plex/callback');
    if (data.authenticated && data.user) {
      setUser(data.user);
    }
    return data;
  }

  async function logout() {
    await api.post('/auth/logout');
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        setupComplete,
        setSetupComplete,
        loginWithPlex,
        checkPlexAuth,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
