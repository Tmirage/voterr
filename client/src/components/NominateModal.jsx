import { useState, useEffect, useRef } from 'react';
import { Film, Search, X, Check, Grid, List, AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import clsx from 'clsx';

export default function NominateModal({ 
  movieNightId,
  existingNominations = [],
  onNominate,
  onClose 
}) {
  const [library, setLibrary] = useState([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [movieSource, setMovieSource] = useState('plex');
  const [overseerrConfigured, setOverseerrConfigured] = useState(false);
  const [tmdbConfigured, setTmdbConfigured] = useState(false);
  const [tmdbError, setTmdbError] = useState(null);
  const [overseerrError, setOverseerrError] = useState(null);
  const scrollYRef = useRef(window.scrollY);

  useEffect(() => {
    loadLibrary();
    checkExternalSources();
    
    scrollYRef.current = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      window.scrollTo(0, scrollYRef.current);
    };
  }, []);

  async function checkExternalSources() {
    try {
      const [overseerrStatus, tmdbStatus] = await Promise.all([
        api.get('/movies/overseerr/status').catch(() => ({ configured: false })),
        api.get('/movies/tmdb/status').catch(() => ({ configured: false, valid: false }))
      ]);
      setOverseerrConfigured(overseerrStatus.configured);
      setTmdbConfigured(tmdbStatus.configured && tmdbStatus.valid);
      if (tmdbStatus.configured && !tmdbStatus.valid) {
        setTmdbError(tmdbStatus.error || 'TMDB API key is invalid');
      }
    } catch (err) {
      console.error('Failed to check external sources:', err);
    }
  }

  async function loadLibrary() {
    setLoadingLibrary(true);
    try {
      const data = await api.get('/movies/library');
      setLibrary(data);
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setLoadingLibrary(false);
    }
  }

  async function handleSearch(query, source = movieSource) {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setOverseerrError(null);
    try {
      let endpoint = '/movies/search';
      const params = new URLSearchParams({ q: query });
      if (source === 'overseerr' || source === 'tmdb') {
        params.set('source', source);
      }
      const data = await api.get(`${endpoint}?${params.toString()}`);
      const results = Array.isArray(data) ? data : (data.results || []);
      setSearchResults(results);
      
      // Check if Overseerr returned empty results (might be down)
      if (source === 'overseerr' && results.length === 0 && query.length >= 3) {
        // Fetch service status to check if Overseerr is actually down
        try {
          const status = await api.get('/settings/services/status');
          if (status.overseerr?.failed) {
            setOverseerrError('Overseerr is unavailable.');
            window.dispatchEvent(new Event('service-status-changed'));
          }
        } catch {}
      }
    } catch (err) {
      console.error('Search failed:', err);
      if (source === 'overseerr') {
        setOverseerrError('Overseerr search failed.');
      }
    } finally {
      setSearching(false);
    }
  }

  function getFilteredLibrary() {
    if (movieSource !== 'plex') {
      return searchResults;
    }
    if (searchQuery.length >= 2) {
      return searchResults.length > 0 ? searchResults : library.filter(m =>
        m.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return library;
  }

  async function handleNominate(movie) {
    try {
      let mediaType = movieSource;
      if (movieSource === 'plex') {
        mediaType = 'plex';
      } else if (movieSource === 'overseerr' || movieSource === 'tmdb') {
        mediaType = 'tmdb';
      }
      
      await api.post('/votes/nominate', {
        movieNightId,
        ratingKey: movie.ratingKey || null,
        tmdbId: movie.tmdbId || null,
        mediaType,
        title: movie.title,
        year: movie.year,
        posterUrl: movie.posterUrl,
        overview: movie.overview,
        runtime: movie.runtime
      });
      onNominate();
      onClose();
    } catch (err) {
      console.error('Failed to nominate:', err);
    }
  }

  const movies = getFilteredLibrary();

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-xl w-full max-w-4xl h-[calc(100vh-1rem)] sm:h-auto sm:max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg sm:text-xl text-white">Nominate a Movie</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={clsx(
                "p-2 rounded-lg transition-colors",
                viewMode === 'grid' ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
              )}
            >
              <Grid className="h-5 w-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={clsx(
                "p-2 rounded-lg transition-colors",
                viewMode === 'list' ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
              )}
            >
              <List className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white ml-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-4 border-b border-gray-700 space-y-2 sm:space-y-3">
          {tmdbError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>TMDB: {tmdbError}</span>
            </div>
          )}
          {(overseerrConfigured || tmdbConfigured) && (
            <div className="flex gap-2">
              <button
                onClick={() => { setMovieSource('plex'); if (searchQuery.length >= 2) handleSearch(searchQuery, 'plex'); }}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-sm transition-colors",
                  movieSource === 'plex' ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                )}
              >
                Plex Library
              </button>
              {overseerrConfigured && (
                <button
                  onClick={() => { setMovieSource('overseerr'); if (searchQuery.length >= 2) handleSearch(searchQuery, 'overseerr'); }}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-sm transition-colors",
                    movieSource === 'overseerr' ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  )}
                >
                  All Movies (TMDB)
                </button>
              )}
              {tmdbConfigured && !overseerrConfigured && (
                <button
                  onClick={() => { setMovieSource('tmdb'); if (searchQuery.length >= 2) handleSearch(searchQuery, 'tmdb'); }}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-sm transition-colors",
                    movieSource === 'tmdb' ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  )}
                >
                  TMDB
                </button>
              )}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.length >= 2) {
                  handleSearch(e.target.value);
                } else {
                  setSearchResults([]);
                }
              }}
              placeholder={movieSource === 'plex' ? "Search your Plex library..." : "Search all movies..."}
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {loadingLibrary || searching ? (
            <div className="flex items-center justify-center h-full min-h-[300px]">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
          ) : movies.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-gray-400">
              {overseerrError && movieSource === 'overseerr' ? (
                <>
                  <AlertTriangle className="h-12 w-12 mb-4 text-yellow-400" />
                  <p className="text-yellow-400 mb-2">{overseerrError}</p>
                  {tmdbConfigured && (
                    <button
                      onClick={() => { setMovieSource('tmdb'); if (searchQuery.length >= 2) handleSearch(searchQuery, 'tmdb'); }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm"
                    >
                      Switch to TMDB
                    </button>
                  )}
                </>
              ) : (
                <>
                  <Film className="h-12 w-12 mb-4 opacity-50" />
                  <p>{searchQuery.length >= 2 ? 'No movies found' : 'Start typing to search...'}</p>
                </>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
              {movies.map((movie) => {
                const alreadyNominated = existingNominations.some(n => 
                  (movie.ratingKey && n.ratingKey === movie.ratingKey) || 
                  (movie.tmdbId && n.tmdbId === movie.tmdbId)
                );
                return (
                  <button
                    key={movie.ratingKey || movie.tmdbId}
                    onClick={() => !alreadyNominated && handleNominate(movie)}
                    disabled={alreadyNominated}
                    className={clsx(
                      "group relative rounded-lg overflow-hidden transition-transform hover:scale-105",
                      alreadyNominated && "opacity-50"
                    )}
                  >
                    {movie.posterUrl ? (
                      <img src={movie.posterUrl} alt={movie.title} className="w-full aspect-[2/3] object-cover" />
                    ) : (
                      <div className="w-full aspect-[2/3] bg-gray-700 flex items-center justify-center">
                        <Film className="h-8 w-8 text-gray-500" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                      <p className="text-white text-sm truncate">{movie.title}</p>
                      <p className="text-gray-300 text-xs">
                        {movie.year}
                        {movie.voteAverage && (
                          <span className="ml-1 text-yellow-400">TMDB {movie.voteAverage.toFixed(1)}</span>
                        )}
                      </p>
                    </div>
                    {alreadyNominated && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Check className="h-8 w-8 text-indigo-400" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {movies.map((movie) => {
                const alreadyNominated = existingNominations.some(n => 
                  (movie.ratingKey && n.ratingKey === movie.ratingKey) || 
                  (movie.tmdbId && n.tmdbId === movie.tmdbId)
                );
                return (
                  <button
                    key={movie.ratingKey || movie.tmdbId}
                    onClick={() => !alreadyNominated && handleNominate(movie)}
                    disabled={alreadyNominated}
                    className={clsx(
                      "w-full flex gap-4 p-3 rounded-lg text-left transition-colors",
                      alreadyNominated ? "bg-gray-700/50 opacity-50" : "bg-gray-700 hover:bg-gray-600"
                    )}
                  >
                    {movie.posterUrl ? (
                      <img src={movie.posterUrl} alt={movie.title} className="w-12 h-18 object-cover rounded" />
                    ) : (
                      <div className="w-12 h-18 bg-gray-600 rounded flex items-center justify-center">
                        <Film className="h-6 w-6 text-gray-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white truncate">{movie.title}</p>
                      <p className="text-sm text-gray-400">
                        {movie.year}
                        {movie.voteAverage && (
                          <span className="ml-2 text-yellow-400">
                            TMDB {movie.voteAverage.toFixed(1)}
                          </span>
                        )}
                      </p>
                      {movie.overview && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{movie.overview}</p>
                      )}
                      {alreadyNominated && <p className="text-xs text-indigo-400 mt-1">Already nominated</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
