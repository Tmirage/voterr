import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';

export default function PlexErrorModal() {
  const { plexError, clearPlexError } = useNotifications();

  useEffect(() => {
    if (plexError) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [plexError]);

  if (!plexError) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-red-600/20 rounded-full">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <h2 className="text-xl text-white">Plex Connection Error</h2>
        </div>
        
        <p className="text-gray-300 mb-4">
          Unable to connect to Plex. This could be due to:
        </p>
        
        <ul className="text-sm text-gray-400 space-y-2 mb-6">
          <li className="flex items-start gap-2">
            <span className="text-gray-500">•</span>
            Plex server is offline or unreachable
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-500">•</span>
            Network connectivity issues
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-500">•</span>
            Plex token has expired (try logging in again)
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-500">•</span>
            Request timed out (server may be slow)
          </li>
        </ul>

        {plexError.details && (
          <div className="mb-6 p-3 bg-gray-900 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Error details:</p>
            <p className="text-sm text-red-400 font-mono">{plexError.details}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
          <Link
            to="/settings"
            onClick={clearPlexError}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
        
        <button
          onClick={clearPlexError}
          className="mt-3 w-full px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
