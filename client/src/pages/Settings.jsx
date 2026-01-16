import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Settings as SettingsIcon, Server, Database, Check, X, Loader2, Film, HardDrive, Trash2 } from 'lucide-react';
import clsx from 'clsx';

export default function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    overseerrUrl: '',
    overseerrApiKey: '',
    tautulliUrl: '',
    tautulliApiKey: '',
    tmdbApiKey: '',
    cachePlexImages: false
  });
  const [cacheStats, setCacheStats] = useState(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [testResults, setTestResults] = useState({
    overseerr: null,
    tautulli: null,
    tmdb: null
  });
  const [testing, setTesting] = useState({
    overseerr: false,
    tautulli: false,
    tmdb: false
  });
  const [saveMessage, setSaveMessage] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const settings = await api.get('/settings');
      setConfig({
        overseerrUrl: settings.overseerrUrl || '',
        overseerrApiKey: settings.overseerrApiKey || '',
        tautulliUrl: settings.tautulliUrl || '',
        tautulliApiKey: settings.tautulliApiKey || '',
        tmdbApiKey: settings.tmdbApiKey || '',
        cachePlexImages: settings.cachePlexImages || false
      });
      loadCacheStats();
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      await api.post('/settings', config);
      setSaveMessage({ type: 'success', text: 'Settings saved' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      setSaveMessage({ type: 'error', text: error.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  }

  async function testOverseerr() {
    setTesting(t => ({ ...t, overseerr: true }));
    setTestResults(r => ({ ...r, overseerr: null }));
    try {
      const result = await api.post('/settings/test/overseerr', {
        url: config.overseerrUrl,
        apiKey: config.overseerrApiKey
      });
      setTestResults(r => ({ ...r, overseerr: { success: true, message: 'Connected successfully' } }));
    } catch (error) {
      setTestResults(r => ({ ...r, overseerr: { success: false, message: error.message || 'Connection failed' } }));
    } finally {
      setTesting(t => ({ ...t, overseerr: false }));
    }
  }

  async function testTautulli() {
    setTesting(t => ({ ...t, tautulli: true }));
    setTestResults(r => ({ ...r, tautulli: null }));
    try {
      const result = await api.post('/settings/test/tautulli', {
        url: config.tautulliUrl,
        apiKey: config.tautulliApiKey
      });
      setTestResults(r => ({ ...r, tautulli: { success: true, message: 'Connected successfully' } }));
    } catch (error) {
      setTestResults(r => ({ ...r, tautulli: { success: false, message: error.message || 'Connection failed' } }));
    } finally {
      setTesting(t => ({ ...t, tautulli: false }));
    }
  }

  async function loadCacheStats() {
    try {
      const stats = await api.get('/settings/cache/stats');
      setCacheStats(stats);
    } catch (error) {
      console.error('Failed to load cache stats:', error);
    }
  }

  async function handleClearCache() {
    setClearingCache(true);
    try {
      await api.delete('/settings/cache/clear');
      await loadCacheStats();
    } catch (error) {
      console.error('Failed to clear cache:', error);
    } finally {
      setClearingCache(false);
    }
  }

  async function testTmdb() {
    setTesting(t => ({ ...t, tmdb: true }));
    setTestResults(r => ({ ...r, tmdb: null }));
    try {
      await api.post('/settings/test/tmdb', { apiKey: config.tmdbApiKey });
      setTestResults(r => ({ ...r, tmdb: { success: true, message: 'API key valid' } }));
    } catch (error) {
      setTestResults(r => ({ ...r, tmdb: { success: false, message: error.message || 'Invalid API key' } }));
    } finally {
      setTesting(t => ({ ...t, tmdb: false }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl text-white mb-1">Settings</h1>
        <p className="text-gray-400 text-sm">Configure external services</p>
      </div>

      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-600/20 rounded-lg">
            <Server className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg text-white">Overseerr</h2>
            <p className="text-sm text-gray-400">Browse and nominate any movie from TMDB</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">URL</label>
            <input
              type="text"
              value={config.overseerrUrl}
              onChange={(e) => setConfig({ ...config, overseerrUrl: e.target.value })}
              placeholder="http://localhost:5055"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">API Key</label>
            <input
              type="password"
              value={config.overseerrApiKey}
              onChange={(e) => setConfig({ ...config, overseerrApiKey: e.target.value })}
              placeholder="Your Overseerr API key"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500">Settings → General → API Key</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={testOverseerr}
              disabled={testing.overseerr || !config.overseerrUrl || !config.overseerrApiKey}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {testing.overseerr ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Test Connection'
              )}
            </button>
            {testResults.overseerr && (
              <div className={clsx(
                "flex items-center gap-2 text-sm",
                testResults.overseerr.success ? "text-green-400" : "text-red-400"
              )}>
                {testResults.overseerr.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {testResults.overseerr.message}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-600/20 rounded-lg">
            <Database className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg text-white">Tautulli</h2>
            <p className="text-sm text-gray-400">Track watch history to show who has seen movies</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">URL</label>
            <input
              type="text"
              value={config.tautulliUrl}
              onChange={(e) => setConfig({ ...config, tautulliUrl: e.target.value })}
              placeholder="http://localhost:8181"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">API Key</label>
            <input
              type="password"
              value={config.tautulliApiKey}
              onChange={(e) => setConfig({ ...config, tautulliApiKey: e.target.value })}
              placeholder="Your Tautulli API key"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500">Settings → Web Interface → API Key</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={testTautulli}
              disabled={testing.tautulli || !config.tautulliUrl || !config.tautulliApiKey}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {testing.tautulli ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Test Connection'
              )}
            </button>
            {testResults.tautulli && (
              <div className={clsx(
                "flex items-center gap-2 text-sm",
                testResults.tautulli.success ? "text-green-400" : "text-red-400"
              )}>
                {testResults.tautulli.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {testResults.tautulli.message}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-green-600/20 rounded-lg">
            <Film className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <h2 className="text-lg text-white">TMDB</h2>
            <p className="text-sm text-gray-400">Fallback for movie search when Overseerr is not configured</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">API Key</label>
            <input
              type="password"
              value={config.tmdbApiKey}
              onChange={(e) => setConfig({ ...config, tmdbApiKey: e.target.value })}
              placeholder="Your TMDB API key"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Get a free API key at themoviedb.org/settings/api
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={testTmdb}
              disabled={testing.tmdb || !config.tmdbApiKey}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {testing.tmdb ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Test API Key'
              )}
            </button>
            {testResults.tmdb && (
              <div className={clsx(
                "flex items-center gap-2 text-sm",
                testResults.tmdb.success ? "text-green-400" : "text-red-400"
              )}>
                {testResults.tmdb.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {testResults.tmdb.message}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-orange-600/20 rounded-lg">
            <HardDrive className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg text-white">Image Cache</h2>
            <p className="text-sm text-gray-400">Cache Plex movie images locally to reduce bandwidth</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white">Cache Plex Images</p>
              <p className="text-sm text-gray-400">Store movie posters locally instead of fetching from Plex</p>
            </div>
            <button
              onClick={() => setConfig({ ...config, cachePlexImages: !config.cachePlexImages })}
              className={clsx(
                "relative w-12 h-6 rounded-full transition-colors",
                config.cachePlexImages ? "bg-indigo-600" : "bg-gray-600"
              )}
            >
              <span
                className={clsx(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                  config.cachePlexImages ? "left-7" : "left-1"
                )}
              />
            </button>
          </div>

          {cacheStats && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-700">
              <div>
                <p className="text-sm text-gray-400">
                  {cacheStats.count} images cached ({cacheStats.sizeMB} MB)
                </p>
              </div>
              <button
                onClick={handleClearCache}
                disabled={clearingCache || cacheStats.count === 0}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {clearingCache ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Clear Cache
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </button>
        {saveMessage && (
          <div className={clsx(
            "flex items-center gap-2 text-sm",
            saveMessage.type === 'success' ? "text-green-400" : "text-red-400"
          )}>
            {saveMessage.type === 'success' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            {saveMessage.text}
          </div>
        )}
      </div>
    </div>
  );
}
