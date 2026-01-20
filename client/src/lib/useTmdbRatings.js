import { useState, useEffect } from 'react';
import { api } from './api';

const cache = new Map();

function getCacheKey(movie) {
  if (movie.tmdbId) return `tmdb:${movie.tmdbId}`;
  return `title:${movie.title}:${movie.year || ''}`;
}

export function useTmdbRatings(movies) {
  const [ratings, setRatings] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!movies || movies.length === 0) {
      return;
    }

    const cachedRatings = {};
    const uncachedMovies = [];
    
    movies.forEach(movie => {
      const key = getCacheKey(movie);
      if (cache.has(key)) {
        cachedRatings[movie.id] = cache.get(key);
      } else {
        uncachedMovies.push(movie);
      }
    });
    
    setRatings(cachedRatings);

    if (uncachedMovies.length === 0) return;

    let cancelled = false;
    setLoading(true);

    async function fetchRatings() {
      const newRatings = { ...cachedRatings };
      
      for (const movie of uncachedMovies) {
        try {
          const endpoint = movie.tmdbId 
            ? `/movies/tmdb/${movie.tmdbId}`
            : `/movies/rating?${new URLSearchParams({ title: movie.title, ...(movie.year && { year: movie.year }) }).toString()}`;
          
          const data = await api.get(endpoint);
          
          if (!cancelled && data?.voteAverage) {
            const key = getCacheKey(movie);
            cache.set(key, data.voteAverage);
            newRatings[movie.id] = data.voteAverage;
          }
        } catch (error) {
          // Silently ignore - movie might not be found
        }
      }

      if (!cancelled) {
        setRatings(newRatings);
        setLoading(false);
      }
    }

    fetchRatings();
    return () => { cancelled = true; };
  }, [movies?.map(m => `${m.id}:${m.tmdbId}:${m.title}:${m.year}`).join(',')]);

  return { ratings, loading };
}
