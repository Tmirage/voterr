import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function PlexLoading() {
  const [searchParams] = useSearchParams();
  
  useEffect(() => {
    const authUrl = searchParams.get('authUrl');
    if (authUrl) {
      window.location.href = authUrl;
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#e5a00d] border-t-transparent mx-auto mb-4" />
        <p className="text-gray-400">Redirecting to Plex...</p>
      </div>
    </div>
  );
}
