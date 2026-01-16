import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState(false);

  useEffect(() => {
    checkSetupAndAuth();
  }, []);

  async function checkSetupAndAuth() {
    try {
      const setupStatus = await api.get('/setup/status');
      setSetupComplete(setupStatus.setupComplete);

      if (setupStatus.setupComplete) {
        const authData = await api.get('/auth/me');
        if (authData.authenticated) {
          setUser(authData.user);
        }
      }
    } catch (error) {
      console.error('Setup/Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loginWithPlex() {
    const data = await api.get('/auth/plex');
    return data;
  }

  async function checkPlexAuth() {
    const data = await api.get('/auth/plex/callback');
    if (data.authenticated) {
      setUser(data.user);
    }
    return data;
  }

  async function logout() {
    await api.post('/auth/logout');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, setupComplete, setSetupComplete, loginWithPlex, checkPlexAuth, logout, setUser }}>
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
