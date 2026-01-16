import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Film } from 'lucide-react';

export default function Login() {
  const { user, loginWithPlex, checkPlexAuth } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const [plexPopup, setPlexPopup] = useState(null);

  async function handlePlexLogin() {
    setLoading(true);
    try {
      const { authUrl } = await loginWithPlex();
      const popup = window.open(authUrl, '_blank', 'width=600,height=700');
      setPlexPopup(popup);
      setPolling(true);
    } catch (error) {
      console.error('Failed to start Plex login:', error);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!polling) return;

    const interval = setInterval(async () => {
      try {
        const result = await checkPlexAuth();
        if (result.authenticated) {
          setPolling(false);
          setLoading(false);
          if (plexPopup && !plexPopup.closed) {
            plexPopup.close();
          }
          setPlexPopup(null);
          navigate('/');
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [polling, checkPlexAuth, navigate, plexPopup]);

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
                {polling ? 'Waiting for Plex...' : 'Connecting...'}
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
