import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import PlexOAuth from '../lib/plexOAuth';
import { Film } from 'lucide-react';

const plexOAuth = new PlexOAuth();

export default function Login() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  async function handlePlexLogin() {
    setLoading(true);
    setError(null);
    
    try {
      // Prepare popup first (avoids popup blocker)
      plexOAuth.preparePopup();
      
      // Start OAuth flow - this polls until we get a token
      const authToken = await plexOAuth.login();
      
      // Send token to backend to create session
      const userData = await api.post('/auth/plex', { authToken });
      
      setUser(userData);
      navigate('/');
    } catch (err) {
      console.error('Plex login failed:', err);
      if (err.message !== 'Login cancelled') {
        setError(err.message || 'Login failed');
      }
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Film className="h-12 w-12 text-indigo-500" />
            <h1 className="text-4xl text-white">Voterr</h1>
          </div>
          <p className="text-gray-400">
            Vote for your next movie night
          </p>
        </div>

        <div className="bg-gray-800 rounded-xl p-8 shadow-xl">
          <button
            onClick={handlePlexLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-[#e5a00d] hover:bg-[#cc8f0c] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 px-4 rounded-lg transition-colors"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-black border-t-transparent" />
                Waiting for Plex...
              </>
            ) : (
              <>
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Sign in with Plex
              </>
            )}
          </button>

          <p className="mt-4 text-center text-sm text-gray-400">
            Sign in with your Plex account to get started
          </p>
        </div>
      </div>
    </div>
  );
}
